/* Persisted dummy-data store. Seeds a deterministic 12-month ledger (Nov 2025 → 25 Oct 2026),
   saves every mutation to localStorage, and re-derives the window.PF view-models the pages read. */
window.PFStore = (function () {
  const KEY = 'pf_store_v1';
  const TODAY = '2026-10-25';
  const PF = window.PF;

  const ACCOUNTS = [
    { id: 'acc-bca', name: 'BCA Main', institutionId: 'inst-bca', currency: 'IDR', openingBalance: 18000000, openingDate: '2025-10-31' },
    { id: 'acc-super', name: 'Superbank', institutionId: 'inst-super', currency: 'IDR', openingBalance: 3000000, openingDate: '2025-10-31' },
    { id: 'acc-neo', name: 'Neo Commerce', institutionId: 'inst-neo', currency: 'IDR', openingBalance: 2000000, openingDate: '2025-10-31' },
    { id: 'acc-jago', name: 'Jago Pocket', institutionId: 'inst-jago', currency: 'IDR', openingBalance: 800000, openingDate: '2025-10-31' },
  ];
  const INSTITUTIONS = [
    { id: 'inst-bca', name: 'Bank Central Asia', type: 'bank' },
    { id: 'inst-super', name: 'Superbank', type: 'digital bank' },
    { id: 'inst-neo', name: 'Bank Neo Commerce', type: 'digital bank' },
    { id: 'inst-jago', name: 'Bank Jago', type: 'digital bank' },
    { id: 'inst-bibit', name: 'Bibit', type: 'broker' },
    { id: 'inst-ajaib', name: 'Ajaib Sekuritas', type: 'broker' },
  ];
  const CATEGORIES = ['Salary', 'Bonus', 'Refund', 'Food & Dining', 'Groceries', 'Transport', 'Bills & Utilities', 'Insurance', 'Subscriptions', 'Shopping', 'Medical', 'Entertainment', 'Travel', 'Loan Payment', 'Credit Card Payment', 'Investment', 'Transfer'];

  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const pad = (n) => String(n).padStart(2, '0');

  function seedTransactions() {
    const r = rng(20261025);
    const between = (a, b) => Math.round((a + r() * (b - a)) / 500) * 500;
    const pick = (arr) => arr[Math.floor(r() * arr.length)];
    const out = []; let n = 1;
    const add = (date, description, amount, flow, type, category, accountId) => { if (date <= TODAY) out.push({ id: 't' + (n++), date, description, amount, flow, type, category, accountId }); };
    for (let k = 0; k < 12; k++) {
      const y = 2025 + Math.floor((10 + k) / 12), mo = ((10 + k) % 12) + 1;
      const dim = new Date(y, mo, 0).getDate();
      const d = (day) => `${y}-${pad(mo)}-${pad(Math.min(day, dim))}`;
      add(d(1), 'KPR Apartemen — BCA', 7200000, 'DB', 'expense', 'Loan Payment', 'acc-bca');
      add(d(3), 'PLN Token Listrik', between(650000, 950000), 'DB', 'expense', 'Bills & Utilities', 'acc-bca');
      add(d(5), 'IndiHome Internet', 450000, 'DB', 'expense', 'Bills & Utilities', 'acc-bca');
      add(d(7), 'BPJS Kesehatan', 150000, 'DB', 'expense', 'Insurance', 'acc-bca');
      add(d(10), 'Netflix', 186000, 'DB', 'expense', 'Subscriptions', 'acc-super');
      add(d(12), 'Spotify Premium', 54990, 'DB', 'expense', 'Subscriptions', 'acc-super');
      add(d(20), 'Pembayaran Kartu Kredit BCA', between(3000000, 4800000), 'DB', 'expense', 'Credit Card Payment', 'acc-bca');
      add(d(25), 'Gaji — PT Sinar Jaya', 24600000, 'CR', 'income', 'Salary', 'acc-bca');
      if (mo === 12) add(d(22), 'Bonus Tahunan — PT Sinar Jaya', 8000000, 'CR', 'income', 'Bonus', 'acc-bca');
      add(d(26), 'Transfer ke Bibit', 2000000, 'DB', 'transfer', 'Investment', 'acc-bca');
      [['acc-super', 2500000], ['acc-neo', 2600000], ['acc-jago', 2200000]].forEach(([acc, amt]) => {
        add(d(2), `Transfer ke ${ACCOUNTS.find(a => a.id === acc).name}`, amt, 'DB', 'transfer', 'Transfer', 'acc-bca');
        add(d(2), 'Transfer dari BCA Main', amt, 'CR', 'transfer', 'Transfer', acc);
      });
      [4, 11, 18, 25].forEach((day) => add(d(day), pick(['Superindo Groceries', 'Hypermart', 'Ranch Market', 'Alfamart']), between(380000, 820000), 'DB', 'expense', 'Groceries', 'acc-neo'));
      for (let i = 0; i < 12; i++) add(d(1 + Math.floor(r() * dim)), pick(['GoFood — Kopi Kenangan', 'ShopeeFood — Bakmi GM', 'GoFood — Sate Khas Senayan', 'Kopi Kenangan', 'GrabFood — Hokben']), between(28000, 175000), 'DB', 'expense', 'Food & Dining', 'acc-jago');
      for (let i = 0; i < 13; i++) add(d(1 + Math.floor(r() * dim)), pick(['Grab — Transport', 'Gojek — GoRide', 'GoCar']), between(18000, 95000), 'DB', 'expense', 'Transport', 'acc-jago');
      add(d(8), 'Pertamina SPBU', between(250000, 400000), 'DB', 'expense', 'Transport', 'acc-bca');
      add(d(22), 'Pertamina SPBU', between(250000, 400000), 'DB', 'expense', 'Transport', 'acc-bca');
      const shops = 1 + Math.floor(r() * 3);
      for (let i = 0; i < shops; i++) add(d(1 + Math.floor(r() * dim)), pick(['Tokopedia — Elektronik', 'Shopee — Rumah Tangga', 'Uniqlo PIM', 'IKEA Alam Sutera']), between(150000, 1600000), 'DB', 'expense', 'Shopping', 'acc-super');
      if (r() < 0.6) add(d(1 + Math.floor(r() * dim)), pick(['CGV Grand Indonesia', 'XXI Plaza Senayan', 'Timezone']), between(90000, 320000), 'DB', 'expense', 'Entertainment', 'acc-super');
      if (r() < 0.35) add(d(1 + Math.floor(r() * dim)), pick(['Apotek K-24', 'Klinik Pratama Sehat']), between(80000, 450000), 'DB', 'expense', 'Medical', 'acc-neo');
      if (r() < 0.3) add(d(1 + Math.floor(r() * dim)), 'Refund — Shopee', between(50000, 300000), 'CR', 'income', 'Refund', 'acc-super');
      if (mo === 12 || mo === 6) add(d(14), pick(['Garuda Indonesia GA-410', 'Traveloka — Hotel Ubud']), between(1800000, 4200000), 'DB', 'expense', 'Travel', 'acc-super');
    }
    add('2026-10-15', 'Klinik Hewan Sehat', 2100000, 'DB', 'expense', 'Medical', 'acc-neo');
    return out.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id, undefined, { numeric: true }));
  }

  function seed() {
    return {
      version: 1,
      seededAt: new Date().toISOString(),
      accounts: ACCOUNTS.map(a => ({ ...a })),
      institutions: INSTITUTIONS.map(i => ({ ...i })),
      categories: CATEGORIES.slice(),
      transactions: seedTransactions(),
      holdings: [
        { id: 'h1', symbol: 'BBCA', name: 'Bank Central Asia', assetClass: 'equity', accountId: 'inst-ajaib', units: 4500, avgCost: 8650, price: 10125, currency: 'IDR' },
        { id: 'h2', symbol: 'TLKM', name: 'Telkom Indonesia', assetClass: 'equity', accountId: 'inst-ajaib', units: 6000, avgCost: 3820, price: 3150, currency: 'IDR' },
        { id: 'h3', symbol: 'VOO', name: 'Vanguard S&P 500 ETF', assetClass: 'equity', accountId: 'inst-ajaib', units: 12, avgCost: 7480000, price: 8960000, currency: 'USD' },
        { id: 'h4', symbol: 'RDPU', name: 'Sucorinvest Money Market', assetClass: 'mutual_fund', accountId: 'inst-bibit', units: 14800, avgCost: 1650, price: 1712, currency: 'IDR' },
        { id: 'h5', symbol: 'ANTAM', name: 'Emas Antam (gram)', assetClass: 'gold', accountId: 'inst-bibit', units: 18, avgCost: 1310000, price: 1585000, currency: 'IDR' },
      ],
      properties: [
        { id: 'p1', name: 'Apartemen Taman Rasuna', type: 'Residential', purchasePrice: 1150000000, purchaseDate: '2023-04-01', value: 1265000000, valuedAt: '2026-09-30' },
      ],
      liabilities: [
        { id: 'l1', name: 'KPR Apartemen — BCA', liabilityType: 'installment', principal: 768400000, interestRate: 7.5, monthlyPayment: 7200000, ltv: 0.61 },
        { id: 'l2', name: 'BCA Credit Card', liabilityType: 'revolving', principal: 4180000, interestRate: 21.0, monthlyPayment: null, ltv: null },
        { id: 'l3', name: 'Kredivo — Laptop', liabilityType: 'installment', principal: 6300000, interestRate: 2.6, monthlyPayment: 1050000, ltv: null },
      ],
      buckets: { futurePlanned: 3000000, demoted: [] },
      journey: { achievements: [
        { code: 'positive_cashflow_3mo', unlockedAt: '2026-03-31' },
        { code: 'consistent_investor', unlockedAt: '2026-07-31' },
      ] },
      settings: { dateFormat: 'DD/MM/YYYY', currency: 'IDR', locale: 'id-ID', email: 'owner@pf.local' },
    };
  }

  function load() { try { const raw = localStorage.getItem(KEY); if (raw) { const s = JSON.parse(raw); if (s && s.version === 1) return s; } } catch {} return null; }
  let state = load() || seed();
  const subs = new Set();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} };

  // ── selectors ─────────────────────────────────────────────────────
  const monthKey = (d) => d.slice(0, 7);
  const isFlow = (t) => t.type !== 'transfer';
  const signed = (t) => (t.flow === 'CR' ? 1 : -1) * t.amount;
  const accountName = (s, id) => (s.accounts.find(a => a.id === id) || {}).name || '—';
  const months = (s) => Array.from(new Set(s.transactions.map(t => monthKey(t.date)))).sort();

  function monthly(s) {
    const map = {};
    s.transactions.filter(isFlow).forEach(t => {
      const m = monthKey(t.date); map[m] = map[m] || { month: m, income: 0, expenses: 0, net: 0 };
      if (t.flow === 'CR') map[m].income += t.amount; else map[m].expenses += t.amount;
    });
    return Object.values(map).sort((a, b) => a.month.localeCompare(b.month)).map(m => ({ ...m, net: m.income - m.expenses }));
  }

  function balances(s, upTo) {
    const b = {}; s.accounts.forEach(a => { b[a.id] = a.openingBalance; });
    s.transactions.forEach(t => { if (!upTo || t.date <= upTo) b[t.accountId] = (b[t.accountId] || 0) + signed(t); });
    return b;
  }

  function withRunningBalance(s) {
    const b = {}; s.accounts.forEach(a => { b[a.id] = a.openingBalance; });
    return s.transactions.map(t => { b[t.accountId] = (b[t.accountId] || 0) + signed(t); return { ...t, balance: b[t.accountId], bank: accountName(s, t.accountId) }; });
  }

  function accountSummaries(s) {
    return s.accounts.map(a => {
      const tx = s.transactions.filter(t => t.accountId === a.id);
      const inn = tx.filter(t => t.flow === 'CR').reduce((x, t) => x + t.amount, 0);
      const out = tx.filter(t => t.flow === 'DB').reduce((x, t) => x + t.amount, 0);
      const inst = s.institutions.find(i => i.id === a.institutionId);
      return { accountId: a.id, accountName: a.name, institutionName: inst ? inst.name : '', totalIn: inn, totalOut: out, netPosition: inn - out, transactionCount: tx.length };
    });
  }

  const SECTION_OF = (t) => {
    if (t.category === 'Investment') return ['investing', 'Investing Activities', 'Portfolio Contributions'];
    if (t.category === 'Loan Payment' || t.category === 'Credit Card Payment') return ['financing', 'Financing Activities', 'Debt Service'];
    if (t.type === 'transfer') return null;
    return t.flow === 'CR' ? ['operating', 'Operating Activities', 'Income'] : ['operating', 'Operating Activities', 'Living Expenses'];
  };
  function periodOf(date, groupBy) { const [y, m] = date.split('-').map(Number); if (groupBy === 'quarterly') return `Q${Math.ceil(m / 3)} ${y}`; return new Date(y, m - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }); }
  function statement(s, range, groupBy, accountId) {
    const all = months(s); const keep = range === -1 ? all : range === 0 ? all.filter(m => m.startsWith(TODAY.slice(0, 4))) : all.slice(-range);
    const tx = s.transactions.filter(t => keep.includes(monthKey(t.date)) && (!accountId || t.accountId === accountId));
    const periods = []; tx.forEach(t => { const p = periodOf(t.date, groupBy); if (!periods.includes(p)) periods.push(p); });
    const sections = {}; const grand = {};
    tx.forEach(t => {
      const sec = SECTION_OF(t); if (!sec) return;
      const [id, label, sub] = sec; const p = periodOf(t.date, groupBy); const v = signed(t);
      sections[id] = sections[id] || { id, label, subsections: {}, totals: {} };
      const ss = sections[id].subsections[sub] = sections[id].subsections[sub] || { id: id + sub, label: sub, categories: {}, totals: {} };
      const c = ss.categories[t.category] = ss.categories[t.category] || { category: t.category, values: {} };
      c.values[p] = (c.values[p] || 0) + v; ss.totals[p] = (ss.totals[p] || 0) + v; sections[id].totals[p] = (sections[id].totals[p] || 0) + v; grand[p] = (grand[p] || 0) + v;
    });
    const order = ['operating', 'investing', 'financing'];
    return { periods, grandTotals: grand, sections: order.filter(o => sections[o]).map(o => ({ ...sections[o], subsections: Object.values(sections[o].subsections).map(ss => ({ ...ss, categories: Object.values(ss.categories).sort((a, b) => Math.abs(Object.values(b.values).reduce((x, y) => x + y, 0)) - Math.abs(Object.values(a.values).reduce((x, y) => x + y, 0))) })) })) };
  }

  function categorySpend(s, m) {
    const map = {}; s.transactions.filter(t => isFlow(t) && t.flow === 'DB' && monthKey(t.date) === m).forEach(t => { map[t.category] = map[t.category] || { category: t.category, amount: 0, transactionCount: 0, max: 0 }; map[t.category].amount += t.amount; map[t.category].transactionCount++; map[t.category].max = Math.max(map[t.category].max, t.amount); });
    return map;
  }

  function variance(s) {
    const ms = months(s); const cur = ms[ms.length - 1]; const trail = ms.slice(-4, -1);
    const curMap = categorySpend(s, cur); const trailMaps = trail.map(m => categorySpend(s, m));
    const cats = new Set([...Object.keys(curMap), ...trailMaps.flatMap(Object.keys)]);
    const drivers = [...cats].filter(c => c !== 'Loan Payment').map(c => {
      const now = curMap[c] ? curMap[c].amount : 0; const avg = trailMaps.reduce((x, mm) => x + (mm[c] ? mm[c].amount : 0), 0) / trail.length;
      return { category: c, currentMonthSpend: now, trailingAvg: avg, delta: now - avg, isOneOff: !!curMap[c] && curMap[c].max > 0.6 * now && now - avg > 0 && curMap[c].transactionCount <= 2 };
    }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    const curTotal = drivers.reduce((x, d) => x + d.currentMonthSpend, 0); const avgTotal = drivers.reduce((x, d) => x + d.trailingAvg, 0);
    return { delta: curTotal - avgTotal, deltaPct: avgTotal ? (curTotal - avgTotal) / avgTotal * 100 : 0, currentMonthTotal: curTotal, trailingAvgTotal: avgTotal, drivers };
  }

  const COMMITTED = [
    { key: 'kpr', name: 'KPR Apartemen', match: 'KPR Apartemen', due: '1st', source: 'BCA Main', certain: true },
    { key: 'pln', name: 'PLN Listrik', match: 'PLN Token', due: '3rd', source: 'BCA Main', certain: true },
    { key: 'indihome', name: 'IndiHome Internet', match: 'IndiHome', due: '5th', source: 'BCA Main', certain: true },
    { key: 'bpjs', name: 'BPJS Kesehatan', match: 'BPJS', due: '7th', source: 'BCA Main', certain: true },
    { key: 'netflix', name: 'Netflix', match: 'Netflix', due: '10th', source: 'Superbank', certain: true },
    { key: 'spotify', name: 'Spotify Premium', match: 'Spotify', due: '12th', source: 'Superbank', certain: true },
    { key: 'cc', name: 'BCA Credit Card', match: 'Kartu Kredit', due: '20th', source: 'BCA Main', certain: false, note: 'amount varies' },
    { key: 'kredivo', name: 'Kredivo installment', match: 'Kredivo', due: '28th', source: 'Superbank', certain: false, note: 'from liabilities' },
  ];
  function buckets(s, holdingsValue) {
    const ms = months(s); const cur = ms[ms.length - 1]; const prev = ms.slice(-4, -1);
    const isCommittedTx = (t) => COMMITTED.some(c => !s.buckets.demoted.includes(c.key) && t.description.includes(c.match));
    const items = COMMITTED.filter(c => !s.buckets.demoted.includes(c.key)).map(c => {
      const hist = s.transactions.filter(t => t.description.includes(c.match));
      const paidTx = hist.find(t => monthKey(t.date) === cur);
      const amount = c.key === 'kredivo' ? 1050000 : (paidTx ? paidTx.amount : hist.length ? hist[hist.length - 1].amount : 0);
      return { ...c, amount, paid: !!paidTx };
    });
    const committed = items.reduce((x, i) => x + i.amount, 0);
    const freeSpentIn = (m) => s.transactions.filter(t => isFlow(t) && t.flow === 'DB' && monthKey(t.date) === m && !isCommittedTx(t)).reduce((x, t) => x + t.amount, 0);
    const prevFree = prev.map(freeSpentIn).sort((a, b) => a - b);
    const medianFree = prevFree[Math.floor(prevFree.length / 2)] || 0;
    const income = 24600000; const day = Number(TODAY.slice(8)); const daysInMonth = 31;
    const last7 = new Date(TODAY); last7.setDate(last7.getDate() - 7); const l7 = last7.toISOString().slice(0, 10);
    const last7DayFreeSpend = s.transactions.filter(t => isFlow(t) && t.flow === 'DB' && t.date > l7 && !isCommittedTx(t)).reduce((x, t) => x + t.amount, 0);
    const biggest = Object.values(categorySpend(s, cur)).filter(c => !['Loan Payment', 'Credit Card Payment', 'Bills & Utilities', 'Insurance', 'Subscriptions'].includes(c.category)).sort((a, b) => b.amount - a.amount)[0];
    return {
      income, committed, futurePlanned: s.buckets.futurePlanned, freeBudget: income - committed - s.buckets.futurePlanned, freeSpent: freeSpentIn(cur),
      day, daysInMonth, monthsAvailable: ms.length, items, medianFree, softFloor: Math.round(medianFree * 0.85), last7DayFreeSpend,
      emergencyFund: { now: holdingsValue, target: committed * 6 }, biggestDriverCategory: biggest && biggest.category, biggestDriverAmount: biggest ? biggest.amount : 0,
    };
  }

  const holdingValue = (h) => h.units * h.price;
  function netWorth(s) {
    const ms = months(s).slice(-8);
    const hv = s.holdings.reduce((x, h) => x + holdingValue(h), 0);
    const pv = s.properties.reduce((x, p) => x + p.value, 0);
    const lv = s.liabilities.reduce((x, l) => x + l.principal, 0);
    const history = ms.map((m, i) => {
      const back = ms.length - 1 - i; const [y, mo] = m.split('-').map(Number); const end = `${m}-${pad(new Date(y, mo, 0).getDate())}`;
      const cash = Object.values(balances(s, end > TODAY ? TODAY : end)).reduce((x, v) => x + v, 0);
      return { date: end > TODAY ? TODAY : end, valueIdr: cash + hv * Math.pow(0.987, back) - back * 2000000 + pv * Math.pow(0.997, back) - (lv + back * 4300000) };
    });
    const cash = Object.values(balances(s)).reduce((x, v) => x + v, 0);
    const alloc = { cash };
    s.holdings.forEach(h => { alloc[h.assetClass] = (alloc[h.assetClass] || 0) + holdingValue(h); });
    alloc.property = pv;
    const total = cash + hv + pv - lv;
    const prev = history.length > 1 ? history[history.length - 2].valueIdr : total;
    return { netWorthIdr: total, liquidIdr: cash + hv, liabilitiesIdr: lv, assetsIdr: cash + hv + pv, deltaPct: prev ? (total - prev) / Math.abs(prev) * 100 : 0, history, allocation: alloc, holdingsIdr: hv, cashIdr: cash };
  }

  // ── derive the view-models the existing pages read from window.PF ─
  function derive() {
    const s = state; const mon = monthly(s); const ms = mon.map(m => m.month);
    const cur = mon[mon.length - 1], prev = mon[mon.length - 2] || cur;
    const pct = (a, b) => (b ? (a - b) / Math.abs(b) * 100 : 0);
    const cats = Object.values(categorySpend(s, cur.month)).sort((a, b) => b.amount - a.amount);
    const totalSpend = cats.reduce((x, c) => x + c.amount, 0);
    PF.today = new Date(TODAY);
    PF.dashboardData = {
      dataThrough: new Date(TODAY).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      currentMonth: { month: cur.month, income: cur.income, expenses: cur.expenses, net: cur.net, incomeChangePercent: pct(cur.income, prev.income), expenseChangePercent: pct(cur.expenses, prev.expenses), netChangePercent: pct(cur.net, prev.net) },
      cashFlow: mon.slice(-6),
      topCategories: cats.slice(0, 5).map(c => ({ category: c.category, amount: c.amount, transactionCount: c.transactionCount, percentage: totalSpend ? c.amount / totalSpend * 100 : 0 })),
    };
    PF.topSpending = s.transactions.filter(t => isFlow(t) && t.flow === 'DB' && monthKey(t.date) === cur.month).sort((a, b) => b.amount - a.amount).slice(0, 5).map(t => ({ id: t.id, description: t.description, category: t.category, date: t.date, amountIdr: t.amount }));
    const bal = balances(s);
    PF.accountBalances = s.accounts.map(a => { const inst = s.institutions.find(i => i.id === a.institutionId); const last = s.transactions.filter(t => t.accountId === a.id).slice(-1)[0]; return { accountId: a.id, accountName: a.name, institutionName: inst ? inst.name : '', asOf: last ? last.date : a.openingDate, currency: a.currency, currentBalance: bal[a.id] }; });
    PF.recentTransactions = s.transactions.slice(-8).reverse().map(t => ({ id: t.id, description: t.description, bank: accountName(s, t.accountId), amount: signed(t), type: t.type }));
    const streak = {}; const from = new Date(TODAY); from.setDate(from.getDate() - 84); const f = from.toISOString().slice(0, 10);
    s.transactions.forEach(t => { if (t.date > f) streak[t.date] = (streak[t.date] || 0) + 1; });
    PF.streakActivity = streak;
    // Journey indicators (mirrors JourneyScoringService's data-derived set)
    const last3 = mon.slice(-4, -1); const avgInc = last3.reduce((x, m) => x + m.income, 0) / 3; const avgExp = last3.reduce((x, m) => x + m.expenses, 0) / 3;
    const nw = netWorth(s); const monthlyDebt = s.liabilities.reduce((x, l) => x + (l.monthlyPayment || 0), 0);
    const clamp = (v) => Math.max(0, Math.min(100, v));
    const ind = [
      { code: 'spend_lt_income', level: 'L1', score: clamp((1 - avgExp / avgInc) / 0.2 * 70), displayName: 'Spending under income' },
      { code: 'bills_on_time', level: 'L1', score: 44, displayName: 'Bills paid on time' },
      { code: 'liquid_savings', level: 'L2', score: clamp(nw.cashIdr / (avgExp * 3) * 100 * 0.55), displayName: '3-month emergency fund' },
      { code: 'manageable_debt', level: 'L2', score: clamp((0.36 - monthlyDebt / avgInc) / 0.36 * 100 + 10), displayName: 'Manageable debt level' },
      { code: 'long_term_savings', level: 'L3', score: 31, displayName: 'Monthly investment habit' },
    ].map(i => ({ ...i, score: Math.round(i.score), rawValue: i.score / 100, status: i.score >= 70 ? 'achieved' : i.score > 0 ? 'in_progress' : 'not_started', description: '' }));
    const lvl = (L) => { const xs = ind.filter(i => i.level === L); return xs.length ? Math.round(xs.reduce((x, i) => x + i.score, 0) / xs.length * (L === 'L3' ? 0.4 : 1)) : 0; };
    const ls = { L1: lvl('L1'), L2: lvl('L2'), L3: lvl('L3'), L4: 0, L5: 0 };
    PF.journeyState = { currentLevel: 1, totalScore: (ls.L1 + ls.L2 + ls.L3) / 3, lastComputedAt: TODAY + 'T08:00:00Z', levelScores: ls, indicators: ind, achievements: s.journey.achievements };
    Object.assign(PF.JOURNEY_LABELS, {
      liquid_savings: { headline: '3-month emergency fund', subtext: (i) => `Score ${i.score.toFixed(0)}/100 · target: 3.0 months of expenses` },
      manageable_debt: { headline: 'Manageable debt level', subtext: (i) => `Score ${i.score.toFixed(0)}/100 · DTI target < 36%` },
      long_term_savings: { headline: 'Monthly investment habit', subtext: (i) => `Score ${i.score.toFixed(0)}/100 · target: regular monthly investment` },
    });
  }

  function notify() { derive(); subs.forEach(f => f(state)); }
  function update(fn) { state = fn(state); save(); notify(); }
  function reset() { state = seed(); save(); notify(); }
  derive();
  if (!load()) save();

  return {
    TODAY, get state() { return state; }, update, reset, subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    monthly: () => monthly(state), months: () => months(state), balances: (d) => balances(state, d), withRunningBalance: () => withRunningBalance(state),
    accountSummaries: () => accountSummaries(state), statement: (r, g, a) => statement(state, r, g, a), variance: () => variance(state),
    buckets: () => buckets(state, netWorth(state).holdingsIdr * 0 + state.holdings.filter(h => h.assetClass === 'mutual_fund').reduce((x, h) => x + holdingValue(h), 0)),
    netWorth: () => netWorth(state), holdingValue, accountName: (id) => accountName(state, id),
  };
})();
