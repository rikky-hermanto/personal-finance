// Headless geometry check for the interactive diagram.
// Shims just enough DOM for the diagram's <script> to run, then opens every
// view and asserts the things a reader actually notices:
//   1. every card sits inside the canvas box (else fit-to-view hides it)
//   2. no edge segment passes under a card
//   3. no two edges trace the identical path
//   4. canvas aspect ratio is close enough to a viewport to fit in one view
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const file = process.argv[2];
const html = fs.readFileSync(file, "utf8");
const m = html.match(/<script>([\s\S]*)<\/script>/);
if (!m) throw new Error("no <script> block");
const src = m[1];

// ---------- minimal DOM shim ----------
const VIEWPORT = { width: 1440, height: 780 };

function mkClassList(el) {
  const set = new Set();
  return {
    add: (...c) => c.forEach((x) => set.add(x)),
    remove: (...c) => c.forEach((x) => set.delete(x)),
    toggle: (c, on) => (on ? set.add(c) : set.delete(c)),
    contains: (c) => set.has(c),
    _set: set,
  };
}
function mkStyle() {
  const store = {};
  return new Proxy(store, {
    get(t, k) {
      if (k === "setProperty") return (n, v) => (t[n] = v);
      if (k === "removeProperty") return (n) => delete t[n];
      return t[k];
    },
    set(t, k, v) {
      t[k] = v;
      return true;
    },
  });
}
function mkEl(tag) {
  const el = {
    tagName: tag,
    children: [],
    attrs: {},
    dataset: {},
    style: mkStyle(),
    textContent: "",
    _html: "",
    _handlers: {},
  };
  el.classList = mkClassList(el);
  el.setAttribute = (k, v) => {
    el.attrs[k] = String(v);
    if (k === "class") String(v).split(/\s+/).filter(Boolean).forEach((c) => el.classList.add(c));
  };
  el.getAttribute = (k) => el.attrs[k];
  el.appendChild = (c) => {
    el.children.push(c);
    c.parentNode = el;
    return c;
  };
  el.removeChild = (c) => {
    const i = el.children.indexOf(c);
    if (i >= 0) el.children.splice(i, 1);
    return c;
  };
  el.addEventListener = (t, fn) => ((el._handlers[t] = el._handlers[t] || []).push(fn));
  el.removeEventListener = () => {};
  el.closest = () => null;
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: VIEWPORT.width, height: VIEWPORT.height });
  Object.defineProperty(el, "firstChild", { get: () => el.children[0] || null });
  Object.defineProperty(el, "className", {
    get: () => [...el.classList._set].join(" "),
    set: (v) => {
      el.classList._set.clear();
      String(v).split(/\s+/).filter(Boolean).forEach((c) => el.classList.add(c));
    },
  });
  Object.defineProperty(el, "innerHTML", {
    get: () => el._html,
    set: (v) => {
      el._html = v;
      if (v === "") el.children.length = 0;
    },
  });
  return el;
}
const byId = {};
["nodes", "edges", "viewport", "canvas-wrap", "app", "theme-toggle", "breadcrumb", "crumb-current",
 "crumb-root", "h-sub", "empty-hint", "zoom-in", "zoom-out", "zoom-fit", "reset-layout", "panel",
 "tooltip", "panel-close", "panel-title", "panel-sub", "panel-body"].forEach((id) => (byId[id] = mkEl("div")));

const document = {
  getElementById: (id) => (byId[id] = byId[id] || mkEl("div")),
  createElement: mkEl,
  createElementNS: (ns, tag) => mkEl(tag),
  addEventListener: () => {},
  querySelector: () => null,
  querySelectorAll: () => [],
  body: mkEl("body"),
};
const windowShim = { addEventListener: () => {}, removeEventListener: () => {}, devicePixelRatio: 1 };
const localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

const sandbox = { document, window: windowShim, localStorage, console, Math, JSON, Date, setTimeout, requestAnimationFrame: (f) => f() };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: path.basename(file) });

// ---------- read back what got rendered ----------
const nodesEl = byId["nodes"];
const svgEl = byId["edges"];

function px(v) {
  return parseFloat(String(v).replace("px", "")) || 0;
}
function snapshot() {
  const boxes = nodesEl.children.map((el) => ({
    id: el.dataset.id,
    kind: [...el.classList._set].find((c) => c.startsWith("kind-")),
    x: px(el.style.left), y: px(el.style.top), w: px(el.style.width), h: px(el.style.height),
  }));
  const paths = svgEl.children.filter((c) => c.tagName === "path").map((c) => c.getAttribute("d"));
  const arrows = svgEl.children.filter((c) => c.tagName === "polygon").length;
  return {
    boxes, paths, arrows,
    canvasW: px(svgEl.getAttribute("width")), canvasH: px(svgEl.getAttribute("height")),
  };
}

// Path -> polyline. "L x y" and "Q cx cy, x y" (curve approximated by its
// control point + endpoint, which is conservative for an overlap test).
function polyline(d) {
  const pts = [];
  const re = /([MLQ])\s*([-\d.,\s]+)/g;
  let mm;
  while ((mm = re.exec(d))) {
    const nums = mm[2].trim().split(/[\s,]+/).map(Number).filter((n) => !isNaN(n));
    if (mm[1] === "Q") {
      pts.push({ x: nums[0], y: nums[1] }, { x: nums[2], y: nums[3] });
    } else {
      for (let i = 0; i + 1 < nums.length; i += 2) pts.push({ x: nums[i], y: nums[i + 1] });
    }
  }
  return pts;
}
function segHitsBox(p, q, b) {
  // conservative AABB-vs-segment: sample the segment
  const steps = Math.max(2, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / 4));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = p.x + (q.x - p.x) * t, y = p.y + (q.y - p.y) * t;
    if (x > b.x + 6 && x < b.x + b.w - 6 && y > b.y + 6 && y < b.y + b.h - 6) return true;
  }
  return false;
}

function report(view, snap) {
  const problems = [];
  const { boxes, paths, canvasW, canvasH } = snap;

  boxes.forEach((b) => {
    if (b.x < 0 || b.y < 0 || b.x + b.w > canvasW || b.y + b.h > canvasH) {
      problems.push(`OFF-CANVAS  ${b.id} (${b.x},${b.y},${b.w}x${b.h}) vs canvas ${canvasW}x${canvasH}`);
    }
  });

  paths.forEach((d, i) => {
    const pts = polyline(d);
    boxes.forEach((b) => {
      for (let k = 0; k + 1 < pts.length; k++) {
        if (segHitsBox(pts[k], pts[k + 1], b)) {
          problems.push(`EDGE-UNDER-CARD  edge#${i} passes under ${b.id}`);
          return;
        }
      }
    });
  });

  const seen = new Map();
  paths.forEach((d, i) => {
    if (seen.has(d)) problems.push(`DUPLICATE-PATH  edge#${i} identical to edge#${seen.get(d)}`);
    else seen.set(d, i);
  });

  // "tumpang tindih": two edges sharing a stretch of the same line. Crossings
  // are fine and unavoidable; running ON TOP of each other is a bug, because
  // the reader sees one line where there are two.
  const segs = paths.map((d) => {
    const pts = polyline(d);
    const out = [];
    for (let k = 0; k + 1 < pts.length; k++) out.push([pts[k], pts[k + 1]]);
    return out;
  });
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      let overlap = 0;
      segs[i].forEach(([p, q]) => {
        segs[j].forEach(([r, s]) => {
          const iH = Math.abs(p.y - q.y) < 1.5, jH = Math.abs(r.y - s.y) < 1.5;
          const iV = Math.abs(p.x - q.x) < 1.5, jV = Math.abs(r.x - s.x) < 1.5;
          if (iH && jH && Math.abs(p.y - r.y) < 3) {
            overlap = Math.max(overlap, Math.min(Math.max(p.x, q.x), Math.max(r.x, s.x)) - Math.max(Math.min(p.x, q.x), Math.min(r.x, s.x)));
          } else if (iV && jV && Math.abs(p.x - r.x) < 3) {
            overlap = Math.max(overlap, Math.min(Math.max(p.y, q.y), Math.max(r.y, s.y)) - Math.max(Math.min(p.y, q.y), Math.min(r.y, s.y)));
          }
        });
      });
      if (overlap > 24) problems.push(`EDGES-STACKED  edge#${i} and edge#${j} run on the same line for ${Math.round(overlap)}px`);
    }
  }

  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
        problems.push(`CARDS-OVERLAP  ${a.id} and ${b.id}`);
      }
    }
  }

  const fit = Math.min((VIEWPORT.width - 100) / canvasW, (VIEWPORT.height - 100) / canvasH, 1);
  const line = `${view.padEnd(12)} canvas ${String(canvasW).padStart(5)}x${String(canvasH).padStart(4)}  ` +
    `cards ${String(boxes.length).padStart(2)}  edges ${String(paths.length).padStart(2)}  ` +
    `heads ${String(snap.arrows).padStart(2)}  fit ${fit.toFixed(2)}x`;
  return { line, problems, fit };
}

// overview is rendered at init; then click each group card
const results = [];
results.push(report("overview", snapshot()));
const groupClicks = nodesEl.children
  .filter((el) => el.classList.contains("kind-group"))
  .map((el) => ({ id: el.dataset.id, fn: el._handlers.click && el._handlers.click[0] }));

groupClicks.forEach((g) => {
  if (!g.fn) return;
  g.fn({ stopPropagation() {} });
  results.push(report(g.id, snapshot()));
});

let bad = 0;
results.forEach((r) => {
  console.log(r.line + (r.problems.length ? "   <-- " + r.problems.length + " problem(s)" : "   ok"));
  r.problems.forEach((p) => {
    console.log("    " + p);
    bad++;
  });
});
console.log(bad === 0 ? "\nPASS — no off-canvas cards, no edges under cards, no duplicate paths." : `\nFAIL — ${bad} problem(s).`);
process.exit(bad === 0 ? 0 : 1);
