/* Buckets budgeting — derived fixtures. Money as integer rupiah (decimal server-side, FIN-01). */
window.BK = (function () {
  const rp = (n) => (n < 0 ? '−' : '') + 'Rp ' + Math.abs(Math.round(n)).toLocaleString('en-US');
  const rpShort = (n) => {
    const a = Math.abs(n), s = n < 0 ? '−' : '';
    if (a >= 1e6) { const v = a / 1e6; const t = v >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10); return s + 'Rp ' + t + 'M'; }
    if (a >= 1e3) return s + 'Rp ' + Math.round(a / 1e3) + 'K';
    return s + 'Rp ' + a;
  };

  // Median of the last 3 months — not the mean. One Ramadan month must not set the budget.
  const median = { income: 8000000, committed: 4200000, free: 3100000, leftover: 700000 };
  const months = ['May', 'Jun', 'Jul'];
  const softFloor = Math.round(median.free * 0.8); // 2,480,000

  // Committed line items. The blob must be openable or the "check it" caveat has nothing to check.
  const committedItems = [
    { id: 'rent', name: 'Room rent', amount: 1800000, due: 'Aug 2', src: 'BCA', certain: true, paid: true },
    { id: 'kta', name: 'KTA installment', amount: 1150000, due: 'Aug 5', src: 'BCA', certain: true, paid: true },
    { id: 'commute', name: 'Commuting', amount: 405000, due: 'daily', src: 'Jago · GoPay', certain: false, note: 'inferred from 41 transactions' },
    { id: 'internet', name: 'Home internet', amount: 385000, due: 'Aug 20', src: 'BCA', certain: true },
    { id: 'power', name: 'Electricity', amount: 310000, due: 'Aug 15', src: 'Superbank', certain: false, note: 'varies ±18%' },
    { id: 'bpjs', name: 'Health insurance', amount: 150000, due: 'Aug 10', src: 'BCA', certain: true },
  ];

  // Future is the tap; goals are what it fills. Only the emergency fund exists today.
  const goal = { label: 'Emergency fund', target: 12600000, now: 4800000, months: 3, cash: true };

  const daysInMonth = 31;

  const states = {
    learning: { day: 12, monthsLearned: 1 },
    daily:    { day: 17, spent: 868000 },
    forecast: { day: 26, spent: 2610000, pace7: 86000 },
    exhausted:{ day: 24, spent: 2843000, biggest: { name: 'Eating out', amount: 1100000, usual: 700000 } },
    shortfall:{ day: 3, arrived: 6150000, arrivedOn: 'Aug 1', spent: 0 },
    close: {
      day: 31, streak: 3, futurePlanned: 1000000, futureActual: 600000,
      transfers: [
        { from: 'BCA', to: 'Jago · Emergency fund', amount: 400000, date: 'Jul 25' },
        { from: 'BCA', to: 'Bibit · money market', amount: 200000, date: 'Jul 28' },
      ],
      freeOver: 240000,
      biggest: { name: 'Eating out', amount: 1100000, usual: 700000 },
      suggest: 1200000,
    },
  };

  const runway = { liquid: 5900000, coversUntil: 'Sep 15', days: 43, variance: 0.34 };

  return { rp, rpShort, median, months, softFloor, committedItems, goal, daysInMonth, states, runway };
})();
