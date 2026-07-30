/* Mock data mirroring the real frontend types (JourneyState, DashboardData, Insight…) */
window.PF = (function () {
  // ── format helpers (from src/lib/format.ts) ──────────────────────────
  const formatCurrency = (amount, currency = 'IDR') =>
    new Intl.NumberFormat('id-ID', {
      style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(amount);

  const formatMonth = (m) => {
    if (!m) return '—';
    const p = m.split('-');
    if (p.length === 2) {
      const d = new Date(parseInt(p[0]), parseInt(p[1]) - 1);
      if (!isNaN(d.getTime())) return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    return m;
  };

  const fmtDecimal = (n) =>
    new Intl.NumberFormat('id-ID', { style: 'decimal', minimumFractionDigits: 2 }).format(n);

  // ── Journey state (src/types/Journey.ts) ─────────────────────────────
  const journeyState = {
    currentLevel: 1,
    totalScore: 41.3,
    lastComputedAt: '2026-05-28T09:12:00Z',
    levelScores: { L1: 58, L2: 24, L3: 12, L4: 0, L5: 0 },
    indicators: [
      { code: 'spend_lt_income', level: 'L1', score: 72, rawValue: 0.78, status: 'achieved',    displayName: 'Spending under income', description: '' },
      { code: 'bills_on_time',   level: 'L1', score: 44, rawValue: 0.6,  status: 'in_progress', displayName: 'Bills paid on time',     description: '' },
    ],
    achievements: [
      { code: 'first_upload',  name: 'First Statement Uploaded', unlockedAt: '2026-03-02' },
      { code: 'positive_month', name: 'First Positive Month',    unlockedAt: '2026-03-31' },
      { code: 'streak_7',      name: '7-Day Logging Streak',     unlockedAt: '2026-04-14' },
    ],
  };

  const TIER_META = {
    L1: { label: 'Foundations', color: 'rgb(100 116 139)', deeplink: '/cashflow/overview',  module: 'Cashflow' },
    L2: { label: 'Defense',     color: 'rgb(76 175 80)',   deeplink: '/assets/accounts',    module: 'Assets' },
    L3: { label: 'Growth',      color: 'rgb(56 142 60)',   deeplink: '/investment/overview', module: 'Investment' },
    L4: { label: 'Freedom',     color: 'rgb(46 125 50)',   deeplink: '/investment/holdings', module: 'Investment' },
    L5: { label: 'Legacy',      color: 'rgb(27 94 32)',    deeplink: '/assets/overview',    module: 'Assets' },
  };

  const JOURNEY_LABELS = {
    spend_lt_income: { headline: 'Spending under income', subtext: (i) => `Score ${i.score.toFixed(0)}/100 · ${i.status === 'achieved' ? 'On track' : 'Needs attention'}` },
    bills_on_time:   { headline: 'Bills paid on time',    subtext: (i) => `Score ${i.score.toFixed(0)}/100 · ${i.status === 'achieved' ? 'All on schedule' : 'Check pending bills'}` },
  };

  // ── Journey quests (Quest type) ──────────────────────────────────────
  const journeyQuests = [
    { title: "Upload last month's statement", description: 'Keep your cashflow score accurate — import your latest BCA or Superbank statement.', targetIndicator: 'spend_lt_income', estimatedScoreGain: 12, difficulty: 'easy',   actionDeeplink: '/cashflow/upload' },
    { title: 'Set your emergency fund target', description: 'Define a 3-month expense buffer so your Defense tier can start scoring.', targetIndicator: 'liquid_savings', estimatedScoreGain: 8, difficulty: 'medium', actionDeeplink: '/assets' },
    { title: 'Log a recurring bill',           description: 'Track one fixed monthly bill to improve your “bills on time” indicator.', targetIndicator: 'bills_on_time',  estimatedScoreGain: 6, difficulty: 'easy',   actionDeeplink: '/bills' },
  ];

  // ── Cashflow / Dashboard data (DashboardData) ────────────────────────
  const cashFlow = [
    { month: '2025-12', income: 22100000, expenses: 19800000, net:  2300000 },
    { month: '2026-01', income: 24000000, expenses: 26500000, net: -2500000 },
    { month: '2026-02', income: 23200000, expenses: 21000000, net:  2200000 },
    { month: '2026-03', income: 25500000, expenses: 22800000, net:  2700000 },
    { month: '2026-04', income: 21900000, expenses: 24200000, net: -2300000 },
    { month: '2026-05', income: 24600000, expenses: 30017570.89, net: -5417570.89 },
  ];

  const dashboardData = {
    dataThrough: 'May 2026',
    currentMonth: {
      month: '2026-05',
      income: 24600000,
      expenses: 30017570.89,
      net: -5417570.89,
      incomeChangePercent: 12.3,
      expenseChangePercent: 24.0,
      netChangePercent: -135.6,
    },
    cashFlow,
    topCategories: [
      { category: 'Food & Dining', amount: 4850000, transactionCount: 28, percentage: 16.2 },
      { category: 'Bills & Utilities', amount: 3200000, transactionCount: 6, percentage: 10.7 },
      { category: 'Transport', amount: 2430000, transactionCount: 41, percentage: 8.1 },
      { category: 'Shopping', amount: 2100000, transactionCount: 9, percentage: 7.0 },
      { category: 'Medical', amount: 2100000, transactionCount: 2, percentage: 7.0 },
    ],
  };

  const topSpending = [
    { id: 1, description: 'Klinik Hewan Sehat',      category: 'Medical',   date: '2026-05-15', amountIdr: 2100000 },
    { id: 2, description: 'Garuda Indonesia GA-410', category: 'Travel',    date: '2026-05-21', amountIdr: 1780000 },
    { id: 3, description: 'Tokopedia — Elektronik',  category: 'Shopping',  date: '2026-05-08', amountIdr: 1450000 },
    { id: 4, description: 'PLN Token Listrik',       category: 'Bills',     date: '2026-05-03', amountIdr:  880000 },
    { id: 5, description: 'Superindo Groceries',     category: 'Groceries', date: '2026-05-19', amountIdr:  720000 },
  ];

  const accountBalances = [
    { accountId: 1, accountName: 'BCA Main',       institutionName: 'Bank Central Asia', asOf: '2026-05-28', currency: 'IDR', currentBalance: 24500000 },
    { accountId: 2, accountName: 'Superbank',      institutionName: 'Superbank',         asOf: '2026-04-16', currency: 'IDR', currentBalance: 8200000.50 },
    { accountId: 3, accountName: 'Neo Commerce',   institutionName: 'Bank Neo',          asOf: '2026-05-27', currency: 'IDR', currentBalance: 3100000 },
    { accountId: 4, accountName: 'Jago Pocket',    institutionName: 'Bank Jago',         asOf: '2026-05-26', currency: 'IDR', currentBalance: 1250000 },
  ];

  const dailyPulse = { tone: 'positive', headline: 'Kamu menghemat Rp 1.2 jt di Transport minggu ini dibanding rata-rata.' };

  // ── Insights (the in-source MOCK_INSIGHTS, Bahasa) ───────────────────
  const insights = [
    { id: 'mock-statement-gap-superbank', type: 'statement_gap', severity: 'alert', title: 'Superbank: statement belum diupload', body: 'Data terakhir dari Superbank sudah 42 hari yang lalu. Upload statement terbaru agar insight tetap akurat.', metricLabel: 'Hari terakhir', metricValue: 42, actionType: 'navigate', actionTarget: '/cashflow/upload' },
    { id: 'mock-over-budget-food', type: 'over_budget', severity: 'warning', title: 'Food sudah melebihi rata-rata', body: 'Pengeluaran Food bulan ini Rp 1.850.000, sudah 48% di atas rata-rata 3 bulan terakhir (Rp 1.250.000). Pertimbangkan untuk mengurangi frekuensi makan di luar.', metricLabel: 'Di atas rata-rata', metricValue: 48, category: 'Food', actionType: null, actionTarget: null },
    { id: 'mock-habit-break-investment', type: 'habit_break', severity: 'streak_break', title: 'Belum ada transaksi investasi bulan ini', body: 'Kamu biasanya berinvestasi setiap bulan. Bulan ini belum ada. Cek apakah sudah terjadwal atau transfer manual ke rekening investasimu.', metricLabel: 'Bulan berturut sebelumnya', metricValue: 3, actionType: 'navigate', actionTarget: '/investment/overview' },
    { id: 'mock-large-tx-medical', type: 'large_transaction', severity: 'info', title: 'Transaksi besar di Medical', body: 'Klinik Hewan Sehat (15 Mei) senilai Rp 2.100.000 — lebih dari 2× rata-rata bulananmu untuk kategori ini (Rp 950.000).', metricLabel: 'Rata-rata bulanan', metricValue: 950000, category: 'Medical', actionType: null, actionTarget: null },
    { id: 'mock-under-budget-transport', type: 'under_budget', severity: 'win', title: 'Hemat di Transport bulan ini!', body: 'Kamu menghemat sekitar Rp 320.000 di Transport dibanding rata-rata. Mungkin lebih banyak WFH bulan ini? Bisa dialokasikan ke tabungan darurat.', metricLabel: 'Dihemat bulan ini', metricValue: 320000, category: 'Transport', actionType: 'navigate', actionTarget: '/investment/overview' },
  ];

  const cashflowQuests = [
    { id: 'cq-monthly-budget',   title: 'Review your monthly budget',          description: "Check last month's spending breakdown and identify the top category to reduce.", difficulty: 'Easy',   points: 10, tag: 'spend lt income',        actionPath: '/cashflow/overview' },
    { id: 'cq-savings-balance',  title: 'Update your savings account balance',  description: 'Record your current savings balance to get an accurate emergency fund score.',    difficulty: 'Easy',   points: 8,  tag: 'liquid savings ratio',   actionPath: '/assets' },
    { id: 'cq-debt-obligations', title: 'Check debt obligations',               description: 'Review your active liabilities and update monthly payment amounts.',                difficulty: 'Medium', points: 6,  tag: 'manageable dti',         actionPath: '/assets' },
  ];

  // ── Recent transactions (ActivityPanel) ──────────────────────────────
  const recentTransactions = [
    { id: 'r1', description: 'GoFood — Kopi Kenangan',  bank: 'BCA Main',     amount: -48000,   type: 'expense' },
    { id: 'r2', description: 'Gaji — PT Sinar Jaya',     bank: 'BCA Main',     amount: 24600000, type: 'income' },
    { id: 'r3', description: 'Tokopedia — Elektronik',   bank: 'Superbank',    amount: -1450000, type: 'expense' },
    { id: 'r4', description: 'Transfer ke Bibit',        bank: 'BCA Main',     amount: -2000000, type: 'transfer' },
    { id: 'r5', description: 'Grab — Transport',         bank: 'Jago Pocket',  amount: -32000,   type: 'expense' },
    { id: 'r6', description: 'PLN Token Listrik',        bank: 'BCA Main',     amount: -880000,  type: 'expense' },
    { id: 'r7', description: 'Klinik Hewan Sehat',       bank: 'Neo Commerce', amount: -2100000, type: 'expense' },
    { id: 'r8', description: 'Refund — Shopee',          bank: 'Superbank',    amount: 215000,   type: 'income' },
  ];

  // 12-week streak activity counts (last 84 days) — keyed YYYY-MM-DD
  const streakActivity = (() => {
    const counts = {};
    const today = new Date('2026-05-28');
    for (let i = 83; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dow = d.getDay();
      // weekends quieter, occasional empty days
      let n = 0;
      const r = Math.random();
      if (dow === 0 || dow === 6) n = r < 0.5 ? 0 : (r < 0.85 ? 1 : 2);
      else n = r < 0.18 ? 0 : r < 0.5 ? 1 : r < 0.82 ? 2 : (r < 0.95 ? 4 : 6);
      if (n > 0) counts[d.toISOString().slice(0, 10)] = n;
    }
    return counts;
  })();

  return {
    formatCurrency, formatMonth, fmtDecimal,
    journeyState, TIER_META, JOURNEY_LABELS, journeyQuests,
    dashboardData, topSpending, accountBalances, dailyPulse, insights,
    cashflowQuests, recentTransactions, streakActivity,
    today: new Date('2026-05-28'),
  };
})();