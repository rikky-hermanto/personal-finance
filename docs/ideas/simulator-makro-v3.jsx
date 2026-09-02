import React, { useState, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Cell, ReferenceLine, ResponsiveContainer, Tooltip,
} from "recharts";

/* ─────────────────────────────  TOKENS  ───────────────────────────── */
const C = {
  bg: "#0E171C", panel: "#14222A", panel2: "#1A2C35", derived: "#132029",
  rule: "#263C46", ruleSoft: "#1F323B",
  text: "#E6EFF2", dim: "#87A2AD", dimmer: "#5B7783",
  gold: "#C9A44C", neg: "#C4553D", pos: "#4E9E7F", warn: "#D08A3E", cool: "#5E90A8", violet: "#8E7BB0",
};
const num = { fontVariantNumeric: "tabular-nums", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" };
const clamp = (v, lo = -100, hi = 100) => Math.max(lo, Math.min(hi, v));
const f1 = (v) => (v >= 0 ? "+" : "") + v.toFixed(1);
const f1p = (v) => v.toFixed(1);

/* ───────────────────────  KONSTANTA STRUKTURAL  ─────────────────────── */
const R_NEUTRAL = 2.2;   // suku bunga riil netral (emerging market)
const OKUN = 0.45;       // koefisien Okun
const U_NAT = 5.0;       // pengangguran alamiah
const KAPPA = 0.42;      // kemiringan kurva Phillips

/* ─────────────────────────────  MODEL  ───────────────────────────── */
function computeModel(s) {
  const {
    i, target, pie, deficit, w, prod, shock, informal,
    iFed, piG, gG, dxy, riskOn,
    oil, commod, subsidy, fxDebt, reserves, debtRatio,
  } = s;

  const inf = informal / 100;
  const sub = subsidy / 100;
  const gPot = prod + 3.4;
  const r = i - pie;                 // suku bunga riil ex-ante
  const rG = iFed - piG;

  /* iterasi kurs ↔ inflasi (3 putaran cukup konvergen) */
  let idr = 0, pi = pie, g = gPot, gap = 0, flow = 0, flowParts = [];
  for (let k = 0; k < 4; k++) {
    const fxCrisisDrag = Math.max(0, -idr - 10) * (fxDebt / 12);
    gap = -0.9 * (r - R_NEUTRAL)
      + 0.55 * (deficit - 2.5)
      + 0.30 * (gG - 3.0)
      + 0.030 * commod - 0.020 * oil
      + 0.020 * (riskOn - 50) - 0.030 * dxy
      - fxCrisisDrag;
    g = gPot + gap;

    const ulc = w - prod;
    const importedInfl = 0.22 * Math.max(0, -idr) + 0.035 * Math.max(0, oil) * (1 - sub);
    const kEff = KAPPA + 0.08 * Math.max(0, gap);
    pi = pie + kEff * gap + 0.45 * (ulc - pie) + shock + importedInfl;

    const realCarry = (i - pi) - (iFed - piG);
    const growthDiff = g - gG;
    const netToT = 0.045 * commod - 0.030 * oil;
    flowParts = [
      { label: "Carry riil (r ID − r global)", v: 4.0 * realCarry, raw: `${f1(realCarry)} pp` },
      { label: "Diferensial pertumbuhan", v: 3.0 * growthDiff, raw: `${f1(growthDiff)} pp` },
      { label: "Selera risiko global", v: 0.8 * (riskOn - 50), raw: `${riskOn.toFixed(0)}/100` },
      { label: "Kekuatan dolar (DXY)", v: -2.2 * dxy, raw: `${f1(dxy)}%` },
      { label: "Terms of trade neto", v: 8 * netToT, raw: `${f1(netToT * 10)} idx` },
      { label: "Kecukupan cadangan devisa", v: 2.0 * (reserves - 6), raw: `${f1p(reserves)} bln` },
      { label: "Utang valas korporasi", v: -0.8 * Math.max(0, fxDebt - 15), raw: `${f1p(fxDebt)}% PDB` },
      { label: "Stabilitas nominal domestik", v: -3.0 * Math.max(0, Math.abs(pi - target) - 2) - (pi < 0 ? 10 : 0), raw: `gap ${f1(pi - target)} pp` },
    ];
    flow = clamp(flowParts.reduce((a, b) => a + b.v, 0));
    idr = clamp(-1.5 + 0.12 * flow - 0.5 * (pi - piG) - 0.35 * dxy + 0.6 * (reserves - 6), -60, 25);
  }

  const piGap = pi - target;
  const outputGap = gap;
  const realWage = w - pi;
  const ulc = w - prod;
  const rEx = i - pi;                 // suku bunga riil ex-post

  /* ── pasar tenaga kerja: hasil, bukan input ── */
  const damp = 1 - 0.6 * inf;                            // informalitas meredam PHK formal
  const u = Math.max(1.2, U_NAT - OKUN * outputGap * damp + Math.max(0, -outputGap) * 0.10);
  const underemp = Math.max(4, 8 + 22 * inf + 1.9 * Math.max(0, -outputGap));
  const jobGrowth = 0.55 * g - 0.2;

  /* ── harga yang dirasakan rumah tangga ── */
  const foodInfl = pie + 1.2 + 1.5 * shock + 0.35 * Math.max(0, -idr) + 0.6 * KAPPA * outputGap + 0.02 * commod;
  const fuelPrice = 0.10 * oil * (1 - sub) + 0.30 * Math.max(0, -idr) * (1 - sub);
  const rentGrowth = 2.0 + 0.6 * pi + 0.4 * outputGap + 0.25 * Math.max(0, -rEx);
  const coreOther = pi - shock;
  const cpiBottom = 0.42 * foodInfl + 0.22 * rentGrowth + 0.10 * fuelPrice + 0.26 * coreOther;
  const feltGap = cpiBottom - pi;

  /* ── instrumen ── */
  const kasIDRn = i - 0.75;
  const sbnYield = i + 1.5 + 0.3 * Math.max(0, piGap) - 0.03 * flow + 0.02 * Math.max(0, debtRatio - 40);
  const sbnN = sbnYield - 0.9 * Math.max(0, piGap) - 0.06 * Math.max(0, -flow);
  const ihsgN = 2.5 + (g + 0.8 * pi) - 1.2 * Math.max(0, rEx - 2) - 1.0 * Math.abs(piGap)
    + 0.12 * flow + 0.05 * commod - 0.02 * oil + (pi < 0 ? -6 : 0);
  const propN = 1.5 + 0.5 * g + 0.75 * rentGrowth - 1.2 * Math.max(0, rEx);
  const kasUSDn = iFed - 0.25;
  const ustN = (iFed + 1.2) - 0.9 * Math.max(0, piG - 2);
  const dmEqN = 3 + gG + 0.8 * piG - 1.2 * Math.max(0, rG - 2) - 1.0 * Math.abs(piG - 2) + 0.10 * (riskOn - 50);
  const goldN = 4 - 2.2 * rG + 0.6 * Math.max(0, piG - 2) + 0.10 * (50 - riskOn);
  const commN = 0.55 * commod + 0.25 * oil + 0.4 * gG;
  const btcN = 5 + 1.1 * (riskOn - 50) - 4.0 * rG + 0.3 * Math.max(0, piG - 3) - 6 * Math.max(0, -gG);

  const dom = (n) => n - pi;
  const glo = (n) => n - idr - pi;

  const raw = [
    { name: "Saham Indonesia (IHSG)", cat: "Domestik", v: dom(ihsgN), beta: 1.0, driver: "Laba nominal, arus asing" },
    { name: "Obligasi negara (SBN)", cat: "Domestik", v: dom(sbnN), beta: 0.2, driver: "Kurva imbal hasil, risiko fiskal" },
    { name: "Deposito rupiah", cat: "Domestik", v: dom(kasIDRn), beta: -0.1, driver: "Suku bunga riil domestik" },
    { name: "Properti", cat: "Domestik", v: dom(propN), beta: 0.4, driver: "Sewa, bunga KPR" },
    { name: "Saham global (DM)", cat: "Global", v: glo(dmEqN), beta: 0.9, driver: "Pertumbuhan global, kurs" },
    { name: "Obligasi AS (UST)", cat: "Global", v: glo(ustN), beta: -0.5, driver: "Bunga Fed, aset lindung" },
    { name: "Kas dolar (USD)", cat: "Global", v: glo(kasUSDn), beta: -0.7, driver: "Bunga Fed, kurs" },
    { name: "Emas", cat: "Global", v: glo(goldN), beta: -0.4, driver: "Suku bunga riil global (terbalik)" },
    { name: "Komoditas & energi", cat: "Global", v: glo(commN), beta: 0.7, driver: "Terms of trade, siklus global" },
    { name: "Kripto (BTC)", cat: "Global", v: glo(btcN), beta: 1.6, driver: "Likuiditas global, selera risiko" },
  ];
  const instruments = raw.map((x) => {
    const sent = clamp(50 + 1.6 * x.v + 12 * x.beta * ((riskOn - 50) / 25), 0, 100);
    let flag = null;
    if (sent > 66 && x.v < 2) flag = "Ramai tapi tipis";
    else if (sent < 34 && x.v > 4) flag = "Murah tapi dibenci";
    return { ...x, sent, flag };
  }).sort((a, b) => b.v - a.v);
  const byName = Object.fromEntries(instruments.map((x) => [x.name, x.v]));

  const portReal =
    0.25 * byName["Saham Indonesia (IHSG)"] + 0.25 * byName["Obligasi negara (SBN)"] +
    0.15 * byName["Saham global (DM)"] + 0.10 * byName["Deposito rupiah"] +
    0.10 * byName["Emas"] + 0.10 * byName["Properti"] + 0.05 * byName["Kripto (BTC)"];
  const invScore = clamp(portReal * 9);

  /* ── bank sentral ── */
  const fxStress = Math.max(0, -idr - 8) * 1.2 + Math.max(0, 6 - reserves) * 6;
  const cbScore = clamp(100 - 3 * piGap ** 2 - 1.5 * outputGap ** 2 - (pi < 0 && i < 1.5 ? 25 : 0) - fxStress);
  const credibility = clamp(100 - 12 * Math.abs(pie - target) - 0.6 * Math.max(0, -idr), 0, 100);
  const taylor = target + R_NEUTRAL + 1.5 * piGap + 0.5 * outputGap;

  /* ── bank umum ── */
  const costOfFunds = i + 0.6 + 0.15 * Math.max(0, -flow) / 5;
  const nim = Math.max(0.5, Math.min(8, 2.0 + 0.22 * i - 0.15 * Math.max(0, rEx - 3)));
  const realCredit = clamp(2 + 2.0 * g - 1.0 * Math.max(0, rEx) - 0.2 * Math.max(0, pi - 6) + 0.05 * flow, -20, 25);
  const npl = Math.max(0.5, Math.min(30,
    2 + 0.35 * Math.max(0, rEx - 2) + 0.75 * Math.max(0, -g) + 0.5 * Math.max(0, u - U_NAT)
    + 2.5 * Math.max(0, -pi) + 0.2 * Math.max(0, pi - 8) + 0.4 * Math.max(0, pi - w)
    + 0.10 * Math.max(0, -idr) * (fxDebt / 12)));
  const bankScore = clamp(5 * (nim - 3) + 2.2 * realCredit - 7 * (npl - 3) - 1.2 * Math.max(0, piGap - 2));

  /* ── perusahaan: rincian biaya ── */
  const costLabor = 0.55 * ulc;
  const costImport = 0.20 * (Math.max(0, -idr) + 0.35 * oil);
  const costRent = 0.10 * rentGrowth;
  const costCapital = 0.10 * (rEx + 3);
  const fxDebtHit = 0.35 * Math.max(0, -idr) * (fxDebt / 15);
  const costGrowth = costLabor + costImport + costRent + costCapital + 0.35 * pi;
  const nomRev = g + pi;
  const marginDelta = nomRev - costGrowth;
  const corpScore = clamp(4.5 * g + 2.0 * marginDelta - 2.0 * Math.max(0, rEx - 1)
    - 1.8 * Math.abs(piGap) - 2.0 * Math.max(0, u - U_NAT) + (pi < 0 ? -4 * (1 - pi) : 0) - fxDebtHit);

  /* ── pemerintah ── */
  const subsidyCost = 0.9 + sub * (0.022 * Math.max(0, oil) + 0.03 * Math.max(0, -idr));
  const deficitActual = deficit + (subsidyCost - 0.9) - 0.35 * outputGap;
  const interestBurden = (debtRatio * sbnYield) / 100;
  const debtNext = debtRatio + deficitActual - (debtRatio * (g + pi)) / 100;
  const govScore = clamp(30 - 12 * Math.max(0, deficitActual - 3) - 0.8 * Math.max(0, debtRatio - 40)
    - 14 * Math.max(0, interestBurden - 2.5) + 1.5 * g - 0.5 * Math.max(0, -idr)
    + 0.6 * Math.min(Math.max(pi, 0), 8) - 6 * Math.max(0, debtNext - debtRatio));

  /* ── rakyat ── */
  const kpr = i + 3.5;
  const savingsReal = i - 0.75 - pi;
  const realWageFelt = w - cpiBottom;
  const rentBurden = rentGrowth - w;
  const peopleScore = clamp(6 * realWageFelt - 5 * (u - U_NAT) - 2.2 * Math.max(0, underemp - 21)
    - 1.2 * Math.max(0, rEx) + 2 * g - 1.5 * Math.max(0, rentBurden)
    - (pi > 10 ? 2.5 * (pi - 10) : 0) - 3.0 * Math.max(0, -pi) + (pi < 0 && g < 0 ? -10 : 0));

  /* ── rezim: hasil, bukan pilihan ── */
  let regime, regimeNote;
  if (pi > 15 && g < 2) { regime = "Inflasi ekstrem + kontraksi"; regimeNote = "Uang kehilangan fungsi penyimpan nilai; horizon perencanaan runtuh."; }
  else if (pi > 15) { regime = "Inflasi ekstrem"; regimeNote = "Ekspektasi lepas jangkar; indeksasi harga–upah mengunci spiral."; }
  else if (pi < 0 && g < 0) { regime = "Deflasi–depresi"; regimeNote = "Beban utang riil naik saat pendapatan nominal turun."; }
  else if (pi < 0) { regime = "Deflasi"; regimeNote = "Suku bunga riil naik otomatis meski nominal ditekan ke nol."; }
  else if (piGap > 2 && g < 2) { regime = "Stagflasi"; regimeNote = "Guncangan sisi penawaran: bank sentral tak bisa menolong dua-duanya."; }
  else if (piGap > 2) { regime = "Overheating"; regimeNote = "Permintaan melampaui kapasitas; output gap positif."; }
  else if (g < 0) { regime = "Resesi disinflasi"; regimeNote = "Permintaan lemah menekan harga; ruang pelonggaran terbuka."; }
  else if (Math.abs(piGap) <= 1.5 && g >= gPot - 1) { regime = "Goldilocks"; regimeNote = "Inflasi dekat target, output dekat potensial."; }
  else { regime = "Netral"; regimeNote = "Tidak ada tekanan ekstrem di kedua sisi mandat."; }

  return {
    pi, g, gPot, gap: outputGap, u, underemp, jobGrowth, r, rEx, rG, piGap, ulc,
    idr, flow, flowParts, foodInfl, fuelPrice, rentGrowth, cpiBottom, feltGap,
    instruments, portReal, invScore, sbnYield,
    cbScore, credibility, taylor, fxStress,
    nim, costOfFunds, realCredit, npl, bankScore,
    nomRev, costGrowth, costLabor, costImport, costRent, costCapital, fxDebtHit, marginDelta, corpScore,
    subsidyCost, deficitActual, interestBurden, debtNext, govScore,
    kpr, savingsReal, realWage, realWageFelt, rentBurden, peopleScore,
    regime, regimeNote,
  };
}

/* ────────────────────────────  NARASI  ──────────────────────────── */
function mechanism(key, m, s) {
  const defl = m.pi < 0, stag = m.regime === "Stagflasi", extreme = m.pi > 15, weakIDR = m.idr < -8;
  switch (key) {
    case "cb":
      if (extreme) return "Ekspektasi sudah lepas jangkar, jadi kenaikan bunga bertahap tidak akan menggigit. Yang dibutuhkan penjangkaran ulang nominal, bukan pengetatan marjinal.";
      if (stag) return "Trade-off maksimal. Inflasi datang dari sisi penawaran, sementara instrumen bank sentral hanya bekerja di sisi permintaan — menaikkan bunga tidak menambah pasokan pangan atau menurunkan harga minyak.";
      if (defl) return "Suku bunga riil naik otomatis meski nominal nol. Instrumen tersisa: pelonggaran kuantitatif, panduan ke depan, koordinasi fiskal.";
      if (weakIDR || m.fxStress > 10) return "Mandat ketiga mengambil alih: stabilitas kurs. Bunga harus naik demi menahan arus keluar meski kondisi domestik tidak menuntutnya — inilah yang membedakan bank sentral emerging dari Fed.";
      if (m.piGap > 2) return "Inflasi permintaan relatif mudah ditangani. Naikkan bunga di atas kaidah Taylor, dinginkan output gap, kredibilitas tetap utuh.";
      return "Kedua sisi mandat terpenuhi. Fokus bergeser ke stabilitas sistem keuangan dan penambahan ruang kebijakan.";
    case "bank":
      if (defl) return "Skenario terburuk. Nilai agunan turun, beban utang riil debitur naik, kredit macet meledak, dan marjin tergencet batas bawah bunga simpanan.";
      if (m.npl > 6) return "Kualitas aset menjadi masalah dominan. Penyisihan kerugian memakan modal lebih cepat daripada marjin bunga memulihkannya, dan bank mulai menjatah kredit.";
      if (stag) return "Marjin melebar karena aset repricing lebih cepat dari liabilitas, tapi kualitas kredit memburuk di belakangnya. Untung sekarang, rugi nanti.";
      if (m.rEx > 4) return "Suku bunga riil tinggi: marjin bagus, permintaan kredit mengering, debitur lama mulai gagal bayar.";
      return "Intermediasi sehat: permintaan kredit tumbuh, kredit macet terkendali, marjin stabil.";
    case "corp":
      if (defl) return "Harga jual turun lebih cepat dari biaya tetap dan upah nominal yang kaku ke bawah. Utang nominal menjadi lebih berat secara riil.";
      if (m.fxDebtHit > 4) return "Utang valas adalah masalah utamanya, bukan marjin operasional. Depresiasi memukul neraca lebih cepat daripada pendapatan ekspor menutupnya.";
      if (weakIDR) return "Pelemahan rupiah menaikkan biaya input impor. Eksportir komoditas menang, importir dan pengutang dolar kalah — dampaknya membelah, bukan merata.";
      if (stag) return "Biaya input naik lebih cepat dari kemampuan menaikkan harga karena permintaan lemah. Marjin ditekan dari dua sisi.";
      return "Pertumbuhan nominal melampaui pertumbuhan biaya. Biaya modal wajar, horizon investasi terbuka.";
    case "gov":
      if (m.deficitActual > 5) return "Defisit melewati batas kenyamanan pasar. Penerbitan SBN naik justru saat permintaan asing turun, jadi imbal hasil naik dan beban bunga ikut membesar.";
      if (m.subsidyCost > 2) return "Subsidi energi menyerap ruang fiskal. Guncangan harga minyak masuk ke APBN dulu, bukan ke inflasi — biayanya nyata, hanya lokasinya berpindah.";
      if (m.debtNext > s.debtRatio + 1) return "Rasio utang menaik: pertumbuhan nominal tidak cukup mengalahkan defisit. Dinamika bola salju mulai bekerja melawan.";
      if (m.pi > m.piGap + 4) return "Inflasi mengerosi nilai riil utang lama — pemerintah adalah pengutang nominal terbesar, jadi diam-diam diuntungkan selama imbal hasil belum ikut naik.";
      return "Posisi fiskal berkelanjutan. Pertumbuhan nominal melampaui biaya bunga, rasio utang menurun sendirinya.";
    case "inv":
      if (defl) return "Kas dan obligasi nominal menang; ekuitas, properti, dan kripto kalah. Imbal hasil riil kas positif tanpa mengambil risiko sama sekali.";
      if (stag) return "Aset riil memimpin. Obligasi dan saham turun bersamaan — diversifikasi gagal justru saat paling dibutuhkan.";
      if (m.rG > 2.5) return "Suku bunga riil global tinggi menekan semua aset berdurasi panjang. Emas dan kripto paling terpukul karena tidak punya arus kas untuk membela diri.";
      return "Premi risiko dibayar wajar. Ekuitas memimpin, obligasi memberi bantalan riil positif.";
    case "people":
      if (extreme) return "Pajak paling regresif yang ada. Upah tertinggal dari harga, tabungan tunai musnah, dan yang tidak punya aset tidak punya pelindung apa pun.";
      if (m.feltGap > 1) return `Inflasi yang dirasakan ${f1p(m.cpiBottom)}% jauh di atas angka resmi ${f1p(m.pi)}%, karena pangan dan sewa menempati porsi jauh lebih besar di anggaran rumah tangga bawah. Ini sumber jarak antara data dan persepsi.`;
      if (m.rentBurden > 0) return "Sewa naik lebih cepat dari upah. Kenaikan gaji habis sebelum sampai ke konsumsi lain — daya beli riil turun meski upah nominal naik.";
      if (m.underemp > 24) return "Pengangguran terbuka tetap rendah karena orang berpindah ke sektor informal, bukan karena pasar kerja sehat. Yang naik adalah setengah pengangguran dan pekerjaan rentan.";
      if (m.realWageFelt > 2 && m.u < U_NAT) return "Daya beli naik dan pasar kerja ketat. Posisi tawar tenaga kerja sedang di puncaknya.";
      return "Daya beli stagnan. Kenaikan upah nominal habis dimakan harga.";
    default: return "";
  }
}

function flowNarrative(m) {
  if (m.flow > 45) return "Kondisi risk-on emerging klasik: carry riil tebal, dolar lemah, terms of trade kuat. Modal global mengejar imbal hasil ke SBN dan ekuitas Indonesia, rupiah menguat, dan penguatan itu sendiri menekan inflasi impor.";
  if (m.flow > 12) return "Arus masuk moderat. Investor asing menambah SBN lebih dulu karena likuid dan carry-nya terukur, baru kemudian ekuitas.";
  if (m.flow > -12) return "Posisi netral. Alokasi ke Indonesia mengikuti bobot indeks, bukan keyakinan aktif. Arah berikutnya ditentukan siapa yang bergerak lebih dulu: Fed atau Bank Indonesia.";
  if (m.flow > -45) return "Arus keluar. SBN dipangkas duluan karena paling likuid, menekan imbal hasil naik dan rupiah turun bersamaan — korelasi yang melipatgandakan kerugian pemegang asing.";
  return "Sudden stop. Modal keluar tanpa memandang valuasi; hanya likuiditas dolar yang dicari. Bank sentral kehilangan kendali atas suku bunga domestik dan harus membela kurs.";
}

/* ─────────────────────────────  INPUT  ───────────────────────────── */
const BASE = {
  i: 4.75, target: 3, pie: 2.4, deficit: 2.5,
  w: 5.5, prod: 1.6, shock: 0, informal: 58,
  iFed: 4.0, piG: 2.6, gG: 3.0, dxy: 0, riskOn: 55,
  oil: 0, commod: 5, subsidy: 60, fxDebt: 12, reserves: 6.5, debtRatio: 40,
};

const GROUPS = [
  {
    title: "Kebijakan moneter & fiskal", color: C.gold, items: [
      { k: "i", label: "Suku bunga acuan (BI)", min: 0, max: 30, step: 0.25, unit: "%" },
      { k: "target", label: "Target inflasi", min: 0, max: 8, step: 0.5, unit: "%" },
      { k: "pie", label: "Ekspektasi inflasi", min: -2, max: 25, step: 0.1, unit: "%" },
      { k: "deficit", label: "Defisit APBN", min: -2, max: 10, step: 0.1, unit: "% PDB" },
      { k: "debtRatio", label: "Rasio utang pemerintah", min: 10, max: 140, step: 1, unit: "% PDB" },
    ],
  },
  {
    title: "Penawaran & tenaga kerja", color: C.violet, items: [
      { k: "w", label: "Pertumbuhan upah nominal", min: -10, max: 40, step: 0.1, unit: "%" },
      { k: "prod", label: "Pertumbuhan produktivitas", min: -2, max: 5, step: 0.1, unit: "%" },
      { k: "shock", label: "Guncangan pasokan ke IHK", min: -5, max: 15, step: 0.1, unit: " pp" },
      { k: "informal", label: "Pangsa sektor informal", min: 20, max: 78, step: 1, unit: "%" },
    ],
  },
  {
    title: "Global", color: C.cool, items: [
      { k: "iFed", label: "Suku bunga Fed", min: 0, max: 20, step: 0.25, unit: "%" },
      { k: "piG", label: "Inflasi negara maju", min: -3, max: 15, step: 0.1, unit: "%" },
      { k: "gG", label: "Pertumbuhan global", min: -5, max: 7, step: 0.1, unit: "%" },
      { k: "dxy", label: "Indeks dolar (YoY)", min: -20, max: 25, step: 0.5, unit: "%" },
      { k: "riskOn", label: "Selera risiko global", min: 0, max: 100, step: 1, unit: "" },
    ],
  },
  {
    title: "Energi, komoditas, & posisi eksternal", color: C.warn, items: [
      { k: "oil", label: "Harga minyak Brent (YoY)", min: -60, max: 150, step: 1, unit: "%" },
      { k: "commod", label: "Komoditas ekspor (YoY)", min: -50, max: 120, step: 1, unit: "%" },
      { k: "subsidy", label: "Cakupan subsidi energi", min: 0, max: 100, step: 1, unit: "" },
      { k: "fxDebt", label: "Utang valas korporasi", min: 0, max: 45, step: 0.5, unit: "% PDB" },
      { k: "reserves", label: "Cadangan devisa", min: 0.5, max: 14, step: 0.1, unit: " bln impor" },
    ],
  },
];

const PRESETS = [
  { label: "Indonesia, normal", s: { ...BASE } },
  { label: "Goldilocks global", s: { ...BASE, i: 4.5, pie: 2.6, w: 6.5, prod: 2.4, iFed: 2.5, piG: 2.0, gG: 3.8, dxy: -5, riskOn: 80, oil: 5, commod: 18 } },
  { label: "Guncangan minyak", s: { ...BASE, oil: 95, commod: 40, shock: 3.5, pie: 5.5, i: 6.0, gG: 1.2, dxy: 7, riskOn: 22, subsidy: 75, deficit: 4.2 } },
  { label: "Fed hawkish 2022", s: { ...BASE, iFed: 5.0, piG: 8.0, gG: 2.0, dxy: 14, riskOn: 25, i: 5.75, pie: 4.2, oil: 55, commod: 85 } },
  { label: "Likuiditas banjir 2021", s: { ...BASE, iFed: 0.1, piG: 3.5, gG: 5.5, dxy: -5, riskOn: 92, i: 3.5, pie: 2.0, oil: 45, commod: 60, deficit: 5.5 } },
  { label: "Deflasi & jebakan likuiditas", s: { ...BASE, i: 0.5, pie: 0.2, target: 2, w: 0, prod: 1.0, shock: -3, iFed: 0.5, piG: 0.5, gG: 1.0, riskOn: 45, oil: -35, commod: -28, deficit: 5 } },
  { label: "Krismon 1998", s: { ...BASE, i: 30, pie: 16, target: 5, w: 12, prod: -1.5, shock: 10, deficit: 6.5, debtRatio: 70, iFed: 5.5, piG: 2.2, gG: 2.5, dxy: 15, riskOn: 6, oil: -35, commod: -28, fxDebt: 36, reserves: 1.6, subsidy: 80 } },
];

/* ─────────────────────────────  UI  ───────────────────────────── */
const scoreColor = (v) => (v > 12 ? C.pos : v < -12 ? C.neg : C.gold);
const verdict = (v) => v >= 55 ? "sangat diuntungkan" : v >= 15 ? "diuntungkan" : v > -15 ? "netral" : v > -55 ? "dirugikan" : "sangat dirugikan";
const fgLabel = (v) => v < 20 ? "Sangat takut" : v < 40 ? "Takut" : v < 60 ? "Netral" : v < 80 ? "Serakah" : "Sangat serakah";
const fgColor = (v) => v < 20 ? "#4E7FA0" : v < 40 ? C.cool : v < 60 ? C.dim : v < 80 ? C.warn : C.neg;

function Slider({ def, value, onChange }) {
  return (
    <div style={{ marginBottom: 13 }}>
      <div className="flex items-baseline justify-between" style={{ marginBottom: 3 }}>
        <span style={{ fontSize: 12, color: C.dim }}>{def.label}</span>
        <span style={{ ...num, fontSize: 13, color: C.text }}>
          {f1p(value)}<span style={{ color: C.dimmer, fontSize: 10.5 }}>{def.unit}</span>
        </span>
      </div>
      <input type="range" min={def.min} max={def.max} step={def.step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", accentColor: C.gold, cursor: "grab", height: 14 }} />
    </div>
  );
}

function Stat({ label, value, tone, sub }) {
  return (
    <div style={{ borderLeft: `2px solid ${tone || C.ruleSoft}`, paddingLeft: 10 }}>
      <div style={{ fontSize: 11, color: C.dimmer, marginBottom: 2 }}>{label}</div>
      <div style={{ ...num, fontSize: 15.5, color: tone || C.text }}>{value}</div>
      {sub && <div style={{ fontSize: 10.5, color: C.dimmer, marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

function LedgerRow({ name, subtitle, score, stats, note, last }) {
  const col = scoreColor(score), pct = Math.abs(score) / 2;
  return (
    <div style={{ borderBottom: last ? "none" : `1px solid ${C.ruleSoft}`, padding: "18px 0" }}>
      <div className="flex flex-wrap items-baseline justify-between" style={{ gap: 8 }}>
        <div>
          <div style={{ fontSize: 17, color: C.text, letterSpacing: "-0.01em" }}>{name}</div>
          <div style={{ fontSize: 12, color: C.dimmer }}>{subtitle}</div>
        </div>
        <div className="text-right">
          <div style={{ ...num, fontSize: 22, color: col, lineHeight: 1 }}>{f1(score)}</div>
          <div style={{ fontSize: 11, color: C.dimmer }}>{verdict(score)}</div>
        </div>
      </div>
      <div style={{ position: "relative", height: 10, marginTop: 12, marginBottom: 14, background: C.panel2, borderRadius: 2 }}>
        <div style={{ position: "absolute", left: "50%", top: -4, bottom: -4, width: 1, background: C.rule }} />
        <div style={{ position: "absolute", top: 0, bottom: 0, borderRadius: 2, background: col, left: score >= 0 ? "50%" : `${50 - pct}%`, width: `${pct}%` }} />
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", marginBottom: 12 }}>
        {stats.map((x) => <Stat key={x.label} {...x} />)}
      </div>
      <p style={{ fontSize: 13, lineHeight: 1.6, color: C.dim, maxWidth: "72ch", margin: 0 }}>{note}</p>
    </div>
  );
}

function tendency(v, rank) {
  if (v >= 4 && rank < 4) return { t: "Tambah bobot", c: C.pos };
  if (v >= 1) return { t: "Netral positif", c: C.gold };
  if (v > -2) return { t: "Netral", c: C.dim };
  return { t: "Kurangi bobot", c: C.neg };
}

function InstrumentTable({ items }) {
  const max = Math.max(...items.map((x) => Math.abs(x.v)), 5);
  return (
    <div>
      <div className="flex" style={{ fontSize: 11, color: C.dimmer, borderBottom: `1px solid ${C.rule}`, paddingBottom: 6 }}>
        <div style={{ flex: "1 1 auto" }}>Instrumen</div>
        <div style={{ width: 104, flex: "0 0 auto" }}>Imbal riil (IDR)</div>
        <div style={{ width: 132, flex: "0 0 auto" }}>Sentimen pasar</div>
        <div style={{ width: 100, flex: "0 0 auto", textAlign: "right" }}>Arah</div>
      </div>
      {items.map((it, k) => {
        const td = tendency(it.v, k);
        const wBar = (Math.abs(it.v) / max) * 50;
        return (
          <div key={it.name} className="flex items-center" style={{ padding: "9px 0", borderBottom: `1px solid ${C.ruleSoft}` }}>
            <div style={{ flex: "1 1 auto", minWidth: 0 }}>
              <div style={{ fontSize: 13.5, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.name}</div>
              <div style={{ fontSize: 11, color: C.dimmer, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                <span style={{ color: it.cat === "Global" ? C.cool : C.gold }}>{it.cat}</span> · {it.driver}
                {it.flag && <span style={{ color: C.warn }}> · {it.flag}</span>}
              </div>
            </div>
            <div style={{ width: 104, flex: "0 0 auto" }}>
              <div style={{ ...num, fontSize: 13.5, color: it.v >= 0 ? C.pos : C.neg, marginBottom: 3 }}>{f1(it.v)}%</div>
              <div style={{ position: "relative", height: 4, background: C.panel2 }}>
                <div style={{ position: "absolute", left: "50%", top: -2, bottom: -2, width: 1, background: C.rule }} />
                <div style={{ position: "absolute", top: 0, bottom: 0, background: it.v >= 0 ? C.pos : C.neg, left: it.v >= 0 ? "50%" : `${50 - wBar}%`, width: `${wBar}%` }} />
              </div>
            </div>
            <div style={{ width: 132, flex: "0 0 auto", paddingRight: 12 }}>
              <div style={{ fontSize: 11.5, color: fgColor(it.sent), marginBottom: 3 }}>
                {fgLabel(it.sent)} <span style={{ ...num, color: C.dimmer }}>{it.sent.toFixed(0)}</span>
              </div>
              <div style={{ position: "relative", height: 4, background: C.panel2 }}>
                <div style={{ position: "absolute", top: -3, bottom: -3, width: 2, background: fgColor(it.sent), left: `calc(${it.sent}% - 1px)` }} />
              </div>
            </div>
            <div style={{ width: 100, flex: "0 0 auto", textAlign: "right", fontSize: 12, color: td.c }}>{td.t}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────  APP  ───────────────────────────── */
export default function SimulatorMakro() {
  const [s, setS] = useState({ ...BASE });
  const m = useMemo(() => computeModel(s), [s]);
  const set = (k) => (v) => setS((p) => ({ ...p, [k]: v }));

  const derived = [
    { label: "Inflasi IHK", value: `${f1p(m.pi)}%`, tone: Math.abs(m.piGap) > 2 ? C.neg : C.pos, sub: `target ${f1p(s.target)}%` },
    { label: "Pertumbuhan PDB riil", value: `${f1p(m.g)}%`, sub: `potensial ${f1p(m.gPot)}%` },
    { label: "Output gap", value: `${f1(m.gap)} pp`, tone: m.gap < -1 ? C.neg : C.pos },
    { label: "Pengangguran terbuka", value: `${f1p(m.u)}%`, sub: "hasil hukum Okun" },
    { label: "Setengah pengangguran", value: `${f1p(m.underemp)}%`, tone: m.underemp > 24 ? C.neg : C.dim, sub: "penyerap guncangan sebenarnya" },
    { label: "Suku bunga riil", value: `${f1(m.rEx)}%`, tone: m.rEx < 0 ? C.warn : C.dim },
    { label: "Rupiah", value: `${f1(m.idr)}%`, tone: m.idr < 0 ? C.neg : C.pos },
    { label: "Inflasi pangan", value: `${f1p(m.foodInfl)}%`, tone: m.foodInfl > m.pi + 1.5 ? C.neg : C.dim },
    { label: "Kenaikan sewa", value: `${f1p(m.rentGrowth)}%`, tone: m.rentBurden > 0 ? C.neg : C.dim },
    { label: "Harga BBM", value: `${f1(m.fuelPrice)}%`, tone: m.fuelPrice > 5 ? C.neg : C.dim },
    { label: "Imbal hasil SBN 10T", value: `${f1p(m.sbnYield)}%` },
    { label: "Defisit aktual", value: `${f1p(m.deficitActual)}%`, tone: m.deficitActual > 3 ? C.neg : C.pos, sub: `subsidi ${f1p(m.subsidyCost)}% PDB` },
  ];

  const rows = [
    {
      key: "cb", name: "Bank sentral", subtitle: "Harga, output, dan stabilitas kurs", score: m.cbScore,
      stats: [
        { label: "Deviasi dari target", value: `${f1(m.piGap)} pp`, tone: Math.abs(m.piGap) > 2 ? C.neg : C.pos },
        { label: "Kredibilitas", value: `${m.credibility.toFixed(0)}/100`, sub: "dari jangkar ekspektasi" },
        { label: "Kaidah Taylor", value: `${f1p(m.taylor)}%`, tone: m.taylor > s.i + 1 ? C.warn : C.dim, sub: `aktual ${f1p(s.i)}%` },
        { label: "Tekanan kurs", value: f1p(m.fxStress), tone: m.fxStress > 10 ? C.neg : C.pos },
      ],
    },
    {
      key: "bank", name: "Bank umum", subtitle: "Marjin, volume, kualitas aset", score: m.bankScore,
      stats: [
        { label: "Marjin bunga bersih", value: `${f1p(m.nim)}%` },
        { label: "Biaya dana", value: `${f1p(m.costOfFunds)}%` },
        { label: "Kredit riil", value: `${f1(m.realCredit)}%` },
        { label: "Kredit macet", value: `${f1p(m.npl)}%`, tone: m.npl > 5 ? C.neg : C.pos },
      ],
    },
    {
      key: "corp", name: "Pemilik perusahaan", subtitle: "Marjin, biaya input, beban valas", score: m.corpScore,
      stats: [
        { label: "Pendapatan nominal", value: `${f1(m.nomRev)}%` },
        { label: "Biaya tenaga kerja", value: `${f1(m.costLabor)} pp`, sub: `ULC ${f1(m.ulc)}%` },
        { label: "Biaya impor + energi", value: `${f1(m.costImport)} pp`, tone: m.costImport > 2 ? C.neg : C.dim },
        { label: "Biaya sewa & lahan", value: `${f1(m.costRent)} pp` },
        { label: "Beban utang valas", value: `${f1(m.fxDebtHit)} pp`, tone: m.fxDebtHit > 2 ? C.neg : C.dim },
        { label: "Perubahan marjin", value: `${f1(m.marginDelta)} pp`, tone: m.marginDelta < 0 ? C.neg : C.pos },
      ],
    },
    {
      key: "gov", name: "Pemerintah", subtitle: "Anggaran, utang, subsidi", score: m.govScore,
      stats: [
        { label: "Defisit aktual", value: `${f1p(m.deficitActual)}%`, tone: m.deficitActual > 3 ? C.neg : C.pos },
        { label: "Biaya subsidi energi", value: `${f1p(m.subsidyCost)}% PDB`, tone: m.subsidyCost > 2 ? C.neg : C.dim },
        { label: "Beban bunga", value: `${f1p(m.interestBurden)}% PDB`, tone: m.interestBurden > 2.5 ? C.neg : C.dim },
        { label: "Rasio utang tahun depan", value: `${f1p(m.debtNext)}%`, tone: m.debtNext > s.debtRatio ? C.neg : C.pos, sub: `kini ${f1p(s.debtRatio)}%` },
      ],
    },
    {
      key: "inv", name: "Investor", subtitle: "Imbal hasil riil rupiah dan sentimen", score: m.invScore,
      stats: [
        { label: "Instrumen terbaik", value: m.instruments[0].name.split(" (")[0], tone: C.pos },
        { label: "Instrumen terburuk", value: m.instruments[m.instruments.length - 1].name.split(" (")[0], tone: C.neg },
        { label: "Portofolio gabungan", value: `${f1(m.portReal)}%`, tone: m.portReal < 0 ? C.neg : C.pos },
        { label: "Suku bunga riil global", value: `${f1(m.rG)}%` },
      ],
    },
    {
      key: "people", name: "Rakyat", subtitle: "Daya beli, pekerjaan, biaya hidup", score: m.peopleScore,
      stats: [
        { label: "Inflasi yang dirasakan", value: `${f1p(m.cpiBottom)}%`, tone: m.feltGap > 0.8 ? C.neg : C.dim, sub: `resmi ${f1p(m.pi)}%` },
        { label: "Upah riil efektif", value: `${f1(m.realWageFelt)}%`, tone: m.realWageFelt < 0 ? C.neg : C.pos },
        { label: "Sewa vs upah", value: `${f1(m.rentBurden)} pp`, tone: m.rentBurden > 0 ? C.neg : C.pos },
        { label: "Pengangguran", value: `${f1p(m.u)}%`, sub: `setengah nganggur ${f1p(m.underemp)}%` },
        { label: "Bunga kredit konsumsi", value: `${f1p(m.kpr)}%` },
        { label: "Tabungan riil", value: `${f1(m.savingsReal)}%`, tone: m.savingsReal < 0 ? C.neg : C.pos },
      ],
    },
  ];

  const barData = rows.map((r) => ({ name: r.name, v: +r.score.toFixed(1) }));
  const regimeTone = ["Goldilocks", "Netral"].includes(m.regime) ? C.pos
    : ["Overheating", "Resesi disinflasi"].includes(m.regime) ? C.warn : C.neg;

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: "100vh", fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto", padding: "28px 20px 60px" }}>

        <div style={{ borderBottom: `1px solid ${C.rule}`, paddingBottom: 20, marginBottom: 22 }}>
          <div style={{ fontSize: 12, color: C.dimmer, marginBottom: 10 }}>
            Simulator makro kausal · penggerak di kiri, akibat di kanan
          </div>
          <h1 style={{ fontSize: "clamp(30px, 5.2vw, 56px)", lineHeight: 1.02, margin: 0, letterSpacing: "-0.035em", fontWeight: 600, color: regimeTone }}>
            {m.regime}
          </h1>
          <p style={{ fontSize: 15, color: C.dim, maxWidth: "68ch", marginTop: 12, lineHeight: 1.55 }}>{m.regimeNote}</p>
        </div>

        <div className="grid gap-7" style={{ gridTemplateColumns: "minmax(250px, 292px) minmax(0, 1fr)" }}>

          {/* KONSOL: hanya penggerak */}
          <div>
            <div style={{ position: "sticky", top: 16 }}>
              <div style={{ background: C.panel, border: `1px solid ${C.rule}`, borderRadius: 4, padding: 15, maxHeight: "calc(100vh - 120px)", overflowY: "auto" }}>
                <div style={{ fontSize: 11, color: C.dimmer, marginBottom: 14, lineHeight: 1.5 }}>
                  Hanya variabel yang benar-benar eksogen atau bisa dipilih pembuat kebijakan. Inflasi,
                  pertumbuhan, pengangguran, dan kurs dihitung dari sini.
                </div>
                {GROUPS.map((grp, gi) => (
                  <div key={grp.title} style={{ marginBottom: gi === GROUPS.length - 1 ? 0 : 16 }}>
                    <div style={{ fontSize: 11.5, color: grp.color, marginBottom: 10 }}>{grp.title}</div>
                    {grp.items.map((d) => <Slider key={d.k} def={d} value={s[d.k]} onChange={set(d.k)} />)}
                    {gi < GROUPS.length - 1 && <div style={{ height: 1, background: C.rule, marginTop: 12 }} />}
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, color: C.dimmer, marginBottom: 8 }}>Muat skenario</div>
                <div className="flex flex-wrap" style={{ gap: 6 }}>
                  {PRESETS.map((p) => (
                    <button key={p.label} onClick={() => setS(p.s)}
                      style={{ fontSize: 12, padding: "6px 10px", borderRadius: 3, cursor: "pointer", background: C.panel2, color: C.dim, border: `1px solid ${C.rule}` }}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div style={{ minWidth: 0 }}>

            {/* HASIL TURUNAN */}
            <div style={{ background: C.derived, border: `1px solid ${C.rule}`, borderLeft: `3px solid ${C.pos}`, borderRadius: 4, padding: 16, marginBottom: 24 }}>
              <div className="flex items-baseline justify-between" style={{ marginBottom: 14 }}>
                <span style={{ fontSize: 15, color: C.text }}>Keadaan ekonomi yang dihasilkan</span>
                <span style={{ fontSize: 11, color: C.dimmer }}>tidak bisa digeser langsung — semuanya akibat</span>
              </div>
              <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
                {derived.map((d) => <Stat key={d.label} {...d} />)}
              </div>
            </div>

            {/* ARUS MODAL */}
            <div style={{ background: C.panel, border: `1px solid ${C.rule}`, borderRadius: 4, padding: 18, marginBottom: 24 }}>
              <div className="flex flex-wrap items-baseline justify-between" style={{ gap: 8, marginBottom: 14 }}>
                <span style={{ fontSize: 15, color: C.text }}>Arus modal global menuju Indonesia</span>
                <span style={{ ...num, fontSize: 22, color: scoreColor(m.flow) }}>{f1(m.flow)}</span>
              </div>
              <div style={{ position: "relative", height: 14, background: C.panel2, borderRadius: 2, marginBottom: 6 }}>
                <div style={{ position: "absolute", left: "50%", top: -5, bottom: -5, width: 1, background: C.rule }} />
                <div style={{ position: "absolute", top: 0, bottom: 0, borderRadius: 2, background: scoreColor(m.flow), left: m.flow >= 0 ? "50%" : `${50 + m.flow / 2}%`, width: `${Math.abs(m.flow) / 2}%` }} />
              </div>
              <div className="flex justify-between" style={{ fontSize: 11, color: C.dimmer, marginBottom: 15 }}>
                <span>Keluar ke aset dolar</span><span>Masuk ke aset Indonesia</span>
              </div>
              <div className="grid gap-x-6 gap-y-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(255px, 1fr))", marginBottom: 14 }}>
                {m.flowParts.map((p) => {
                  const wpx = Math.min(50, Math.abs(p.v) / 1.4);
                  return (
                    <div key={p.label} className="flex items-center" style={{ gap: 10 }}>
                      <div style={{ flex: "1 1 auto", fontSize: 12, color: C.dim }}>{p.label}</div>
                      <div style={{ ...num, fontSize: 11, color: C.dimmer, width: 62, textAlign: "right" }}>{p.raw}</div>
                      <div style={{ position: "relative", width: 70, height: 5, background: C.panel2, flex: "0 0 auto" }}>
                        <div style={{ position: "absolute", left: "50%", top: -2, bottom: -2, width: 1, background: C.rule }} />
                        <div style={{ position: "absolute", top: 0, bottom: 0, background: p.v >= 0 ? C.pos : C.neg, left: p.v >= 0 ? "50%" : `${50 - wpx}%`, width: `${wpx}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <p style={{ fontSize: 13, lineHeight: 1.6, color: C.dim, maxWidth: "74ch", margin: 0 }}>{flowNarrative(m)}</p>
              {m.idr < -4 && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.ruleSoft}`, fontSize: 12.5, color: C.warn, lineHeight: 1.6 }}>
                  Umpan balik kurs aktif: pelemahan {f1p(Math.abs(m.idr))}% menambah sekitar {f1p(0.22 * Math.abs(m.idr))} pp inflasi impor,
                  menaikkan kredit macet lewat utang valas, dan memaksa bunga naik lagi.
                </div>
              )}
            </div>

            {/* INSTRUMEN */}
            <div style={{ marginBottom: 24 }}>
              <div className="flex flex-wrap items-baseline justify-between" style={{ marginBottom: 10, gap: 8 }}>
                <span style={{ fontSize: 15, color: C.text }}>Rotasi instrumen dan sentimen pasar</span>
                <span style={{ fontSize: 11, color: C.dimmer }}>sentimen tinggi + imbal hasil rendah = ramai dan mahal</span>
              </div>
              <InstrumentTable items={m.instruments} />
            </div>

            {/* LEDGER */}
            <div className="flex items-baseline justify-between" style={{ borderBottom: `1px solid ${C.rule}`, paddingBottom: 8 }}>
              <span style={{ fontSize: 15, color: C.text }}>Dampak bersih per pemangku kepentingan</span>
              <span style={{ ...num, fontSize: 11, color: C.dimmer }}>−100 · 0 · +100</span>
            </div>
            {rows.map((r, idx) => (
              <LedgerRow key={r.key} {...r} last={idx === rows.length - 1} note={mechanism(r.key, m, s)} />
            ))}

            <div style={{ background: C.panel, border: `1px solid ${C.rule}`, borderRadius: 4, padding: 14, marginTop: 22 }}>
              <div style={{ fontSize: 13, color: C.dim, marginBottom: 10 }}>Peringkat pemenang dan pecundang</div>
              <ResponsiveContainer width="100%" height={215}>
                <BarChart data={barData} layout="vertical" margin={{ left: 4, right: 12, top: 4, bottom: 4 }}>
                  <XAxis type="number" domain={[-100, 100]} tick={{ fill: C.dimmer, fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={118} tick={{ fill: C.dim, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <ReferenceLine x={0} stroke={C.rule} />
                  <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }}
                    contentStyle={{ background: C.panel2, border: `1px solid ${C.rule}`, borderRadius: 3, fontSize: 12 }}
                    labelStyle={{ color: C.text }} formatter={(v) => [f1(v), "skor"]} />
                  <Bar dataKey="v" radius={[0, 2, 2, 0]}>
                    {barData.map((d, k) => <Cell key={k} fill={scoreColor(d.v)} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <p style={{ fontSize: 12, color: C.dimmer, marginTop: 20, lineHeight: 1.6, maxWidth: "80ch" }}>
              Indeks heuristik, bukan proyeksi. Rangkanya: kurva Phillips berbasis ekspektasi untuk inflasi,
              kesenjangan suku bunga riil dan impuls fiskal untuk output, hukum Okun teredam informalitas untuk
              tenaga kerja, dan paritas suku bunga tak terlindungi untuk kurs. Kurs dan inflasi diselesaikan
              secara iteratif karena saling memengaruhi. Tidak dimodelkan: intervensi kurs aktif, kontrol modal,
              perbedaan sektor, dan jeda waktu antar-periode — semua efek muncul serentak, padahal transmisi
              moneter nyata butuh dua sampai enam kuartal.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
