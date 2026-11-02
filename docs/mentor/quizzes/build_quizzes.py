"""Compile the Knowledge Check quizzes from the PF-AI learning plans.

Reads the `## 📝 Knowledge Check` section of every English learning plan and writes:
  - one HTML quiz per topic (one question at a time; clicking an option reveals the answer)
  - index.html linking every topic
  - ai-learning-quizzes.apkg, one Anki subdeck per topic

Run from anywhere:  py -3.11 docs/mentor/quizzes/build_quizzes.py
Needs genanki (pip install genanki). Re-running updates the same Anki notes (stable GUIDs).
"""

from __future__ import annotations

import hashlib
import html
import json
import re
import sys
from pathlib import Path

import genanki

OUT_DIR = Path(__file__).resolve().parent
REPO = OUT_DIR.parents[2]
PLAN_DIRS = ["plans/done/learning", "plans/in-progress/learning", "plans/backlog/learning"]
QUIZ_HEADING = "## 📝 Knowledge Check"

# Fixed IDs so a re-import updates the existing deck and notes instead of duplicating them.
MODEL_ID = 1730500001
ROOT_DECK_ID = 1730500100
DECK_ROOT = "AI Learning"


# ---------- parsing ----------

def inline(md: str) -> str:
    """Render the inline Markdown the quizzes use: `code`, **bold**, *italic*."""
    parts = re.split(r"(`[^`]+`)", md)
    out = []
    for part in parts:
        if part.startswith("`") and part.endswith("`") and len(part) > 1:
            out.append("<code>" + html.escape(part[1:-1]) + "</code>")
            continue
        text = html.escape(part, quote=False)
        text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
        text = re.sub(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])", r"<em>\1</em>", text)
        out.append(text)
    return "".join(out)


def plan_sort_key(path: Path) -> tuple:
    m = re.match(r"PF-AI(\d+)", path.name)
    return (int(m.group(1)) if m else 999, "PART" in path.name, path.name)


def find_plans() -> list[Path]:
    plans = []
    for d in PLAN_DIRS:
        for p in (REPO / d).glob("PF-AI*.md"):
            if re.search(r"-id(-v\d+)?\.md$", p.name):  # Indonesian copies repeat the English quiz
                continue
            if QUIZ_HEADING in p.read_text(encoding="utf-8"):
                plans.append(p)
    return sorted(plans, key=plan_sort_key)


def parse_plan(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    h1 = next(line for line in text.splitlines() if line.startswith("# "))[2:].strip()
    plan_id, _, title = h1.partition(" — ")
    slug = re.sub(r"-todo$", "", path.stem).lower()

    section = text.split(QUIZ_HEADING, 1)[1]
    section = re.split(r"^## ", section, maxsplit=1, flags=re.M)[0]
    blocks = re.split(r"^### ", section, flags=re.M)[1:]

    questions = [parse_question(b, plan_id, path) for b in blocks]
    return {
        "id": plan_id.strip(),
        "title": title.strip() or plan_id.strip(),
        "slug": slug,
        "status": path.parent.parent.name,
        "source": path.relative_to(REPO).as_posix(),
        "questions": questions,
    }


def parse_question(block: str, plan_id: str, path: Path) -> dict:
    lines = block.strip("\n").splitlines()
    m = re.match(r"(\d+)\.\s+(.+?)(?:\s+\(([^)]*)\))?\s*$", lines[0])
    if not m:
        sys.exit(f"{path.name}: cannot parse question heading: {lines[0]!r}")
    number, title, certs = int(m.group(1)), m.group(2), m.group(3) or ""

    body, details = block.split("<details>", 1)
    details = details.split("</details>", 1)[0]

    scenario, prompt, options, current = [], [], [], None
    for line in body.splitlines()[1:]:
        s = line.strip()
        if not s:
            current = None if current in ("scenario", "prompt") else current
            continue
        om = re.match(r"- \*\*([A-D])\.\*\*\s*(.*)", s)
        if om:
            options.append({"id": om.group(1), "text": om.group(2)})
            current = "option"
        elif s.startswith("*Scenario:*"):
            scenario.append(s[len("*Scenario:*"):].strip())
            current = "scenario"
        elif s.startswith("*Question:*"):
            prompt.append(s[len("*Question:*"):].strip())
            current = "prompt"
        elif current == "option":
            options[-1]["text"] += " " + s
        elif current == "prompt":
            prompt.append(s)
        else:
            scenario.append(s)
            current = "scenario"

    detail_lines = [l.strip() for l in details.splitlines()
                    if l.strip() and not l.strip().startswith("<summary")]
    maps = ""
    explanation = []
    for l in detail_lines:
        mm = re.match(r"\*Maps to:\s*(.+?)\*$", l)
        if mm:
            maps = mm.group(1)
        else:
            explanation.append(l)
    first = " ".join(explanation)
    am = re.match(r"\*\*([A-D])\*\*\s*[—–-]\s*(.*)", first)
    if not am:
        sys.exit(f"{path.name} Q{number}: cannot find answer letter")
    answer, rationale = am.group(1), am.group(2)
    rationale = rationale[:1].upper() + rationale[1:]

    if not prompt:  # some questions fold the question into the scenario line
        prompt, scenario = scenario, []
    if len(options) != 4 or answer not in {o["id"] for o in options}:
        sys.exit(f"{path.name} Q{number}: expected 4 options containing the answer")

    return {
        "id": f"q{number}",
        "number": number,
        "title": inline(title),
        "certs": certs,
        "scenario": inline(" ".join(scenario)),
        "prompt": inline(" ".join(prompt)),
        "options": [{"id": o["id"], "html": inline(o["text"])} for o in options],
        "answer": answer,
        "explanation": inline(rationale),
        "maps": inline(maps),
    }


# ---------- HTML ----------

STYLE = """
:root{color-scheme:dark;--bg:#1d1d1f;--panel:#111113;--border:#353538;--text:#ececef;--muted:#aaaab4;--purple:#8985ff;--blue:#247cba;--green:#44c79a;--red:#e08188}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.65 system-ui,-apple-system,"Segoe UI",sans-serif}
button{font:inherit;border:1px solid transparent;border-radius:5px;cursor:pointer;padding:9px 19px;line-height:1.5;font-weight:600}
button:disabled{opacity:.42;cursor:default}
button:not(:disabled):hover{filter:brightness(1.12)}
:focus-visible{outline:3px solid var(--purple);outline-offset:3px}
a{color:var(--purple);text-underline-offset:4px}
code{font-family:"Cascadia Code",Consolas,monospace;font-size:.86em;background:#242426;border:1px solid #444448;border-radius:4px;padding:1px 5px;overflow-wrap:anywhere}
h1,h2,h3,p{margin-top:0}
.app{max-width:820px;margin:auto;padding:24px 16px 32px;display:flex;flex-direction:column;gap:20px;min-height:100dvh}
.masthead{padding:20px 22px 22px;background:var(--panel);border:1px solid #29292d;border-radius:8px}
.crumb{font-size:12px;color:var(--muted);letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px}
.crumb a{color:var(--muted)}
.topline{display:flex;gap:16px;align-items:baseline;justify-content:space-between;margin-bottom:12px}
h1{margin:0;color:var(--purple);font-size:22px;line-height:1.35}
.count{flex-shrink:0;font-variant-numeric:tabular-nums;color:var(--muted);font-size:14px}
progress{display:block;width:100%;height:8px;appearance:none;border:0;border-radius:20px;overflow:hidden;background:#3a3a3f}
progress::-webkit-progress-bar{background:#3a3a3f}
progress::-webkit-progress-value{background:var(--green);transition:width .2s}
progress::-moz-progress-bar{background:var(--green)}
.quiz{background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:28px clamp(18px,4vw,38px)}
.toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:20px}
.eyebrow{color:var(--muted);font-size:12px;letter-spacing:.1em;text-transform:uppercase}
.plain{color:var(--muted);background:transparent;border-color:#424247;font-size:12px;padding:5px 10px}
.qcount{margin-bottom:4px;font-size:12px;color:var(--purple);font-weight:600;letter-spacing:.06em}
.certs{font-size:12px;color:var(--muted);margin-bottom:16px}
.scenario{padding:13px 16px;background:#202023;border-left:3px solid var(--purple);border-radius:0 5px 5px 0;margin:0 0 18px;font-size:15px;color:#d6d6dc}
.scenario b{color:var(--muted);font-size:11px;letter-spacing:.1em;text-transform:uppercase;display:block;margin-bottom:2px}
.prompt{font-size:18px;font-weight:500;margin-bottom:18px;line-height:1.55}
.options{display:flex;flex-direction:column;gap:9px;margin-bottom:6px}
.option{display:flex;gap:12px;align-items:flex-start;text-align:left;width:100%;background:#18181b;color:var(--text);border:1px solid #33333a;border-radius:7px;padding:12px 14px;font-weight:400}
.option:not(:disabled):hover{background:#202028;border-color:#5b5795;filter:none}
.option:disabled{opacity:1;cursor:default}
.option .letter{flex:none;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;background:#2c2c33;font-weight:700;font-size:13px}
.option .txt{flex:1;min-width:0}
.option.correct{background:#162b24;border-color:#3d9c7b}
.option.correct .letter{background:var(--green);color:#092219}
.option.wrong{background:#302022;border-color:#a66470}
.option.wrong .letter{background:var(--red);color:#2a0d10}
.option.dim{opacity:.55}
.mark{display:block;font-size:12px;font-weight:600;margin-top:3px;color:#72e2b9}
.wrong .mark{color:#ffc0c5}
.hint{color:var(--muted);font-size:12px;margin:14px 0 0}
.feedback{background:#e9f8f1;color:#176a52;border-left:4px solid var(--green);padding:15px 18px;border-radius:3px;margin:18px 0 20px;font-size:15px}
.feedback.incorrect{background:#fff0ee;color:#863a42;border-left-color:var(--red)}
.feedback h3{font-size:15px;margin:0 0 6px}
.feedback p{margin:0 0 8px}.feedback p:last-child{margin:0}
.feedback .maps{font-size:12px;opacity:.85}
.feedback code{color:inherit;background:#ffffff80;border-color:#00000020}
.actions{display:flex;gap:11px;flex-wrap:wrap;align-items:center}
.primary{background:var(--green);color:#092219}
.secondary{background:#29292e;color:var(--text);border-color:#51515a}
.score{color:var(--muted);font-size:12px;margin-top:20px}
.big{font-size:56px;line-height:1.2;letter-spacing:-.04em;color:var(--green);font-weight:700;margin:12px 0}
.review{border-top:1px solid var(--border);padding:14px 0}
.review summary{cursor:pointer;display:flex;gap:10px;align-items:baseline;font-size:14px}
.review .st{color:var(--green);font-weight:650;font-size:12px;flex:none}
.review .st.missed{color:#efa4ac}
.review p{font-size:14px;margin:10px 0 0}
.foot{color:#91919d;font-size:11px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
.foot a{color:#aaa7e9}
.topics{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:10px}
.topics a{display:flex;justify-content:space-between;gap:16px;align-items:baseline;background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:15px 18px;text-decoration:none;color:var(--text)}
.topics a:hover{border-color:#5b5795}
.topics .id{color:var(--purple);font-weight:650;font-size:13px;margin-right:8px}
.topics .meta{color:var(--muted);font-size:12px;flex:none}
.lede{color:var(--muted);font-size:14px;margin:8px 0 0}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
"""

QUIZ_PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>{page_title}</title>
<style>{style}</style>
</head>
<body>
<div class="app">
  <header class="masthead">
    <div class="crumb"><a href="index.html">AI Learning quizzes</a> · {plan_id}</div>
    <div class="topline"><h1>{title}</h1><span class="count" id="count"></span></div>
    <progress id="progress" value="0" max="1" aria-label="Questions answered"></progress>
  </header>
  <main class="quiz" id="panel">
    <div class="toolbar"><span class="eyebrow" id="round">Knowledge check</span><button class="plain" id="restart" type="button">Restart</button></div>
    <div id="content"></div>
    <noscript><p>Enable JavaScript to take this quiz.</p></noscript>
  </main>
  <footer class="foot"><span>Source: <a href="{source_href}">{source_name}</a></span><span>Keys: A–D answer · → next · ← previous</span></footer>
</div>
<script type="application/json" id="data">{data}</script>
<script>
(() => {{
  const Q = JSON.parse(document.getElementById('data').textContent);
  const $ = id => document.getElementById(id);
  const content = $('content');
  let ids, index, answers, done, review;

  function start(sel, isReview) {{ ids = sel; index = 0; answers = {{}}; done = false; review = isReview; render('prompt'); }}
  const byId = id => Q.find(q => q.id === id);
  const stats = () => {{
    const answered = ids.filter(id => id in answers);
    const missed = answered.filter(id => answers[id] !== byId(id).answer);
    return {{ answered: answered.length, correct: answered.length - missed.length, total: ids.length, missed }};
  }};

  function render(focusId) {{
    const s = stats();
    $('count').textContent = s.answered + ' / ' + s.total + (review ? ' reviewed' : ' answered');
    $('progress').max = s.total; $('progress').value = s.answered;
    $('round').textContent = review ? 'Review round · missed questions' : 'Knowledge check · ' + Q.length + ' questions';
    done ? renderResults(s) : renderQuestion(s);
    const el = focusId && $(focusId); if (el) el.focus({{ preventScroll: true }});
  }}

  function renderQuestion(s) {{
    const q = byId(ids[index]);
    const picked = answers[q.id];
    const locked = picked !== undefined;
    const ok = picked === q.answer;
    const opts = q.options.map(o => {{
      let cls = '', mark = '';
      if (locked) {{
        if (o.id === q.answer) {{ cls = ' correct'; mark = o.id === picked ? 'Your answer · correct' : 'Correct answer'; }}
        else if (o.id === picked) {{ cls = ' wrong'; mark = 'Your answer'; }}
        else cls = ' dim';
      }}
      return '<button type="button" class="option' + cls + '" data-id="' + o.id + '"' + (locked ? ' disabled' : '') + '><span class="letter">' + o.id + '</span><span class="txt">' + o.html + (mark ? '<span class="mark">' + mark + '</span>' : '') + '</span></button>';
    }}).join('');
    const prev = '<button class="secondary" id="prev" type="button"' + (index === 0 ? ' disabled' : '') + '>Previous</button>';
    content.innerHTML =
      '<p class="qcount">QUESTION ' + (index + 1) + ' OF ' + ids.length + ' · ' + q.title + '</p>' +
      (q.certs ? '<p class="certs">' + q.certs + '</p>' : '<p class="certs"></p>') +
      (q.scenario ? '<div class="scenario"><b>Scenario</b>' + q.scenario + '</div>' : '') +
      '<h2 class="prompt" id="prompt" tabindex="-1">' + q.prompt + '</h2>' +
      '<div class="options" role="group" aria-label="Answer options">' + opts + '</div>' +
      (locked
        ? '<div class="feedback' + (ok ? '' : ' incorrect') + '" id="feedback" role="status" tabindex="-1"><h3>' + (ok ? 'Correct.' : 'Not quite. The answer is ' + q.answer + '.') + '</h3><p>' + q.explanation + '</p>' + (q.maps ? '<p class="maps">Maps to: ' + q.maps + '</p>' : '') + '</div>' +
          '<div class="actions">' + prev + '<button class="primary" id="next" type="button">' + (index === ids.length - 1 ? 'See results' : 'Next') + '</button></div>'
        : '<p class="hint">Click an answer to reveal the explanation.</p><div class="actions" style="margin-top:14px">' + prev + '</div>') +
      '<p class="score">Score: ' + s.correct + ' / ' + s.answered + ' correct' + (review ? ' in this review round' : '') + '</p>';
    content.querySelectorAll('.option:not(:disabled)').forEach(b => b.addEventListener('click', () => choose(b.dataset.id)));
    $('prev').addEventListener('click', goPrev);
    if (locked) $('next').addEventListener('click', goNext);
  }}

  function choose(id) {{
    const q = byId(ids[index]);
    if (done || q.id in answers) return;
    answers[q.id] = id; render('feedback');
    $('next').scrollIntoView({{ block: 'nearest' }});
  }}
  function goNext() {{
    const q = byId(ids[index]);
    if (done || !(q.id in answers)) return;
    if (index === ids.length - 1) done = true; else index++;
    window.scrollTo(0, 0); render(done ? 'results' : 'prompt');
  }}
  function goPrev() {{
    if (done) {{ done = false; index = ids.length - 1; }}
    else if (index > 0) index--;
    else return;
    window.scrollTo(0, 0); render('prompt');
  }}

  function renderResults(s) {{
    const perfect = s.correct === s.total;
    const pct = s.total ? s.correct / s.total : 0;
    const advice = perfect ? 'Every answer correct. Try explaining each idea aloud in interview form.'
      : pct < 0.6 ? 'Below 60%: re-read the plan\\'s Resources and Theory sections, then retry before moving on.'
      : 'Open an item below to review the reasoning, or retry only the ones you missed.';
    content.innerHTML = '<p class="qcount">' + (review ? 'REVIEW COMPLETE' : 'QUIZ COMPLETE') + '</p>' +
      '<h2 id="results" tabindex="-1">' + (perfect ? 'All clear.' : 'A few ideas to revisit.') + '</h2>' +
      '<div class="big">' + s.correct + ' / ' + s.total + '</div><p>' + advice + '</p>' +
      '<div class="actions" style="margin:20px 0 26px"><button class="secondary" id="prev" type="button">Previous</button>' +
      (s.missed.length ? '<button class="primary" id="retry" type="button">Retry missed (' + s.missed.length + ')</button>' : '') +
      '<button class="plain" id="again" type="button">Restart all ' + Q.length + '</button></div><h3>Answer review</h3>' +
      ids.map((id, i) => {{
        const q = byId(id), mine = answers[id], ok = mine === q.answer;
        const txt = oid => q.options.find(o => o.id === oid).html;
        return '<details class="review"><summary><span class="st' + (ok ? '' : ' missed') + '">' + (ok ? 'Correct' : 'Missed') + '</span><span>' + (i + 1) + '. ' + q.title + '</span></summary>' +
          '<p>' + q.prompt + '</p><p><strong>Your answer: ' + mine + '.</strong> ' + txt(mine) + '</p>' +
          (ok ? '' : '<p><strong>Correct answer: ' + q.answer + '.</strong> ' + txt(q.answer) + '</p>') +
          '<p>' + q.explanation + '</p></details>';
      }}).join('');
    $('prev').addEventListener('click', goPrev);
    $('again').addEventListener('click', () => start(Q.map(q => q.id), false));
    const r = $('retry'); if (r) r.addEventListener('click', () => {{ window.scrollTo(0, 0); start(s.missed, true); }});
  }}

  document.addEventListener('keydown', e => {{
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toUpperCase();
    if (!done && 'ABCD'.includes(k) && k.length === 1) choose(k);
    else if (e.key === 'ArrowRight') goNext();
    else if (e.key === 'ArrowLeft') goPrev();
  }});
  $('restart').addEventListener('click', () => start(Q.map(q => q.id), false));
  start(Q.map(q => q.id), false);
}})();
</script>
</body>
</html>
"""

INDEX_PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>AI Learning Quizzes</title>
<style>{style}</style>
</head>
<body>
<div class="app">
  <header class="masthead">
    <div class="crumb">PF-AI learning path</div>
    <h1>AI Learning quizzes</h1>
    <p class="lede">{total} questions across {count} topics, compiled from each plan's Knowledge Check. Anki deck: <a href="ai-learning-quizzes.apkg">ai-learning-quizzes.apkg</a>.</p>
  </header>
  <ul class="topics">
{items}
  </ul>
  <footer class="foot"><span>Rebuild: <code>py -3.11 docs/mentor/quizzes/build_quizzes.py</code></span></footer>
</div>
</body>
</html>
"""


def json_for_script(obj) -> str:
    return json.dumps(obj, ensure_ascii=False).replace("</", "<\\/")


def write_html(topics: list[dict]) -> None:
    for t in topics:
        page = QUIZ_PAGE.format(
            page_title=html.escape(f"{t['id']} Quiz"),
            style=STYLE,
            plan_id=html.escape(t["id"]),
            title=html.escape(t["title"]),
            source_href=html.escape("../../../" + t["source"]),
            source_name=html.escape(Path(t["source"]).name),
            data=json_for_script(t["questions"]),
        )
        (OUT_DIR / f"{t['slug']}.html").write_text(page, encoding="utf-8")

    status_label = {"done": "done", "in-progress": "in progress", "backlog": "backlog"}
    items = "\n".join(
        f'    <li><a href="{t["slug"]}.html"><span><span class="id">{html.escape(t["id"])}</span>'
        f'{html.escape(t["title"])}</span><span class="meta">{len(t["questions"])} Q · '
        f'{status_label.get(t["status"], t["status"])}</span></a></li>'
        for t in topics
    )
    (OUT_DIR / "index.html").write_text(
        INDEX_PAGE.format(style=STYLE, total=sum(len(t["questions"]) for t in topics),
                          count=len(topics), items=items),
        encoding="utf-8",
    )


# ---------- Anki ----------

CARD_CSS = """
.card{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;font-size:17px;line-height:1.55;text-align:left;color:#1d1d1f;background:#fafafa;padding:8px}
.nightMode.card,.night_mode .card{color:#ececef;background:#1d1d1f}
.wrap{max-width:680px;margin:auto}
.topic{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#6b67d6;font-weight:600}
.certs{font-size:12px;color:#888;margin-bottom:12px}
.scenario{border-left:3px solid #8985ff;padding:8px 12px;margin:0 0 12px;background:rgba(137,133,255,.08);font-size:15px}
.prompt{font-weight:600;margin:0 0 12px}
.opt{border:1px solid rgba(128,128,128,.35);border-radius:6px;padding:8px 10px;margin:0 0 7px}
.opt b{margin-right:6px}
.opt.correct{border-color:#3d9c7b;background:rgba(68,199,154,.15)}
.answer{margin-top:14px;padding:10px 12px;border-left:4px solid #44c79a;background:rgba(68,199,154,.12)}
.maps{font-size:12px;color:#888;margin-top:6px}
code{font-family:Consolas,monospace;font-size:.88em;background:rgba(128,128,128,.18);border-radius:4px;padding:1px 4px}
"""

FRONT = """<div class="wrap">
<div class="topic">{{Topic}}</div>
<div class="certs">{{Title}}{{#Certs}} · {{Certs}}{{/Certs}}</div>
{{#Scenario}}<div class="scenario">{{Scenario}}</div>{{/Scenario}}
<div class="prompt">{{Question}}</div>
{{Options}}
</div>"""

BACK = """<div class="wrap">
<div class="topic">{{Topic}}</div>
<div class="certs">{{Title}}{{#Certs}} · {{Certs}}{{/Certs}}</div>
{{#Scenario}}<div class="scenario">{{Scenario}}</div>{{/Scenario}}
<div class="prompt">{{Question}}</div>
{{OptionsMarked}}
<div class="answer"><b>Answer: {{Answer}}</b><br>{{Explanation}}{{#Maps}}<div class="maps">Maps to: {{Maps}}</div>{{/Maps}}</div>
</div>"""

MODEL = genanki.Model(
    MODEL_ID,
    "AI Learning MCQ",
    fields=[{"name": n} for n in
            ["Key", "Topic", "Title", "Certs", "Scenario", "Question", "Options",
             "OptionsMarked", "Answer", "Explanation", "Maps"]],
    templates=[{"name": "Question → Answer", "qfmt": FRONT, "afmt": BACK}],
    css=CARD_CSS,
    sort_field_index=0,
)


def options_html(q: dict, mark: bool) -> str:
    return "".join(
        f'<div class="opt{" correct" if mark and o["id"] == q["answer"] else ""}">'
        f'<b>{o["id"]}.</b>{o["html"]}</div>'
        for o in q["options"]
    )


def tag(s: str) -> str:
    return re.sub(r"[^\w-]+", "_", s).strip("_")


def write_apkg(topics: list[dict]) -> Path:
    decks = []
    for t in topics:
        # Deck ID derives from the plan ID so it stays stable when topics are added or reordered.
        deck_id = ROOT_DECK_ID + int(hashlib.md5(t["id"].encode()).hexdigest(), 16) % 10**8
        deck = genanki.Deck(deck_id, f"{DECK_ROOT}::{t['id']} · {t['title']}")
        for q in t["questions"]:
            key = f"{t['id']}-Q{q['number']}"
            deck.add_note(genanki.Note(
                model=MODEL,
                fields=[key, f"{t['id']} · {t['title']}", q["title"], q["certs"], q["scenario"],
                        q["prompt"], options_html(q, False), options_html(q, True), q["answer"],
                        q["explanation"], q["maps"]],
                guid=genanki.guid_for(key),
                tags=["ai-learning", tag(t["id"])] + [tag("cert-" + c.strip()) for c in q["certs"].split("·") if c.strip()],
            ))
        decks.append(deck)
    out = OUT_DIR / "ai-learning-quizzes.apkg"
    genanki.Package(decks).write_to_file(str(out))
    return out


def main() -> None:
    topics = [parse_plan(p) for p in find_plans()]
    write_html(topics)
    apkg = write_apkg(topics)
    for t in topics:
        print(f"{t['id']:<22} {len(t['questions'])} questions  -> {t['slug']}.html")
    print(f"{sum(len(t['questions']) for t in topics)} questions, {len(topics)} topics -> {apkg.name}")


if __name__ == "__main__":
    main()
