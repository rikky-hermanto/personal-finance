/* Kantong budgeting — derived fixtures. All money in rupiah integers (server side: decimal). */
window.KT = (function () {
  const rp = (n) => (n < 0 ? '−' : '') + 'Rp ' + Math.abs(Math.round(n)).toLocaleString('id-ID');
  const rpShort = (n) => {
    const a = Math.abs(n), s = n < 0 ? '−' : '';
    if (a >= 1e6) { const v = a / 1e6; return s + 'Rp ' + (v >= 10 ? Math.round(v) : v.toFixed(1).replace('.', ',').replace(',0', '')) + 'jt'; }
    if (a >= 1e3) return s + 'Rp ' + Math.round(a / 1e3) + 'rb';
    return s + 'Rp ' + a;
  };

  // Median of the last 3 months, per kantong. Median not mean — one Ramadan month must not set the budget.
  const median = { income: 8000000, wajib: 4200000, bebas: 3100000, sisa: 700000 };
  const months = ['Mei', 'Jun', 'Jul'];
  const monthly = {
    income: [7850000, 8000000, 8420000],
    wajib: [4160000, 4200000, 4245000],
    bebas: [2870000, 3100000, 3380000],
  };
  const softFloor = Math.round(median.bebas * 0.8); // 2.480.000

  // Wajib line items — the blob must be openable, or the "check it" caveat has nothing to check.
  const wajibItems = [
    { id: 'kos', name: 'Sewa kos', amount: 1800000, due: '2 Agu', src: 'BCA', mode: 'fixed', certain: true, paid: true },
    { id: 'kta', name: 'Cicilan KTA', amount: 1150000, due: '5 Agu', src: 'BCA', mode: 'fixed', certain: true, paid: true },
    { id: 'transport', name: 'Transport kerja', amount: 405000, due: 'harian', src: 'Jago · GoPay', mode: 'est', certain: false, note: 'ditebak dari 41 transaksi' },
    { id: 'indihome', name: 'Indihome', amount: 385000, due: '20 Agu', src: 'BCA', mode: 'fixed', certain: true },
    { id: 'pln', name: 'Listrik PLN', amount: 310000, due: '15 Agu', src: 'Superbank', mode: 'var', certain: false, note: 'naik-turun ±18%' },
    { id: 'bpjs', name: 'BPJS', amount: 150000, due: '10 Agu', src: 'BCA', mode: 'fixed', certain: true },
  ];

  // Simpanan: the only kantong that gets a goal.
  const simpanan = { target: 12600000, now: 4800000, label: 'Dana Darurat', months: 3 };

  const daysInMonth = 31;

  // Per-state fixtures. spent = Bebas consumed so far.
  const states = {
    watch:   { day: 12, monthsLearned: 1 },
    daily:   { day: 17, spent: 868000, biggest: null },
    forecast:{ day: 26, spent: 2610000, pace7: 86000 },
    depleted:{ day: 24, spent: 2843000, biggest: { name: 'Makan di luar', amount: 1100000, usual: 700000 } },
    receipt: {
      day: 31, wajibStreak: 3, simpananPlanned: 1000000, simpananActual: 600000,
      transfers: [
        { from: 'BCA', to: 'Jago · Dana Darurat', amount: 400000, date: '25 Jul' },
        { from: 'BCA', to: 'Bibit · RDPU', amount: 200000, date: '28 Jul' },
      ],
      bebasOver: 240000,
      biggest: { name: 'Makan di luar', amount: 1100000, usual: 700000 },
      suggest: 1200000,
    },
  };

  const runway = { liquid: 5900000, coversUntil: '15 Sept', days: 43, variance: 0.34 };

  return { rp, rpShort, median, monthly, months, softFloor, wajibItems, simpanan, daysInMonth, states, runway };
})();
