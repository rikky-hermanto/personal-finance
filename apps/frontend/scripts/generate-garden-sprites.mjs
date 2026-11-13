#!/usr/bin/env node
// PF-155 — Pixel-art plants for the Journey garden hero.
//
// Draws every garden sprite sheet with no dependencies (PNG encoding via node:zlib) and writes
// the generated manifest the falling-leaf code reads. Everything is seeded, so two runs produce
// byte-identical files.
//
// Method (written fresh; nothing copied from FeralUI or pixel-plays):
//   1. A skeleton of tapered capsules (trunk and branches) in three-plus bark tones.
//   2. A crown built as blobs -> leaf clumps -> small leaf spheres, placed in 3D.
//   3. Orthographic render with a per-pixel depth buffer, nearest sphere wins.
//   4. Light from the top-left: leaf, clump and blob normals blended, plus occlusion from
//      neighbouring leaves toward the light, plus depth inside the crown.
//   5. Quantised to a five-tone hue-shifted ramp with a narrow 4x4 Bayer band between tones.
//   6. Clean-up: orphan pixels removed, darkest rim on the canopy underside, grass at the base.
//   7. Sway: whole leaf clumps shift sideways by whole pixels on their own phase. Trunk fixed.
//
// Usage (from apps/frontend):
//   node scripts/generate-garden-sprites.mjs                     all 20 sheets + manifest
//   node scripts/generate-garden-sprites.mjs --out <dir>         same, into <dir>/garden and <dir>
//   node scripts/generate-garden-sprites.mjs --pilot <dir>       only <dir>/pilot.png (L3 stage 2)
//   node scripts/generate-garden-sprites.mjs --preview <dir>     also contact sheets + sway strip
//   node scripts/generate-garden-sprites.mjs --zoom <dir>        only <dir>/zoom.png: frame 0 at 8x of the
//                                                                pilot, or of --sprite <level>:<stage>

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SIZE = 96;
const FRAMES = 8;
const DISPLAY_SCALE = 2;
const GROUND_Y = 91; // first ground row; the trunk base sits on it
const TRUNK_X = 48;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;
const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));

function norm3(x, y, z) {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}

function randUnit(rand) {
  // Uniform direction on the sphere.
  const z = rand() * 2 - 1;
  const a = rand() * TAU;
  const s = Math.sqrt(1 - z * z);
  return [s * Math.cos(a), s * Math.sin(a), z];
}

// ---------------------------------------------------------------------------------------------
// PNG encoding (RGBA, 8 bit, one IDAT)
// ---------------------------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------------------------
// Palette codes. A frame is a Uint8Array of SIZE*SIZE codes; 0 is transparent.
// ---------------------------------------------------------------------------------------------

const C_LEAF = 1; // 1..5 leaf tones, shadow -> high
const C_RIM = 6;
const C_BARK = 7; // 7..10 bark tones, deep -> lit
const C_GRASS = 11; // 11..13
const C_ACCENT = 14; // 14 body, 15 highlight, 16 shade

function buildPalette(sp) {
  const pal = [[0, 0, 0, 0]];
  for (const c of sp.ramp) pal.push([...hex(c), 255]);
  pal.push([...hex(sp.rim), 255]);
  for (const c of sp.bark) pal.push([...hex(c), 255]);
  for (const c of sp.grass) pal.push([...hex(c), 255]);
  pal.push([...hex(sp.accent[0]), 255]);
  pal.push([...hex(sp.accent[1]), 255]);
  pal.push([...hex(sp.accent[2]), 255]);
  return pal;
}

// ---------------------------------------------------------------------------------------------
// Species data. Palettes are display colours, not financial thresholds.
// Each stage: trunk polyline, branch polylines ([x, y, radius] points), crown blobs, leaf size.
// ---------------------------------------------------------------------------------------------

const SPECIES = {
  // L3 Growth — cherry blossom. The pilot (STEP 2) is this species at stage 2.
  3: {
    name: 'cherry',
    ramp: ['#693a63', '#a9547a', '#dd7f9b', '#f5b3c6', '#fff0f3'],
    rim: '#3d2244',
    bark: ['#2c2128', '#4a373d', '#68493b', '#8d6c54'],
    grass: ['#46703f', '#68964f', '#97c067'],
    accent: ['#c43f6b', '#ffc2d4', '#7e2a52'],
    fallen: [2, 3],
    stages: {
      2: {
        sway: 1.5,
        swayStart: 22,
        swaySpan: 45,
        leafR: [1.5, 2.5],
        trunk: [
          [46.5, 91, 5.6],
          [46, 84, 4.3],
          [47.5, 75, 3.6],
          [49.5, 66, 3.2],
          [51, 58, 2.8],
        ],
        branches: [
          // left main: rises outward like a vase, thick at the base
          [[48, 71, 2.8], [41, 68, 2.5], [34, 63, 2.1], [28, 57, 1.7], [23, 50, 1.3], [20, 44, 1.0]],
          // fork off the left main, up into the upper-left crown
          [[36, 64, 1.7], [34, 56, 1.4], [31, 47, 1.0]],
          // right main
          [[50, 68, 2.8], [58, 65, 2.5], [66, 62, 2.0], [73, 57, 1.6], [79, 52, 1.2]],
          // fork off the right main
          [[58, 65, 1.8], [60, 57, 1.4], [63, 49, 1.1], [64, 44, 0.9]],
          // centre leader
          [[51, 60, 2.5], [52.5, 52, 2.0], [50, 42, 1.6], [49, 33, 1.1]],
          // low droops
          [[47.5, 78, 2.3], [39, 77, 1.9], [31, 75, 1.5], [24, 70, 1.1]],
          [[49, 76, 2.1], [58, 74, 1.7], [67, 70, 1.3], [73, 64, 1.0]],
        ],
        blobs: [
          // back layer: dark depth behind the lit front clumps
          { c: [49, 38, -9], r: [23, 12, 7], clumps: 16, clumpR: [3.4, 5], per: [7, 9] },
          { c: [50, 24, 0], r: [16, 10, 12], clumps: 20, clumpR: [3.2, 5], per: [7, 10] },
          { c: [30, 36, 2], r: [16, 10, 11], clumps: 20, clumpR: [3.2, 5], per: [7, 10] },
          { c: [69, 35, 2], r: [16, 10, 11], clumps: 20, clumpR: [3.2, 5], per: [7, 10] },
          // lower tiers jut out at different heights on each side
          { c: [17, 51, 0], r: [10, 6, 8], clumps: 10, clumpR: [3, 4.4], per: [6, 9] },
          { c: [81, 49, 0], r: [9, 6, 8], clumps: 9, clumpR: [3, 4.4], per: [6, 9] },
          { c: [26, 66, -2], r: [7, 4.5, 6], clumps: 6, clumpR: [2.8, 4], per: [6, 8] },
          { c: [71, 61, 1], r: [9, 5, 7], clumps: 8, clumpR: [2.8, 4.2], per: [6, 8] },
          { c: [47, 43, 8], r: [13, 8, 8], clumps: 14, clumpR: [3.2, 4.8], per: [7, 9] },
        ],
        // See-through gaps: [x, y, radius]; leaves centred inside are removed.
        holes: [[40, 31, 2.5], [33, 47, 3], [63, 43, 3.5], [14, 43, 2.5], [84, 41, 2.5], [50, 10, 2.5], [69, 28, 2.2], [44, 55, 3]],
        edge: 6,
        strays: 1,
        loose: [[10, 40], [87, 43], [27, 17], [73, 18], [9, 62], [88, 58], [78, 70]],
        accents: null,
      },
    },
  },
};

// Seedling: a short stem with a few leaves. Shared by every species; the palette tells them apart.
const SEEDLING = {
  sway: 0.6,
  leafR: [1.3, 1.9],
  trunk: [[48, 91, 1.8], [48.5, 85, 1.2], [48, 79, 1.0]],
  branches: [[[48.2, 84, 0.8], [44, 80, 0.6]], [[48.4, 82, 0.8], [52, 78, 0.6]]],
  blobs: [{ c: [48, 76, 0], r: [6, 4.5, 4], clumps: 4, clumpR: [2.2, 3], per: [4, 6] }],
  holes: [],
  strays: 1,
  loose: [],
  edge: 0,
  accents: null,
};

// Young tree: the full tree scaled about its base, with fewer and smaller clumps.
function growStage(st, k) {
  const X = (x) => 48 + (x - 48) * k;
  const Y = (y) => 91 + (y - 91) * k;
  const R = (r) => Math.max(0.7, r * Math.pow(k, 0.7));
  return {
    sway: 0.7,
    leafR: [1.4, 2.1],
    trunk: st.trunk.map(([x, y, r]) => [X(x), Y(y), R(r)]),
    branches: st.branches.map((b) => b.map(([x, y, r]) => [X(x), Y(y), R(r)])),
    blobs: st.blobs.map((b) => ({
      c: [X(b.c[0]), Y(b.c[1]), b.c[2] * k],
      r: [b.r[0] * k, b.r[1] * k, b.r[2] * k],
      clumps: Math.max(3, Math.round(b.clumps * k * k * 1.5)),
      clumpR: [Math.max(2.4, b.clumpR[0] * Math.pow(k, 0.6)), Math.max(3.2, b.clumpR[1] * Math.pow(k, 0.6))],
      per: [Math.max(4, Math.round(b.per[0] * 0.7)), Math.max(5, Math.round(b.per[1] * 0.7))],
    })),
    holes: st.holes.slice(0, 3).map(([x, y, r]) => [X(x), Y(y), Math.max(1.6, r * k)]),
    strays: 1,
    loose: st.loose.slice(0, 3).map(([x, y]) => [X(x), Y(y)]),
    edge: 2,
    accents: null,
  };
}

// Stage 3 is stage 2 with the same canopy (same seed) plus accent clusters.
const withAccents = (st, accents) => ({ ...st, seedStage: 2, accents });

const BARK_DEFAULT = ['#2c2128', '#4a373d', '#68493b', '#8d6c54'];

const FULL_TREES = {
  // L1 Foundations: low, round, dense bush-tree. Short thick trunk, branches show through the skirt.
  1: {
    name: 'bush',
    ramp: ['#24493a', '#3d7a40', '#6dab46', '#a8d25b', '#e4f28c'],
    rim: '#142e22',
    bark: BARK_DEFAULT,
    accent: ['#d23a3a', '#ff9d8c', '#8f1f2a'],
    accents: { count: 18, size: [2, 2] },
    stage2: {
      sway: 1.4,
      leafR: [1.5, 2.5],
      trunk: [[47, 91, 5.6], [47.5, 85, 4.8], [48, 78, 4.2], [48.5, 71, 3.6]],
      branches: [
        [[48, 78, 2.8], [41, 74, 2.3], [34, 69, 1.9], [28, 63, 1.4], [24, 57, 1.0]],
        [[48.5, 77, 2.8], [55, 73, 2.3], [62, 68, 1.9], [68, 62, 1.4], [72, 56, 1.0]],
        [[48, 72, 2.3], [43, 64, 1.9], [38, 56, 1.4], [35, 49, 1.0]],
        [[48.5, 71, 2.3], [54, 63, 1.9], [59, 55, 1.4], [62, 48, 1.0]],
      ],
      blobs: [
        { c: [48, 52, -9], r: [30, 19, 8], clumps: 22, clumpR: [3.4, 5], per: [7, 9] },
        { c: [48, 50, 0], r: [24, 19, 13], clumps: 30, clumpR: [3.4, 5.2], per: [7, 10] },
        { c: [28, 58, 2], r: [13, 12, 10], clumps: 14, clumpR: [3.2, 4.8], per: [7, 10] },
        { c: [68, 58, 2], r: [13, 12, 10], clumps: 14, clumpR: [3.2, 4.8], per: [7, 10] },
        { c: [48, 38, 4], r: [16, 9, 9], clumps: 12, clumpR: [3.2, 4.8], per: [7, 9] },
        { c: [20, 65, 0], r: [8, 5, 6], clumps: 6, clumpR: [2.8, 4], per: [6, 8] },
        { c: [76, 65, 0], r: [8, 5, 6], clumps: 6, clumpR: [2.8, 4], per: [6, 8] },
        { c: [48, 66, 8], r: [14, 6, 8], clumps: 9, clumpR: [3, 4.4], per: [6, 9] },
      ],
      holes: [[37, 70, 3], [60, 69, 3], [33, 54, 2.2], [63, 53, 2.2]],
      strays: 1,
      edge: 6,
      loose: [[14, 52], [82, 54], [30, 30], [66, 30]],
      accents: null,
    },
  },
  // L2 Defense: tall, heavy, rounded oak. Thick trunk, few gaps.
  2: {
    name: 'oak',
    ramp: ['#1d4549', '#2e6c56', '#4e9461', '#86b873', '#c6dd9c'],
    rim: '#112b30',
    bark: ['#241c22', '#3d2f33', '#5b4636', '#7d634b'],
    accent: ['#efe0ad', '#ffffff', '#9a7a46'],
    accents: { count: 16, size: [2, 2] },
    stage2: {
      sway: 1.2,
      leafR: [1.5, 2.5],
      trunk: [[46.5, 91, 6.4], [47, 84, 5.2], [47.5, 74, 4.4], [48, 64, 3.8], [48, 56, 3.2]],
      branches: [
        [[47.5, 66, 3.2], [41, 62, 2.8], [35, 57, 2.3], [30, 50, 1.8], [27, 42, 1.3]],
        [[48.5, 64, 3.2], [55, 60, 2.8], [61, 55, 2.3], [66, 48, 1.8], [69, 40, 1.3]],
        [[48, 58, 3.0], [48.5, 48, 2.5], [48, 37, 2.0], [48, 26, 1.4]],
        [[47, 76, 2.4], [40, 72, 2.1], [34, 67, 1.7], [31, 60, 1.2], [30, 55, 0.9]],
        [[48, 74, 2.4], [55, 70, 2.1], [61, 65, 1.7], [65, 59, 1.2], [67, 54, 0.9]],
      ],
      blobs: [
        { c: [48, 34, -9], r: [25, 26, 8], clumps: 24, clumpR: [3.4, 5], per: [7, 9] },
        { c: [48, 26, 0], r: [23, 18, 14], clumps: 34, clumpR: [3.4, 5.2], per: [7, 10] },
        { c: [31, 40, 2], r: [13, 13, 10], clumps: 18, clumpR: [3.2, 4.8], per: [7, 10] },
        { c: [65, 40, 2], r: [13, 13, 10], clumps: 18, clumpR: [3.2, 4.8], per: [7, 10] },
        { c: [29, 54, 0], r: [9, 8, 8], clumps: 8, clumpR: [3, 4.2], per: [6, 8] },
        { c: [67, 53, 0], r: [9, 8, 8], clumps: 8, clumpR: [3, 4.2], per: [6, 8] },
        { c: [48, 42, 8], r: [15, 13, 9], clumps: 16, clumpR: [3.2, 4.8], per: [7, 9] },
        { c: [48, 14, 2], r: [12, 8, 9], clumps: 8, clumpR: [3, 4.4], per: [6, 9] },
      ],
      holes: [[39, 57, 2.8], [58, 55, 2.8], [48, 61, 3], [24, 44, 2]],
      strays: 1,
      edge: 6,
      loose: [[17, 40], [80, 44], [35, 6], [64, 7]],
      accents: null,
    },
  },
  // L4 Freedom: broad, flat umbrella of autumn maple on long limbs.
  4: {
    name: 'maple',
    ramp: ['#66291f', '#a4441f', '#d9742a', '#f0a53a', '#ffd66b'],
    rim: '#3b1815',
    bark: ['#2a1d1d', '#4a3030', '#6e4638', '#946652'],
    accent: ['#ffd21f', '#fff6a8', '#d9941a'],
    accents: { count: 18, size: [2, 3] },
    stage2: {
      sway: 1.6,
      leafR: [1.5, 2.5],
      trunk: [[47, 91, 5.0], [47.5, 82, 4.0], [48.5, 72, 3.4], [49.5, 64, 3.0]],
      branches: [
        [[48.5, 70, 2.8], [40, 65, 2.4], [31, 60, 2.0], [22, 55, 1.6], [14, 50, 1.2], [9, 46, 0.9]],
        [[49.5, 68, 2.8], [58, 64, 2.4], [67, 60, 2.0], [76, 55, 1.6], [83, 51, 1.2], [88, 47, 0.9]],
        [[44, 66, 2.0], [38, 58, 1.7], [32, 50, 1.3], [28, 44, 1.0]],
        [[54, 64, 2.0], [60, 56, 1.7], [66, 49, 1.3], [70, 43, 1.0]],
        [[49.5, 64, 2.4], [50, 56, 2.0], [49, 48, 1.5], [48, 40, 1.1]],
      ],
      blobs: [
        { c: [48, 40, -9], r: [37, 11, 8], clumps: 20, clumpR: [3.4, 5], per: [7, 9] },
        { c: [48, 32, 0], r: [25, 9, 12], clumps: 22, clumpR: [3.2, 5], per: [7, 10] },
        { c: [25, 40, 2], r: [15, 8, 10], clumps: 14, clumpR: [3.2, 4.8], per: [7, 10] },
        { c: [71, 40, 2], r: [15, 8, 10], clumps: 14, clumpR: [3.2, 4.8], per: [7, 10] },
        { c: [16, 48, 0], r: [8, 6, 7], clumps: 6, clumpR: [2.8, 4], per: [6, 8] },
        { c: [80, 47, 0], r: [8, 6, 7], clumps: 6, clumpR: [2.8, 4], per: [6, 8] },
        { c: [48, 46, 7], r: [19, 7, 9], clumps: 12, clumpR: [3.2, 4.6], per: [7, 9] },
        { c: [29, 52, 0], r: [8, 5, 6], clumps: 5, clumpR: [2.8, 4], per: [6, 8] },
        { c: [66, 52, 1], r: [8, 5, 6], clumps: 5, clumpR: [2.8, 4], per: [6, 8] },
      ],
      holes: [[36, 44, 2.5], [60, 43, 2.5], [48, 38, 2], [20, 32, 2], [30, 34, 2], [66, 33, 2], [14, 42, 2], [82, 41, 2]],
      strays: 2,
      edge: 8,
      loose: [[11, 38], [85, 40], [22, 24], [75, 25], [48, 22], [11, 58], [85, 58], [30, 63]],
      accents: null,
    },
  },
  // L5 Legacy: the largest, spreading tree with a thick, gnarled trunk.
  5: {
    name: 'golden',
    ramp: ['#56551f', '#898729', '#bfb042', '#e6d476', '#fff3b8'],
    rim: '#32310f',
    bark: ['#2e2420', '#4d3c33', '#74594a', '#a2836a'],
    accent: ['#ffc233', '#fffbe0', '#a8641a'],
    accents: { count: 16, size: [3, 3] },
    stage2: {
      sway: 1.3,
      leafR: [1.5, 2.5],
      trunk: [[46, 91, 7.6], [46.5, 84, 6.2], [47.5, 76, 5.2], [49, 68, 4.4], [50, 60, 3.8]],
      branches: [
        [[48, 70, 4.0], [40, 65, 3.4], [32, 60, 2.8], [25, 53, 2.2], [19, 45, 1.6], [15, 38, 1.1]],
        [[34, 60, 2.2], [32, 51, 1.8], [34, 42, 1.4], [37, 34, 1.0]],
        [[51, 68, 4.0], [59, 64, 3.4], [67, 60, 2.8], [74, 54, 2.2], [80, 47, 1.6], [84, 40, 1.1]],
        [[66, 60, 2.2], [63, 50, 1.8], [61, 41, 1.4], [59, 33, 1.0]],
        [[50, 62, 3.4], [51, 52, 2.8], [49, 42, 2.2], [50, 30, 1.5], [51, 20, 1.0]],
        [[47, 80, 3.0], [38, 79, 2.4], [29, 77, 1.8], [21, 72, 1.3]],
        [[48, 78, 3.0], [58, 77, 2.4], [68, 74, 1.8], [76, 69, 1.3]],
      ],
      blobs: [
        { c: [48, 34, -10], r: [33, 22, 8], clumps: 30, clumpR: [3.4, 5], per: [7, 9] },
        { c: [50, 18, 0], r: [21, 12, 12], clumps: 24, clumpR: [3.2, 5], per: [7, 10] },
        { c: [29, 30, 2], r: [19, 13, 11], clumps: 22, clumpR: [3.2, 5], per: [7, 10] },
        { c: [69, 29, 2], r: [19, 13, 11], clumps: 22, clumpR: [3.2, 5], per: [7, 10] },
        { c: [18, 46, 0], r: [9, 7, 8], clumps: 9, clumpR: [3, 4.4], per: [6, 9] },
        { c: [80, 45, 0], r: [9, 7, 8], clumps: 9, clumpR: [3, 4.4], per: [6, 9] },
        { c: [49, 36, 8], r: [17, 11, 9], clumps: 16, clumpR: [3.2, 4.8], per: [7, 9] },
        { c: [23, 64, -1], r: [8, 6, 7], clumps: 7, clumpR: [2.8, 4], per: [6, 8] },
        { c: [75, 62, 1], r: [8, 6, 7], clumps: 7, clumpR: [2.8, 4], per: [6, 8] },
      ],
      holes: [[40, 24, 2.5], [60, 22, 2.5], [36, 45, 3], [62, 43, 3], [48, 56, 3], [21, 36, 2.2], [78, 34, 2.2], [50, 9, 2.5]],
      strays: 1,
      edge: 6,
      loose: [[10, 34], [86, 32], [28, 10], [70, 10], [10, 60], [86, 58]],
      accents: null,
    },
  },
};

// Level 3 (cherry) keeps its accepted stage 2; its other stages follow the same recipe.
const CHERRY_STAGE2 = SPECIES[3].stages[2];
SPECIES[3].stages[0] = SEEDLING;
SPECIES[3].stages[1] = growStage(CHERRY_STAGE2, 0.62);
SPECIES[3].stages[3] = withAccents(CHERRY_STAGE2, { count: 16, size: [3, 3] });

for (const [level, def] of Object.entries(FULL_TREES)) {
  SPECIES[level] = {
    name: def.name,
    ramp: def.ramp,
    rim: def.rim,
    bark: def.bark,
    grass: SPECIES[3].grass,
    accent: def.accent,
    fallen: [2, 3],
    stages: {
      0: SEEDLING,
      1: growStage(def.stage2, 0.62),
      2: def.stage2,
      3: withAccents(def.stage2, def.accents),
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Scene construction
// ---------------------------------------------------------------------------------------------

const LIGHT = norm3(-0.6, -0.7, 0.4);

function buildScene(level, stage) {
  const sp = SPECIES[level];
  const st = sp.stages[stage];
  const rand = mulberry32(level * 1009 + (st.seedStage ?? stage) * 37 + 11);

  const leaves = [];
  const clumps = [];

  st.blobs.forEach((blob, bi) => {
    const blobPhase = rand() * TAU;
    for (let ci = 0; ci < blob.clumps; ci++) {
      const rr = Math.cbrt(rand()) * 0.85;
      const d = randUnit(rand);
      const cr = lerp(blob.clumpR[0], blob.clumpR[1], rand());
      const clump = {
        x: blob.c[0] + d[0] * rr * blob.r[0],
        y: blob.c[1] + d[1] * rr * blob.r[1],
        z: blob.c[2] + d[2] * rr * blob.r[2],
        r: cr,
        blob: bi,
        phase: blobPhase + (rand() - 0.5) * 1.1,
        phase2: blobPhase * 0.7 + (rand() - 0.5) * 0.8,
        bias: (rand() - 0.5) * 0.1,
      };
      const ki = clumps.push(clump) - 1;
      const n = Math.round(lerp(blob.per[0], blob.per[1], rand()));
      for (let li = 0; li < n; li++) {
        const dir = randUnit(rand);
        const f = 0.3 + 0.7 * Math.sqrt(rand());
        leaves.push({
          x: clump.x + dir[0] * cr * f,
          y: clump.y + dir[1] * cr * f,
          z: clump.z + dir[2] * cr * f,
          r: lerp(st.leafR[0], st.leafR[1], rand()),
          clump: ki,
          blob: bi,
          jitter: (rand() - 0.5) * 0.5,
          bias: (rand() - 0.5) * 0.2,
          stray: false,
        });
      }
    }
    // Satellite clumps on the blob surface break the ball outline into scallops.
    for (let ei = 0; ei < (blob.edge ?? st.edge ?? 0); ei++) {
      const dir = randUnit(rand);
      const out = 0.98 + rand() * 0.1;
      const cr = 2 + rand() * 0.8;
      const clump = {
        x: blob.c[0] + dir[0] * blob.r[0] * out,
        y: blob.c[1] + dir[1] * blob.r[1] * out,
        z: blob.c[2] + dir[2] * blob.r[2] * out,
        r: cr,
        blob: bi,
        phase: blobPhase + (rand() - 0.5) * 1.1,
        phase2: blobPhase * 0.7 + (rand() - 0.5) * 0.8,
        bias: (rand() - 0.5) * 0.1,
      };
      const ki = clumps.push(clump) - 1;
      const n = 3 + Math.floor(rand() * 3);
      for (let li = 0; li < n; li++) {
        const d2 = randUnit(rand);
        const f = 0.3 + 0.7 * Math.sqrt(rand());
        leaves.push({
          x: clump.x + d2[0] * cr * f,
          y: clump.y + d2[1] * cr * f,
          z: clump.z + d2[2] * cr * f,
          r: lerp(1.5, 2.2, rand()),
          clump: ki,
          blob: bi,
          jitter: (rand() - 0.5) * 0.5,
          bias: (rand() - 0.5) * 0.2,
          stray: false,
        });
      }
    }
    // A few loose leaves, in groups of one to three, just outside the blob edge.
    for (let si = 0; si < st.strays; si++) {
      const dir = randUnit(rand);
      const out = 0.95 + rand() * 0.17;
      const phase = blobPhase + (rand() - 0.5) * 2;
      const c = {
        x: blob.c[0] + dir[0] * blob.r[0] * out,
        y: blob.c[1] + dir[1] * blob.r[1] * out,
        z: blob.c[2] + dir[2] * blob.r[2] * out,
        r: 2,
        blob: bi,
        phase,
        phase2: phase * 0.7,
        bias: (rand() - 0.5) * 0.1,
      };
      const ki = clumps.push(c) - 1;
      const n = 1 + Math.floor(rand() * 3);
      for (let li = 0; li < n; li++) {
        leaves.push({
          x: c.x + (rand() - 0.5) * 4,
          y: c.y + (rand() - 0.5) * 3,
          z: c.z + (rand() - 0.5) * 3,
          r: lerp(1.9, 2.5, rand()),
          clump: ki,
          blob: bi,
          jitter: 0,
          bias: (rand() - 0.5) * 0.12,
          stray: true,
        });
      }
    }
  });

  // Detached leaves just off the silhouette, two leaves each, on the nearest blob's phase.
  for (const [lx, ly] of st.loose ?? []) {
    let bi = 0;
    let best = Infinity;
    st.blobs.forEach((b, i) => {
      const d = Math.hypot(b.c[0] - lx, b.c[1] - ly);
      if (d < best) [bi, best] = [i, d];
    });
    const phase = rand() * TAU;
    const ki =
      clumps.push({ x: lx, y: ly, z: 2, r: 2, blob: bi, phase, phase2: phase * 0.7, bias: 0 }) - 1;
    for (let li = 0; li < 2; li++) {
      leaves.push({
        x: lx + li * 2.5,
        y: ly + li * 2.5,
        z: 2,
        r: lerp(1.8, 2.3, rand()),
        clump: ki,
        blob: bi,
        jitter: 0,
        bias: (rand() - 0.5) * 0.12,
        stray: true,
      });
    }
  }

  // Cut see-through gaps into the canopy.
  for (const [hx, hy, hr] of st.holes ?? []) {
    for (let i = leaves.length - 1; i >= 0; i--) {
      const l = leaves[i];
      if (Math.hypot(l.x - hx, l.y - hy) < hr + l.r * 0.4) leaves.splice(i, 1);
    }
  }

  // Occlusion: neighbours toward the light cast shade on a leaf.
  const R = 14;
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const l of leaves) {
    yMin = Math.min(yMin, l.y);
    yMax = Math.max(yMax, l.y);
  }
  for (const a of leaves) {
    let sum = 0;
    for (const b of leaves) {
      if (a === b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > R || dist < 0.001) continue;
      const cosA = (dx * LIGHT[0] + dy * LIGHT[1] + dz * LIGHT[2]) / dist;
      if (cosA <= 0.45) continue;
      // Shade cast by a different clump counts more, so creases between clumps go dark.
      sum += ((cosA - 0.45) / 0.55) * (1 - dist / R) * (b.clump === a.clump ? 0.45 : 1.2);
    }
    a.occ = 1 - Math.exp(-sum / 5);
    a.bottom = (a.y - yMin) / Math.max(1, yMax - yMin);
  }

  // Where leaves start to sway and how fast the sway builds up, relative to plant height.
  const plantH = GROUND_Y - yMin;
  const swayStart = st.swayStart ?? 0.27 * plantH;
  const swaySpan = st.swaySpan ?? 0.55 * plantH;

  // Stage 3 accents: fruit or blossom clusters on lit, non-stray leaves, spaced apart.
  let accents = null;
  if (st.accents) {
    const hosts = leaves
      .map((leaf, index) => ({ leaf, index }))
      .filter(({ leaf }) => !leaf.stray && leaf.occ < 0.3 && leaf.bottom < 0.75)
      .sort((a, b) => a.leaf.occ - b.leaf.occ || a.index - b.index);
    accents = [];
    for (const h of hosts) {
      if (accents.length >= st.accents.count) break;
      const near = accents.some(
        (a) => Math.hypot(leaves[a.leaf].x - h.leaf.x, leaves[a.leaf].y - h.leaf.y) < 6,
      );
      if (near) continue;
      const span = st.accents.size[1] - st.accents.size[0] + 1;
      accents.push({ leaf: h.index, dx: -1, dy: -1, size: st.accents.size[0] + Math.floor(rand() * span) });
    }
  }

  return { level, stage, sp, st, leaves, clumps, accents, swayStart, swaySpan, rand };
}

// ---------------------------------------------------------------------------------------------
// Rendering one frame
// ---------------------------------------------------------------------------------------------

const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

const wrap = (nx, ny, nz) => clamp((nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2] + 0.3) / 1.3, 0, 1);

// Tone boundaries on the 0..1 light value; dither is a narrow ordered band around each.
const LEAF_BOUNDS = [0.13, 0.25, 0.39, 0.56];
const BARK_BOUNDS = [0.22, 0.46, 0.72];
const DITHER_BAND = 0.012;

function quantise(v, bounds, x, y, band) {
  let k = 0;
  while (k < bounds.length && v >= bounds[k]) k++;
  const t = (BAYER[y & 3][x & 3] + 0.5) / 16;
  if (k > 0 && v - bounds[k - 1] < band) {
    const p = 0.5 + (v - bounds[k - 1]) / (2 * band); // 0.5..1 chance of staying at k
    if (t > p) return k - 1;
  } else if (k < bounds.length && bounds[k] - v < band) {
    const p = 0.5 - (bounds[k] - v) / (2 * band); // 0..0.5 chance of stepping up
    if (t < p) return k + 1;
  }
  return k;
}

function furrow(x, band) {
  return ((Math.imul(x, 73856093) ^ Math.imul(band, 19349663)) >>> 0) % 100 < 18;
}

function leafShift(scene, leaf, f) {
  const clump = scene.clumps[leaf.clump];
  const h = clamp((GROUND_Y - leaf.y - scene.swayStart) / scene.swaySpan, 0, 1);
  const d = clamp(Math.abs(leaf.x - TRUNK_X) / 38, 0, 1);
  const reach = h * (0.45 + 0.55 * d);
  const a = (TAU * f) / FRAMES;
  const wave =
    Math.sin(a + clump.phase + leaf.jitter) + 0.5 * Math.sin(2 * a + clump.phase2 + leaf.jitter);
  return Math.round(scene.st.sway * reach * wave);
}

function renderFrame(scene, f) {
  const { leaves, clumps, st } = scene;
  const N = SIZE * SIZE;
  const depth = new Float32Array(N).fill(-1e9);
  const kind = new Uint8Array(N); // 0 none, 1 leaf, 2 bark
  const owner = new Int32Array(N).fill(-1);
  const off = new Float32Array(N * 3); // sphere offset (leaf) or surface normal (bark)

  // Bark.
  const segs = [];
  const poly = (pts) => {
    for (let i = 0; i < pts.length - 1; i++) segs.push([pts[i], pts[i + 1]]);
  };
  poly(st.trunk);
  const trunkSegs = segs.length;
  st.branches.forEach(poly);
  for (let si = 0; si < segs.length; si++) {
    const [a, b] = segs[si];
    const x0 = Math.floor(Math.min(a[0] - a[2], b[0] - b[2]));
    const x1 = Math.ceil(Math.max(a[0] + a[2], b[0] + b[2]));
    const y0 = Math.floor(Math.min(a[1] - a[2], b[1] - b[2]));
    const y1 = Math.ceil(Math.max(a[1] + a[2], b[1] + b[2]));
    const abx = b[0] - a[0];
    const aby = b[1] - a[1];
    const len2 = abx * abx + aby * aby || 1;
    for (let py = Math.max(0, y0); py <= Math.min(GROUND_Y, y1); py++) {
      for (let px = Math.max(0, x0); px <= Math.min(SIZE - 1, x1); px++) {
        const sx = px + 0.5;
        const sy = py + 0.5;
        const t = clamp(((sx - a[0]) * abx + (sy - a[1]) * aby) / len2, 0, 1);
        const cx = a[0] + abx * t;
        const cy = a[1] + aby * t;
        const r = lerp(a[2], b[2], t);
        const ddx = sx - cx;
        const ddy = sy - cy;
        const d2 = ddx * ddx + ddy * ddy;
        if (d2 > r * r) continue;
        const dz = Math.sqrt(r * r - d2);
        const i = py * SIZE + px;
        if (dz > depth[i]) {
          depth[i] = dz;
          kind[i] = 2;
          owner[i] = si < trunkSegs ? -2 : -1;
          off[i * 3] = ddx / r;
          off[i * 3 + 1] = ddy / r;
          off[i * 3 + 2] = dz / r;
        }
      }
    }
  }

  // Leaves.
  const shifts = leaves.map((l) => leafShift(scene, l, f));
  leaves.forEach((l, li) => {
    const lx = l.x + shifts[li];
    const x0 = Math.floor(lx - l.r);
    const x1 = Math.ceil(lx + l.r);
    const y0 = Math.floor(l.y - l.r);
    const y1 = Math.ceil(l.y + l.r);
    for (let py = Math.max(0, y0); py <= Math.min(SIZE - 1, y1); py++) {
      for (let px = Math.max(0, x0); px <= Math.min(SIZE - 1, x1); px++) {
        const dx = px + 0.5 - lx;
        const dy = py + 0.5 - l.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > l.r * l.r) continue;
        const dz = Math.sqrt(l.r * l.r - d2);
        const depthHere = l.z + dz;
        const i = py * SIZE + px;
        if (depthHere > depth[i]) {
          depth[i] = depthHere;
          kind[i] = 1;
          owner[i] = li;
          off[i * 3] = dx;
          off[i * 3 + 1] = dy;
          off[i * 3 + 2] = dz;
        }
      }
    }
  });

  // Shade.
  const codes = new Uint8Array(N);
  for (let py = 0; py < SIZE; py++) {
    for (let px = 0; px < SIZE; px++) {
      const i = py * SIZE + px;
      if (kind[i] === 1) {
        const li = owner[i];
        const l = leaves[li];
        const c = clumps[l.clump];
        const blob = st.blobs[l.blob];
        const dx = off[i * 3];
        const dy = off[i * 3 + 1];
        const dz = off[i * 3 + 2];
        const hLeaf = wrap(dx / l.r, dy / l.r, dz / l.r);
        const [cnx, cny, cnz] = norm3(l.x - c.x + dx, l.y - c.y + dy, l.z - c.z + dz);
        const hClump = wrap(cnx, cny, cnz);
        const [bnx, bny, bnz] = norm3(
          (l.x - blob.c[0] + dx) / (blob.r[0] * blob.r[0]),
          (l.y - blob.c[1] + dy) / (blob.r[1] * blob.r[1]),
          (l.z - blob.c[2] + dz) / (blob.r[2] * blob.r[2]),
        );
        const hBlob = wrap(bnx, bny, bnz);
        let v = 0.1 + 0.18 * hLeaf + 0.46 * hClump + 0.1 * hBlob + l.bias + c.bias;
        v *= 1 - 0.6 * l.occ;
        v -= 0.08 * l.bottom;
        const tone = quantise(v, LEAF_BOUNDS, px - shifts[li], py, DITHER_BAND);
        codes[i] = C_LEAF + tone;
      } else if (kind[i] === 2) {
        const nx = off[i * 3];
        const ny = off[i * 3 + 1];
        const nz = off[i * 3 + 2];
        let v = 0.12 + 0.88 * wrap(nx, ny, nz);
        // Screen-space shade from foliage up and to the left of this pixel.
        let hits = 0;
        for (let s = 2; s <= 14; s += 2) {
          const sx = Math.round(px - LIGHT[0] * -s * 0.9);
          const sy = Math.round(py + LIGHT[1] * s * 0.9);
          if (sx < 0 || sy < 0 || sx >= SIZE || sy >= SIZE) continue;
          if (kind[sy * SIZE + sx] === 1) hits++;
        }
        v *= 1 - 0.4 * Math.min(1, hits / 3);
        let tone = quantise(v, BARK_BOUNDS, px, py, DITHER_BAND);
        // Short vertical furrows on the trunk only.
        if (owner[i] === -2 && tone > 0 && furrow(px, Math.floor(py / 3))) tone--;
        codes[i] = C_BARK + tone;
      }
    }
  }

  // Accent clusters ride on their host leaf and only show where that leaf is on top.
  if (scene.accents) {
    for (const ac of scene.accents) {
      const l = leaves[ac.leaf];
      const ax = Math.round(l.x + shifts[ac.leaf] + ac.dx);
      const ay = Math.round(l.y + ac.dy);
      for (let oy = 0; oy < ac.size; oy++) {
        for (let ox = 0; ox < ac.size; ox++) {
          const px = ax + ox;
          const py = ay + oy;
          if (px < 0 || py < 0 || px >= SIZE || py >= SIZE) continue;
          if (owner[py * SIZE + px] < 0) continue; // only on foliage, never over bark
          const d = ox + oy;
          const shade = d >= 2 * (ac.size - 1) - (ac.size > 2 ? 1 : 0);
          codes[py * SIZE + px] = d === 0 ? C_ACCENT + 1 : shade ? C_ACCENT + 2 : C_ACCENT;
        }
      }
    }
  }

  cleanOrphans(codes);
  cleanOrphans(codes);
  dropThin(codes);
  dropFragments(codes);
  addRim(codes);
  return codes;
}

// A leaf pixel with no up/down/left/right neighbour of its own tone is speckle: give it the
// most common leaf tone among its eight neighbours (ties go to the nearest tone).
function cleanOrphans(codes) {
  const out = codes.slice();
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const c = codes[y * SIZE + x];
      if (c < C_LEAF || c > C_LEAF + 4) continue;
      let same4 = 0;
      const counts = new Map();
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
          const n = codes[ny * SIZE + nx];
          if (n === c && (!dx || !dy)) same4++;
          if (n >= C_LEAF && n <= C_LEAF + 4) counts.set(n, (counts.get(n) ?? 0) + 1);
        }
      }
      if (same4 > 0 || counts.size === 0) continue;
      let best = c;
      let bestN = 0;
      for (const [k, n] of counts) {
        if (n > bestN || (n === bestN && Math.abs(k - c) < Math.abs(best - c))) [best, bestN] = [k, n];
      }
      out[y * SIZE + x] = best;
    }
  }
  codes.set(out);
}

// Leaf pixels that are one pixel thick (nothing above and below, or nothing left and right) are
// slivers of a back leaf peeking past a front one; they read as dashes, so remove them.
function dropThin(codes) {
  const solid = (x, y) => x >= 0 && y >= 0 && x < SIZE && y < SIZE && codes[y * SIZE + x] !== 0;
  const out = codes.slice();
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const c = codes[y * SIZE + x];
      if (c < C_LEAF || c > C_LEAF + 4) continue;
      if ((!solid(x, y - 1) && !solid(x, y + 1)) || (!solid(x - 1, y) && !solid(x + 1, y))) {
        out[y * SIZE + x] = 0;
      }
    }
  }
  codes.set(out);
}

// A loose leaf is at least six pixels; smaller 8-connected leaf fragments read as speckle.
function dropFragments(codes) {
  const seen = new Uint8Array(SIZE * SIZE);
  const isLeaf = (i) => codes[i] >= C_LEAF && codes[i] <= C_LEAF + 4;
  for (let start = 0; start < SIZE * SIZE; start++) {
    if (seen[start] || !isLeaf(start)) continue;
    const stack = [start];
    const comp = [];
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop();
      comp.push(i);
      const x = i % SIZE;
      const y = (i / SIZE) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
          const j = ny * SIZE + nx;
          if (!seen[j] && isLeaf(j)) {
            seen[j] = 1;
            stack.push(j);
          }
        }
      }
    }
    if (comp.length < 6) for (const i of comp) codes[i] = 0;
  }
}

// Darkest tone on the underside of the canopy only; the outside edge is not outlined.
// A rim pixel must sit on a continuous underside (a neighbour also has empty space below),
// otherwise it would be a lone dark dot on a side edge.
function addRim(codes) {
  const isLeaf = (x, y) => {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return false;
    const c = codes[y * SIZE + x];
    return c >= C_LEAF && c <= C_LEAF + 4;
  };
  const under = (x, y) => isLeaf(x, y) && y + 1 < SIZE && codes[(y + 1) * SIZE + x] === 0;
  const out = codes.slice();
  for (let y = 0; y < SIZE - 1; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (under(x, y) && isLeaf(x, y - 1) && (under(x - 1, y) || under(x + 1, y))) {
        out[y * SIZE + x] = C_RIM;
      }
    }
  }
  codes.set(out);
}

// ---------------------------------------------------------------------------------------------
// Ground: a grass tuft line under the trunk and a few fallen leaves. Static in every frame.
// ---------------------------------------------------------------------------------------------

function buildGround(level, stage) {
  const sp = SPECIES[level];
  const rand = mulberry32(level * 7919 + stage * 131 + 5);
  const halfWidth = [6, 10, 17, 18][stage];
  const px = [];
  // A one-pixel soil line with ragged ends, and V-shaped tufts of three blades on it.
  const lineHalf = halfWidth - 1;
  for (let x = TRUNK_X - lineHalf; x <= TRUNK_X + lineHalf; x++) {
    const nearEnd = lineHalf - Math.abs(x - TRUNK_X) < 3;
    if (!nearEnd || rand() < 0.6) px.push([x, GROUND_Y, C_GRASS]);
  }
  const tufts = Math.max(1, Math.round(halfWidth / 3.2));
  for (let t = 0; t < tufts; t++) {
    const cx = Math.round(TRUNK_X - lineHalf + 1 + ((2 * lineHalf - 2) * (t + 0.5)) / tufts + (rand() - 0.5) * 2);
    const h = 2 + Math.floor(rand() * 2) + (halfWidth > 12 ? 1 : 0); // centre blade 2..4
    for (let k = 0; k < h; k++) px.push([cx, GROUND_Y - 1 - k, C_GRASS + (k === h - 1 ? 2 : 1)]);
    for (let k = 0; k < h - 1; k++) {
      px.push([cx - 1 - (k >= 2 ? 1 : 0), GROUND_Y - 1 - k, C_GRASS + (k === h - 2 ? 2 : 0)]);
      if (k < h - 2) px.push([cx + 1 + (k >= 2 ? 1 : 0), GROUND_Y - 1 - k, C_GRASS + (k === h - 3 ? 2 : 0)]);
    }
  }
  const fallen = sp.fallen ?? [2, 3];
  for (let i = 0; i < 5; i++) {
    const x = TRUNK_X + Math.round((rand() * 2 - 1) * (halfWidth + 3));
    const y = GROUND_Y - 1 - (rand() < 0.4 ? 1 : 0);
    const tone = C_LEAF + fallen[rand() < 0.5 ? 0 : 1];
    px.push([x, y, tone]);
    if (rand() < 0.5) px.push([x + 1, y, tone]);
  }
  return px;
}

function applyGround(codes, ground) {
  for (const [x, y, c] of ground) {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) continue;
    codes[y * SIZE + x] = c;
  }
}

// ---------------------------------------------------------------------------------------------
// Sprites: 8 sway frames in one row
// ---------------------------------------------------------------------------------------------

function renderSprite(level, stage) {
  const scene = buildScene(level, stage);
  const ground = buildGround(level, stage);
  const frames = [];
  const crown = { x0: SIZE, x1: -1, y0: SIZE, y1: -1 };
  for (let f = 0; f < FRAMES; f++) {
    const codes = renderFrame(scene, f);
    // Crown extent (leaves, rim, accents) before the ground and fallen leaves are drawn.
    for (let i = 0; i < codes.length; i++) {
      const c = codes[i];
      if (!((c >= C_LEAF && c <= C_RIM) || c >= C_ACCENT)) continue;
      const x = i % SIZE;
      const y = (i / SIZE) | 0;
      crown.x0 = Math.min(crown.x0, x);
      crown.x1 = Math.max(crown.x1, x);
      crown.y0 = Math.min(crown.y0, y);
      crown.y1 = Math.max(crown.y1, y);
    }
    applyGround(codes, ground);
    frames.push(codes);
  }
  return { scene, frames, crown, palette: buildPalette(scene.sp) };
}

function framesToSheetRgba(sprite) {
  const w = SIZE * FRAMES;
  const rgba = new Uint8Array(w * SIZE * 4);
  sprite.frames.forEach((codes, f) => {
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const c = sprite.palette[codes[y * SIZE + x]];
        const o = (y * w + f * SIZE + x) * 4;
        rgba[o] = c[0];
        rgba[o + 1] = c[1];
        rgba[o + 2] = c[2];
        rgba[o + 3] = c[3];
      }
    }
  });
  return { width: w, height: SIZE, rgba };
}

// ---------------------------------------------------------------------------------------------
// Preview canvas
// ---------------------------------------------------------------------------------------------

class Canvas {
  constructor(width, height, bg) {
    this.width = width;
    this.height = height;
    this.rgba = new Uint8Array(width * height * 4);
    this.fill(0, 0, width, height, bg);
  }

  fill(x0, y0, w, h, bg) {
    const [r, g, b] = typeof bg === 'string' ? hex(bg) : bg;
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        const o = (y * this.width + x) * 4;
        this.rgba[o] = r;
        this.rgba[o + 1] = g;
        this.rgba[o + 2] = b;
        this.rgba[o + 3] = 255;
      }
    }
  }

  // Draw a frame of palette codes at an integer scale over whatever is already there.
  blitFrame(codes, palette, dx, dy, scale) {
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const c = palette[codes[y * SIZE + x]];
        if (!c[3]) continue;
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            const o = ((dy + y * scale + sy) * this.width + dx + x * scale + sx) * 4;
            this.rgba[o] = c[0];
            this.rgba[o + 1] = c[1];
            this.rgba[o + 2] = c[2];
            this.rgba[o + 3] = 255;
          }
        }
      }
    }
  }

  png() {
    return encodePng(this.width, this.height, this.rgba);
  }
}

const BG_LIGHT = '#f7f6f2';
const BG_DARK = '#17181c';

function renderPilot(dir) {
  const sprite = renderSprite(3, 2);
  const W = 1536;
  const H = 384 + 192 + 24;
  const cv = new Canvas(W, H, '#8d8b85');
  cv.fill(0, 0, 384, 384, BG_LIGHT);
  cv.fill(384, 0, 384, 384, BG_DARK);
  cv.blitFrame(sprite.frames[0], sprite.palette, 0, 0, 4);
  cv.blitFrame(sprite.frames[0], sprite.palette, 384, 0, 4);
  // The real display size (2x) on both themes.
  cv.fill(768, 0, 192, 192, BG_LIGHT);
  cv.fill(960, 0, 192, 192, BG_DARK);
  cv.blitFrame(sprite.frames[0], sprite.palette, 768, 0, 2);
  cv.blitFrame(sprite.frames[0], sprite.palette, 960, 0, 2);
  // The 8 sway frames at 2x.
  for (let f = 0; f < FRAMES; f++) {
    cv.fill(f * 192, 408, 192, 192, BG_LIGHT);
    cv.blitFrame(sprite.frames[f], sprite.palette, f * 192, 408, 2);
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'pilot.png'), cv.png());
  return sprite;
}

// Leaf pixels with no up/down/left/right neighbour of the same tone (speckle count).
function isolated4(codes) {
  let n = 0;
  for (let y = 0; y < GROUND_Y - 3; y++) {
    for (let x = 0; x < SIZE; x++) {
      const c = codes[y * SIZE + x];
      if (c < C_LEAF || c > C_LEAF + 4) continue;
      const same = (nx, ny) =>
        nx >= 0 && ny >= 0 && nx < SIZE && ny < SIZE && codes[ny * SIZE + nx] === c;
      if (!same(x - 1, y) && !same(x + 1, y) && !same(x, y - 1) && !same(x, y + 1)) n++;
    }
  }
  return n;
}

function bboxOf(sprite) {
  let x0 = SIZE;
  let x1 = -1;
  let y0 = SIZE;
  let y1 = -1;
  for (const codes of sprite.frames) {
    for (let i = 0; i < codes.length; i++) {
      if (!codes[i]) continue;
      const x = i % SIZE;
      const y = (i / SIZE) | 0;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  }
  return { minX: x0, maxX: x1, minY: y0, maxY: y1 };
}

function toneStats(sprite) {
  const counts = new Array(17).fill(0);
  for (const c of sprite.frames[0]) counts[c]++;
  const total = counts.slice(1).reduce((a, b) => a + b, 0);
  const leaf = counts.slice(C_LEAF, C_LEAF + 5);
  const leafTotal = leaf.reduce((a, b) => a + b, 0) || 1;
  return {
    opaquePixels: total,
    leafTonePct: leaf.map((n) => Math.round((n / leafTotal) * 100)),
    isolated4: isolated4(sprite.frames[0]),
    rimPx: counts[C_RIM],
    barkPx: counts.slice(C_BARK, C_BARK + 4),
    leaves: sprite.scene.leaves.length,
    bbox: bboxOf(sprite),
    loopStepPx: sprite.frames.map((fr, i) => {
      const next = sprite.frames[(i + 1) % FRAMES];
      return fr.reduce((n, c, k) => n + (c !== next[k] ? 1 : 0), 0);
    }),
    swayChangedPx: sprite.frames.map((fr) => fr.reduce((n, c, i) => n + (c !== sprite.frames[0][i] ? 1 : 0), 0)),
  };
}

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : (args[i + 1] ?? null);
};

const frontendRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

const zoomDir = flag('--zoom');
if (zoomDir) {
  const [zl, zs] = (flag('--sprite') ?? '3:2').split(':').map(Number);
  const sprite = renderSprite(zl, zs);
  const cv = new Canvas(SIZE * 8, SIZE * 8, BG_LIGHT);
  cv.blitFrame(sprite.frames[0], sprite.palette, 0, 0, 8);
  mkdirSync(resolve(zoomDir), { recursive: true });
  writeFileSync(join(resolve(zoomDir), 'zoom.png'), cv.png());
  console.log(`wrote ${join(resolve(zoomDir), 'zoom.png')}`);
  process.exit(0);
}

const pilotDir = flag('--pilot');
if (pilotDir) {
  const sprite = renderPilot(resolve(pilotDir));
  console.log(`wrote ${join(resolve(pilotDir), 'pilot.png')}`);
  console.log(JSON.stringify(toneStats(sprite)));
  process.exit(0);
}

// ---------------------------------------------------------------------------------------------
// Full generation: 20 sheets, the manifest, and (with --preview) the contact sheets
// ---------------------------------------------------------------------------------------------

const LEVELS = [1, 2, 3, 4, 5];
const STAGES = [0, 1, 2, 3];

// Canopy box in display pixels relative to the sprite centre, over all 8 frames.
function canopyBox(sprite) {
  const { x0, x1, y0, y1 } = sprite.crown;
  const half = SIZE / 2;
  return {
    halfWidth: Math.max(half - x0, x1 + 1 - half) * DISPLAY_SCALE,
    top: (y0 - half) * DISPLAY_SCALE,
    bottom: (y1 + 1 - half) * DISPLAY_SCALE,
    ground: (GROUND_Y - half) * DISPLAY_SCALE,
  };
}

function manifestSource(entries) {
  const lines = [
    '// Generated by apps/frontend/scripts/generate-garden-sprites.mjs. Do not edit by hand.',
    '// Canopy box and ground are in display pixels (2x the 96px sprite), relative to the sprite centre.',
    '// Colour classes are full literal strings so Tailwind generates them.',
    '',
    'export interface GardenSpriteInfo {',
    '  halfWidth: number;',
    '  top: number;',
    '  bottom: number;',
    '  ground: number;',
    '  colorClasses: readonly [string, string];',
    '}',
    '',
    'export const GARDEN_SPRITES: Record<1 | 2 | 3 | 4 | 5, Record<0 | 1 | 2 | 3, GardenSpriteInfo>> = {',
  ];
  for (const level of LEVELS) {
    lines.push(`  ${level}: {`);
    for (const stage of STAGES) {
      const e = entries[level][stage];
      const classes = `['${e.colorClasses[0]}', '${e.colorClasses[1]}']`;
      lines.push(
        `    ${stage}: { halfWidth: ${e.halfWidth}, top: ${e.top}, bottom: ${e.bottom}, ground: ${e.ground}, colorClasses: ${classes} },`,
      );
    }
    lines.push('  },');
  }
  lines.push('};', '');
  return lines.join('\n');
}

function generateAll(spritesDir, manifestPath) {
  mkdirSync(spritesDir, { recursive: true });
  mkdirSync(resolve(manifestPath, '..'), { recursive: true });
  const sprites = {};
  const entries = {};
  for (const level of LEVELS) {
    sprites[level] = {};
    entries[level] = {};
    for (const stage of STAGES) {
      const sprite = renderSprite(level, stage);
      sprites[level][stage] = sprite;
      const sheet = framesToSheetRgba(sprite);
      const file = join(spritesDir, `l${level}-stage-${stage}.png`);
      writeFileSync(file, encodePng(sheet.width, sheet.height, sheet.rgba));
      const ramp = SPECIES[level].ramp;
      entries[level][stage] = {
        ...canopyBox(sprite),
        colorClasses: [`bg-[${ramp[2]}]`, `bg-[${ramp[3]}]`],
      };
    }
  }
  writeFileSync(manifestPath, manifestSource(entries));
  return sprites;
}

function writePreviews(dir, sprites) {
  mkdirSync(dir, { recursive: true });
  // Evidence for the checklist: lone leaf pixels (speckle) per sprite over all 8 frames, and crown x range.
  for (const level of LEVELS) {
    const row = STAGES.map((stage) => {
      const sp = sprites[level][stage];
      const lone = Math.max(...sp.frames.map(isolated4));
      return `s${stage}: lone ${lone}, x ${sp.crown.x0}-${sp.crown.x1}`;
    });
    console.log(`L${level} ${SPECIES[level].name.padEnd(6)} ${row.join(' | ')}`);
  }
  const cell = SIZE * 4;
  for (const [name, bg] of [['contact-light.png', BG_LIGHT], ['contact-dark.png', BG_DARK]]) {
    const cv = new Canvas(cell * STAGES.length, cell * LEVELS.length, bg);
    LEVELS.forEach((level, row) => {
      STAGES.forEach((stage, col) => {
        const sprite = sprites[level][stage];
        cv.blitFrame(sprite.frames[0], sprite.palette, col * cell, row * cell, 4);
      });
    });
    writeFileSync(join(dir, name), cv.png());
  }
  const sway = sprites[3][2];
  const cv = new Canvas(cell * FRAMES, cell, BG_LIGHT);
  sway.frames.forEach((codes, f) => cv.blitFrame(codes, sway.palette, f * cell, 0, 4));
  writeFileSync(join(dir, 'sway-l3.png'), cv.png());
}

const outRoot = flag('--out');
const spritesDir = outRoot ? join(resolve(outRoot), 'garden') : join(frontendRoot, 'public', 'garden');
const manifestPath = outRoot
  ? join(resolve(outRoot), 'gardenSprites.generated.ts')
  : join(frontendRoot, 'src', 'lib', 'journey', 'gardenSprites.generated.ts');

const allSprites = generateAll(spritesDir, manifestPath);
console.log(`wrote 20 sheets to ${spritesDir}`);
console.log(`wrote ${manifestPath}`);

const previewDir = flag('--preview');
if (previewDir) {
  writePreviews(resolve(previewDir), allSprites);
  console.log(`wrote previews to ${resolve(previewDir)}`);
}
