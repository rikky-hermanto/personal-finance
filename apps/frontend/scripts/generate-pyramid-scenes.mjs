#!/usr/bin/env node
// Pixel-art scenes for the Journey pyramid: one sheet per level, two frames side by side.
//
// Each scene shows small people doing what that level asks:
//   L1 Foundations  salary in hand, a coin into a piggy bank, checking a receipt, a bills checklist
//   L2 Defense      an umbrella over savings, cash into a safe, a shield
//   L3 Growth       a rising chart, a laptop, watering a money plant
//   L4 Freedom      lounging under a money tree that drops coins
//   L5 Legacy       a flag at the summit and a sapling for the next generation
//
// Same pixel language as generate-garden-sprites.mjs: hand-placed pixels, an outer 1px dark outline,
// shown at a whole-number scale with image-rendering: pixelated. No randomness, so two runs produce
// byte-identical files.
//
// Usage (from apps/frontend):
//   node scripts/generate-pyramid-scenes.mjs                 public/pyramid/*.png + the generated manifest
//   node scripts/generate-pyramid-scenes.mjs --preview <dir>  also <dir>/pyramid-preview.png at 4x

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── PNG ─────────────────────────────────────────────────────────────────────
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, c]); }
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// ── Canvas ──────────────────────────────────────────────────────────────────
const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
class Grid {
  constructor(w, h) { this.w = w; this.h = h; this.p = new Array(w * h).fill(null); }
  set(x, y, c) { x |= 0; y |= 0; if (c && x >= 0 && y >= 0 && x < this.w && y < this.h) this.p[y * this.w + x] = c; }
  get(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.p[y * this.w + x] : null; }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); }
  // map: array of strings, pal: char → colour; '.' or ' ' transparent. flip mirrors horizontally.
  draw(map, x, y, pal, flip = false) {
    map.forEach((row, j) => [...row].forEach((ch, i) => { const c = pal[ch]; if (c) this.set(flip ? x + row.length - 1 - i : x + i, y + j, c); }));
  }
  outline(col) {
    const add = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.get(x, y)) continue;
      if (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1)) add.push([x, y]);
    }
    add.forEach(([x, y]) => this.set(x, y, col));
  }
}

// ── Palette ─────────────────────────────────────────────────────────────────
const OL = '#3a322c';
const C = {
  skin: ['#f3cba5', '#dca478', '#b07552', '#7d4d31'],
  hair: { dark: '#2e2320', brown: '#6b4226', black: '#1c1816', blond: '#d6aa5e', grey: '#b9b4ac', red: '#a3482c' },
  shirt: { coral: '#e8785f', blue: '#4c86c6', sage: '#7fb08f', mustard: '#e6b84f', violet: '#9476c9', pink: '#ec8fa6', teal: '#3fa59a', cream: '#f2ead9' },
  pants: { navy: '#40466b', slate: '#5a5f73', olive: '#6b6d4d', denim: '#4f6f9a', brown: '#6e5341' },
  shoe: '#2b2522', eye: '#2b2522', white: '#fbf8f2', paper: '#f4efe4', line: '#c9bfae',
  coin: '#f2c14e', coinL: '#fde58a', coinD: '#c8902a',
  cash: '#93cf8d', cashD: '#4f9a57', cashL: '#c9ecc4',
  pig: '#f4a9ba', pigD: '#d67b92',
  steel: '#9aa3ad', steelD: '#6c7681', steelL: '#c9cfd6',
  wood: '#a87a52', woodD: '#7b5638', leaf: '#6fb26a', leafD: '#3f8048', leafL: '#a8d98a',
  red: '#e0604e', redD: '#b2402f', blue: '#5c9bd6', blueD: '#3a6fa6', sun: '#ffd25e', sunD: '#f2a93b',
  water: '#7cc6e8', pot: '#c96f4a', potD: '#9a4f33', stripe: '#f6f1e6',
};

// ── Person ──────────────────────────────────────────────────────────────────
// 7 wide, 14 tall; (x, y) is the top-left; feet on row y+13.
// pose: stand | cheer | hold | reach | point | sit ; frame 0/1 for 2-step loops.
function person(g, x, y, o = {}) {
  const S = C.skin[o.skin ?? 0], H = o.hairC ?? C.hair.dark, T = o.shirt ?? C.shirt.coral, P = o.pants ?? C.pants.navy;
  const pose = o.pose ?? 'stand', f = o.frame ?? 0, flip = !!o.flip;
  const pal = { H, S, e: C.eye, T, P, B: C.shoe };
  const bob = o.bob && f === 1 ? -1 : 0;
  y += bob;
  const head = ['..HHH..', '.HHHHH.', '.HSSSH.', '.SeSeS.', '..SSS..'];
  const hairLong = o.hair === 'long', bun = o.hair === 'bun', cap = o.hair === 'cap';
  g.draw(head, x, y, pal, flip);
  if (hairLong) { g.rect(x + 1, y + 3, 1, 3, H); g.rect(x + 5, y + 3, 1, 3, H); }
  if (bun) g.rect(x + 3, y - 1, 1, 1, H);
  if (cap) { g.rect(x + 1, y, 5, 1, o.capC ?? C.red); g.rect(flip ? x : x + 5, y + 1, 2, 1, o.capC ?? C.red); }
  // torso
  g.rect(x + 1, y + 5, 5, 4, T); g.rect(x + 2, y + 9, 3, 1, T);
  const L = flip ? (dx) => x + 6 - dx : (dx) => x + dx; // mirror helper for asymmetric arms
  const arm = (side, kind) => { // side 0 = left, 1 = right (before flip)
    const ax = side === 0 ? 0 : 6;
    if (kind === 'down') { g.rect(L(ax), y + 5, 1, 3, T); g.set(L(ax), y + 8, S); }
    if (kind === 'up') { g.rect(L(ax), y + 3, 1, 3, T); g.set(L(ax), y + 2, S); }
    if (kind === 'bent') { g.rect(L(ax), y + 5, 1, 2, T); g.set(L(ax), y + 7, S); }
    if (kind === 'out') { g.rect(L(ax), y + 5, 1, 1, T); g.set(L(side === 0 ? -1 : 7), y + 5, T); g.set(L(side === 0 ? -2 : 8), y + 5, S); }
    if (kind === 'outUp') { g.rect(L(ax), y + 5, 1, 1, T); g.set(L(side === 0 ? -1 : 7), y + 4, T); g.set(L(side === 0 ? -2 : 8), y + 3, S); }
  };
  if (pose === 'stand') { arm(0, 'down'); arm(1, 'down'); }
  if (pose === 'cheer') { arm(0, f ? 'up' : 'outUp'); arm(1, f ? 'outUp' : 'up'); }
  if (pose === 'hold') { arm(0, 'bent'); arm(1, 'bent'); }
  if (pose === 'reach') { arm(0, 'down'); arm(1, f ? 'outUp' : 'out'); }
  if (pose === 'point') { arm(0, 'down'); arm(1, 'outUp'); }
  if (pose === 'carryUp') { arm(0, 'up'); arm(1, 'up'); }
  if (pose === 'sit') {
    arm(0, 'bent'); arm(1, 'bent');
    // thighs forward, shins down
    for (let i = 0; i < 5; i++) g.set(L(2 + i), y + 10, P), g.set(L(2 + i), y + 11, P);
    g.rect(L(flip ? 7 : 6), y + 12, 2, 1, P); g.set(L(6), y + 13, C.shoe); g.set(L(7), y + 13, C.shoe);
    return;
  }
  // legs (walk alternates on frame 1 if o.walk)
  if (o.walk && f === 1) {
    g.draw(['.PPPPP.', '.PP.PP.', 'PP...PP', 'BB...BB'], x, y + 10, pal, flip);
  } else {
    g.draw(['.PPPPP.', '.PP.PP.', '.PP.PP.', '.BB.BB.'], x, y + 10, pal, flip);
  }
}

// ── Props ───────────────────────────────────────────────────────────────────
const P = {
  coin: (g, x, y) => g.draw(['.yy.', 'yYyy', 'yyyc', '.cc.'], x, y, { y: C.coin, Y: C.coinL, c: C.coinD }),
  coinStack: (g, x, y, n) => { for (let k = 0; k < n; k++) g.draw(['.yyyy.', 'cYyyyc'], x, y - k * 2, { y: C.coin, Y: C.coinL, c: C.coinD }); },
  note: (g, x, y) => g.draw(['gggggggg', 'gLggggLg', 'ggg dd gg'.replace(/ /g, 'g').slice(0, 8), 'gggggggg'], x, y, { g: C.cash, L: C.cashL, d: C.cashD }),
  noteStack: (g, x, y, n) => { for (let k = 0; k < n; k++) g.draw(['gggggggg', 'dddddddd'], x, y - k * 2, { g: C.cash, d: C.cashD }); },
  pig: (g, x, y) => g.draw([
    '....pp.....', '..pppppp.p.', '.pppppppppp', 'ppppppppepp', 'pppppppppnn', 'pppppppppnn', '.pppppppppp', '..pp...pp..',
  ], x, y, { p: C.pig, e: C.eye, n: C.pigD }),
  receipt: (g, x, y) => g.draw(['wwwww', 'wlllw', 'wwwww', 'wllww', 'wwwww', 'wlllw', 'w.w.w'], x, y, { w: C.paper, l: C.line }),
  board: (g, x, y, f) => { // checklist board on legs
    g.draw([
      'wwwwwwwwwwww', 'wkwllllllllw', 'wwwwwwwwwwww', 'wkwllllllw.w'.replace('.', 'w'), 'wwwwwwwwwwww', (f ? 'wkwlllllllww' : 'wbwlllllllww'), 'wwwwwwwwwwww',
    ], x, y, { w: C.paper, l: C.line, k: C.leafD, b: C.line });
    g.rect(x + 2, y + 7, 1, 5, C.woodD); g.rect(x + 9, y + 7, 1, 5, C.woodD);
  },
  umbrella: (g, x, y) => {
    g.draw(['....rrr....', '..rrRrRrr..', '.rRrrRrrRr.', 'rrrrrrrrrrr', 'r.r..r..r.r'], x, y, { r: C.red, R: C.stripe });
    g.rect(x + 5, y + 4, 1, 8, C.woodD); g.set(x + 4, y + 11, C.woodD);
  },
  safe: (g, x, y, open) => {
    g.draw([
      'ssssssssss', 'sddddddddS', 'sdLLLLLLdS', 'sdL..o.LdS'.replace(/\./g, 'L'), 'sdLLoOoLdS', 'sdL..o.LdS'.replace(/\./g, 'L'), 'sdLLLLLLdS', 'sddddddddS', 'SSSSSSSSSS', '.S......S.',
    ], x, y, { s: C.steelL, S: C.steelD, d: C.steel, L: C.steel, o: C.steelD, O: C.coin });
    if (open) g.rect(x + 3, y - 1, 4, 1, C.cash);
  },
  shield: (g, x, y) => g.draw(['bbbbbbb', 'bLbbbbb', 'bLbbWbb', 'bbbWWWb', '.bbbWbb'.replace('W', 'b'), '.bbbbb.', '..bbb..', '...b...'], x, y, { b: C.blue, L: '#9cc4ea', W: C.white }),
  chart: (g, x, y, f) => { // board with rising bars + arrow
    g.rect(x, y, 18, 12, C.white);
    g.rect(x + 2, y + 8, 2, 3, C.blue); g.rect(x + 5, y + 6, 2, 5, C.blue); g.rect(x + 8, y + 5, 2, 6, C.blue); g.rect(x + 11, y + 3, 2, 8, C.blue);
    g.rect(x + 14, y + (f ? 1 : 3), 2, f ? 10 : 8, C.leaf);
    g.rect(x + 1, y + 11, 16, 1, C.line);
    g.rect(x + 4, y + 12, 1, 4, C.woodD); g.rect(x + 13, y + 12, 1, 4, C.woodD);
  },
  arrowUp: (g, x, y) => g.draw(['..g..', '.ggg.', 'g.g.g', '..g..', '..g..'], x, y, { g: C.leafD }),
  laptop: (g, x, y) => { g.draw(['.kkkkkk.', '.kbbbbk.', '.kbbbbk.', '.kkkkkk.', 'ssssssss'], x, y, { k: '#5b5f6b', b: '#9fd0f0', s: C.steel }); },
  moneyPlant: (g, x, y, f) => {
    g.draw([
      '...l.....', '..lLl.y..', '.lLll.yY.', '..ll.lll.', 'y..lLll..', 'Yy..ll.l.', '....l....', '....l....',
    ], x, y, { l: C.leaf, L: C.leafL, y: C.coin, Y: C.coinL });
    g.draw(['.ppppppp.', '..ppppp..', '..PPPPP..', '...PPP...'], x, y + 8, { p: C.pot, P: C.potD });
    if (f) { g.set(x - 2, y + 1, C.water); g.set(x - 1, y + 3, C.water); } else { g.set(x - 2, y + 2, C.water); g.set(x - 1, y + 4, C.water); }
  },
  wateringCan: (g, x, y) => g.draw(['.ggg...', 'gGggg.g', 'gggggg.', 'ggggg..'], x, y, { g: '#7ea6c9', G: '#b8d3ea' }),
  tree: (g, x, y, f) => {
    g.draw([
      '.....llll.....', '...llLLllll...', '..llLlllyllll.', '.lllllllYyllll', '.llyllllllllll', 'llYyllllllyll.', 'lllllllllYyll.', '.lllllllllll..', '..llll.llll...', '.....tt.......', '.....tt.......', '.....tt.......', '.....tt.......', '....tttt......',
    ], x, y, { l: C.leaf, L: C.leafL, y: C.coin, Y: C.coinL, t: C.wood });
    P.coin(g, x + 10, y + (f ? 11 : 9));
  },
  lounger: (g, x, y) => {
    g.draw(['bR.......', 'bRb......', '.bRbRbRbR', '..bRbRbRb', '..w....w.'], x, y, { b: C.blue, R: C.stripe, w: C.woodD });
  },
  drink: (g, x, y) => g.draw(['..k.', '.k..', 'wwww', 'oOoo', 'oooo', 'oooo'], x, y, { k: C.leafD, w: C.white, o: '#f6a54a', O: '#ffd59a' }),
  sun: (g, x, y, f) => {
    g.draw(['.yyy.', 'yYyyy', 'yyyyy', 'yyyyo', '.yyo.'], x, y, { y: C.sun, Y: '#fff0b0', o: C.sunD });
    if (f) { g.set(x + 2, y - 2, C.sun); g.set(x - 2, y + 2, C.sun); g.set(x + 6, y + 2, C.sun); g.set(x + 2, y + 6, C.sun); }
    else { g.set(x - 1, y - 1, C.sun); g.set(x + 5, y - 1, C.sun); g.set(x - 1, y + 5, C.sun); g.set(x + 5, y + 5, C.sun); }
  },
  flag: (g, x, y, f) => {
    g.rect(x, y, 1, 16, C.woodD);
    if (f) g.draw(['rrrrr.', 'rrYrrr', 'rrrrr.', 'rr....'], x + 1, y, { r: C.red, Y: C.coinL });
    else g.draw(['rrrr..', 'rrYrrr', 'rrrrrr', '.rr...'], x + 1, y, { r: C.red, Y: C.coinL });
  },
  scroll: (g, x, y) => g.draw(['cwwwwc', 'cwllwc', 'cwwwwc'], x, y, { c: C.wood, w: C.paper, l: C.line }),
  sapling: (g, x, y) => g.draw(['.l.l.', 'lLlLl', '.lll.', '..t..', 'ppppp', '.ppp.'], x, y, { l: C.leaf, L: C.leafL, t: C.wood, p: C.pot }),
  house: (g, x, y) => g.draw([
    '....rr....', '...rrrr...', '..rrrrrr..', '.rrrrrrrr.', 'rrrrrrrrrr', '.wwwwwwww.', '.wbbwwddw.', '.wbbwwddw.', '.wwwwwddw.',
  ], x, y, { r: C.redD, w: C.paper, b: '#9fd0f0', d: C.wood }),
  ground: (g, x, w, y, c) => g.rect(x, y, w, 1, c),
};

// ── Scenes ──────────────────────────────────────────────────────────────────
const H = 34, BASE = H - 2; // feet row
const top = (h = 14) => BASE - h + 1;
const SCENES = {
  // L1 Foundations — earn, spend less than you earn, pay bills on time
  l1: { w: 140, draw: (g, f) => {
    person(g, 6, top(), { pose: 'hold', shirt: C.shirt.blue, pants: C.pants.slate, skin: 1, bob: true, frame: f, hair: 'cap', capC: C.shirt.mustard });
    P.note(g, 5, top() + 6);                                          // salary in hand
    P.coinStack(g, 20, BASE - 1, 3); P.coinStack(g, 26, BASE - 1, 5);
    P.pig(g, 40, BASE - 7);
    person(g, 54, top(), { pose: 'reach', flip: true, shirt: C.shirt.coral, pants: C.pants.navy, skin: 0, hair: 'long', hairC: C.hair.brown, frame: f });
    P.coin(g, 45, f ? BASE - 10 : BASE - 13);                         // coin dropping into the pig
    person(g, 70, top(), { pose: 'hold', shirt: C.shirt.sage, pants: C.pants.denim, skin: 2, hairC: C.hair.black, frame: f, bob: true });
    P.receipt(g, 70, top() + 4);                                     // checking the receipt
    P.board(g, 88, BASE - 11, f);                                    // bills checklist
    person(g, 103, top(), { pose: 'point', flip: true, shirt: C.shirt.violet, pants: C.pants.olive, skin: 3, hair: 'bun', hairC: C.hair.dark, frame: f });
    P.noteStack(g, 117, BASE - 1, 2); P.coinStack(g, 127, BASE - 1, 4);
  } },
  // L2 Defense — emergency cushion, insurance, manageable debt
  l2: { w: 116, draw: (g, f) => {
    P.umbrella(g, 4, BASE - 23);
    person(g, 6, top(), { pose: 'hold', shirt: C.shirt.teal, pants: C.pants.navy, skin: 1, hair: 'long', hairC: C.hair.red, frame: f, bob: true });
    P.coinStack(g, 18, BASE - 1, 4); P.coinStack(g, 24, BASE - 1, 6);
    P.safe(g, 38, BASE - 9, f);
    person(g, 52, top(), { pose: 'carryUp', flip: true, shirt: C.shirt.mustard, pants: C.pants.slate, skin: 2, hairC: C.hair.black, frame: f, walk: true });
    P.noteStack(g, 51, top() - 3, 2);
    P.shield(g, 70, BASE - 9);
    person(g, 82, top(), { pose: 'cheer', shirt: C.shirt.pink, pants: C.pants.denim, skin: 0, hair: 'bun', hairC: C.hair.blond, frame: f });
    P.receipt(g, 96, BASE - 7); P.coinStack(g, 104, BASE - 1, 3);
  } },
  // L3 Growth — save and invest a slice of every month
  l3: { w: 92, draw: (g, f) => {
    P.chart(g, 6, BASE - 15, f);
    person(g, 26, top(), { pose: 'point', flip: true, shirt: C.shirt.coral, pants: C.pants.navy, skin: 3, hairC: C.hair.dark, frame: f });
    P.laptop(g, 40, BASE - 4);
    P.coinStack(g, 50, BASE - 1, 3);
    person(g, 60, top(), { pose: 'reach', shirt: C.shirt.sage, pants: C.pants.brown, skin: 0, hair: 'long', hairC: C.hair.blond, frame: f });
    P.wateringCan(g, 67, top() + 2);
    P.moneyPlant(g, 76, BASE - 11, f);
  } },
  // L4 Freedom — passive income that pays for life
  l4: { w: 70, draw: (g, f) => {
    P.sun(g, 58, 3, f);
    P.tree(g, 4, BASE - 13 - 5, f);
    P.lounger(g, 26, BASE - 4);
    person(g, 28, top() + 1, { pose: 'sit', shirt: C.shirt.mustard, pants: C.pants.denim, skin: 1, hair: 'cap', capC: C.shirt.coral, frame: f });
    P.drink(g, 42, BASE - 6);
    P.coinStack(g, 48, BASE - 1, 2); P.coin(g, 54, f ? BASE - 4 : BASE - 6);
    P.coinStack(g, 58, BASE - 1, 3);
  } },
  // L5 Legacy — pass it on: estate, succession, a summit flag
  l5: { w: 44, draw: (g, f) => {
    P.flag(g, 30, BASE - 15, f);
    person(g, 18, top(), { pose: 'cheer', shirt: C.shirt.pink, pants: C.pants.navy, skin: 2, hairC: C.hair.grey, frame: f });
    P.sapling(g, 8, BASE - 5);
    P.coinStack(g, 33, BASE - 1, 2);
  } },
};

// ── Render ─────────────────────────────────────────────────────────────────
// Where each scene's first person stands (sprite px: x, y, width, height). The level card crops to it.
const CROP = { l1: [3, 16, 16, 18], l2: [3, 16, 16, 18], l3: [23, 16, 16, 18], l4: [24, 16, 16, 18], l5: [14, 16, 16, 18] };

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'pyramid');
const MANIFEST = join(ROOT, 'src', 'lib', 'journey', 'pyramidScenes.generated.ts');
const previewArg = process.argv.indexOf('--preview');
const previewDir = previewArg > -1 ? resolve(process.argv[previewArg + 1] || '.') : null;

mkdirSync(OUT, { recursive: true });
const sheets = [];
for (const [key, s] of Object.entries(SCENES)) {
  const frames = [0, 1].map((f) => { const g = new Grid(s.w, H); s.draw(g, f); g.outline(OL); return g; });
  const W = s.w * 2, buf = Buffer.alloc(W * H * 4);
  frames.forEach((g, fi) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < s.w; x++) {
      const c = g.get(x, y); if (!c) continue;
      const [r, gg, b] = hex(c); const o = (y * W + fi * s.w + x) * 4; buf[o] = r; buf[o + 1] = gg; buf[o + 2] = b; buf[o + 3] = 255;
    }
  });
  writeFileSync(join(OUT, `pyramid-${key}.png`), png(W, H, buf));
  sheets.push({ key, w: s.w, W, buf });
}

const entries = sheets.map(({ key, w }) => {
  const [x, y, cw, ch] = CROP[key];
  return `  ${Number(key[1])}: { width: ${w}, crop: { x: ${x}, y: ${y}, width: ${cw}, height: ${ch} } },`;
}).join('\n');
writeFileSync(MANIFEST, `// Generated by apps/frontend/scripts/generate-pyramid-scenes.mjs. Do not edit by hand.
// Sizes are in sprite pixels. Every sheet is two frames side by side, ${H} pixels tall.

export interface PyramidSceneInfo {
  width: number;
  crop: { x: number; y: number; width: number; height: number };
}

export const PYRAMID_SCENE_HEIGHT = ${H};

export const PYRAMID_SCENES: Record<1 | 2 | 3 | 4 | 5, PyramidSceneInfo> = {
${entries}
};
`);

if (previewDir) {
  mkdirSync(previewDir, { recursive: true });
  const Z = 4, PW = 300 * Z, PH = sheets.length * (H + 4) * Z, pb = Buffer.alloc(PW * PH * 4);
  for (let i = 0; i < PW * PH; i++) { pb[i * 4] = 245; pb[i * 4 + 1] = 240; pb[i * 4 + 2] = 230; pb[i * 4 + 3] = 255; }
  sheets.forEach((p, k) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < p.W; x++) {
      const o = (y * p.W + x) * 4; if (!p.buf[o + 3]) continue;
      for (let dy = 0; dy < Z; dy++) for (let dx = 0; dx < Z; dx++) {
        const X = (x + 2) * Z + dx, Y = (k * (H + 4) + y + 2) * Z + dy; if (X >= PW) continue;
        const q = (Y * PW + X) * 4; pb[q] = p.buf[o]; pb[q + 1] = p.buf[o + 1]; pb[q + 2] = p.buf[o + 2];
      }
    }
  });
  writeFileSync(join(previewDir, 'pyramid-preview.png'), png(PW, PH, pb));
}
console.log(`Wrote ${sheets.length} sheets to ${OUT} and ${MANIFEST}`);
