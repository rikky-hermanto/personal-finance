/* PF-154 Big Purchases — synthetic data + goal math (formulas.md §9) + foundation gate + copy. Prototype only. */
(function () {
  const TODAY = '2026-11-09';
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const rp = (n) => 'Rp ' + Math.round(Math.abs(n)).toLocaleString('id-ID');
  const rpShort = (n) => { const a = Math.abs(n); if (a >= 1e9) return 'Rp ' + (a / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' M'; if (a >= 1e6) return 'Rp ' + (a / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt'; return rp(a); };
  const ym = (s) => { const [y, m] = s.split('-').map(Number); return `${MON[m - 1]} ${y}`; };
  const dmy = (s) => { const [y, m, d] = s.split('-').map(Number); return `${d} ${MON[m - 1]} ${y}`; };
  const parts = (s) => s.split('-').map(Number);
  const addMonths = (y, m, k) => { const t = y * 12 + (m - 1) + k; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; };

  const CATEGORIES = {
    house_land: { label: 'House or land', icon: 'House', costs: true, hint: 'A plot, a house or an apartment' },
    vehicle: { label: 'Vehicle', icon: 'Car', costs: true, hint: 'A car or a motorbike' },
    education: { label: 'Education', icon: 'GraduationCap', hint: 'A degree, a course or school fees' },
    wedding: { label: 'Wedding', icon: 'Gem', hint: 'The ceremony and the reception' },
    other: { label: 'Other', icon: 'Package', hint: 'Travel, a pilgrimage, anything big' },
  };
  const PRIORITY = { 1: 'Must happen', 2: 'Important', 3: 'Nice to have', 4: 'Someday' };
  const COST_TYPES = { purchase_price: 'Purchase price', down_payment: 'Down payment', loan_principal: 'Loan principal', tax: 'Tax', fee: 'Fee', other: 'Other' };

  const ACCOUNTS = [
    { id: 'acc-bca', name: 'BCA Tabungan', type: 'savings', updatedDaysAgo: 6 },
    { id: 'acc-super', name: 'Superbank Saku', type: 'savings', updatedDaysAgo: 3 },
    { id: 'acc-rdpu', name: 'Bibit RDPU', type: 'investment', updatedDaysAgo: 2 },
  ];

  /* No seeded goals: the page starts empty, as a new user sees it.
     Guidance below is static copy shown only while there are no open goals. It is never saved,
     never counted in any total, and its numbers are fixed text (200.000.000 / 24, rounded up), not computed. */
  const GUIDE = [
    { title: 'Name it and price it', body: 'Enter the cash you need. For a house or a car you can break the cost down; a loan is borrowed, so it is not cash you save.' },
    { title: 'Pick a month', body: "You'll see what to set aside each month to get there, at today's prices." },
    { title: 'Record what you set aside', body: 'Add money as you save. The Foundation check tells you whether your cushion is ready before you commit.' },
  ];
  const EXAMPLE = { category: 'vehicle', name: 'Family car', meta: 'Vehicle · in 24 months', allocated: 'Rp 0', target: 'of Rp 200 jt', next: 'Rp 8.333.334 a month for 24 months' };

  /* §9 math */
  function monthsLeft(today, target) { const [ty, tm, td] = parts(target), [cy, cm, cd] = parts(today); const m = (ty - cy) * 12 + (tm - cm); return td < cd ? m - 1 : m; }
  function growthFactor(g, months) { if (months <= 0 || !g) return 1; let f = 1; for (let y = 0; y < Math.floor(months / 12); y++) f *= 1 + g; return f * (1 + g * (months % 12) / 12); }
  const allocatedOf = (goal) => goal.contributions.reduce((s, x) => s + x.amount, 0);
  const cashNeeded = (costs) => costs.filter((k) => k.type !== 'loan_principal').reduce((s, k) => s + k.amount, 0);
  const totalCost = (costs) => costs.reduce((s, k) => s + k.amount, 0);
  function compute(goal, today = TODAY) {
    const allocated = allocatedOf(goal);
    const ml = goal.date ? monthsLeft(today, goal.date) : null;
    const effective = goal.growth && ml >= 1 ? Math.round(goal.target * growthFactor(goal.growth, ml)) : goal.target;
    const remaining = Math.max(effective - allocated, 0), surplus = Math.max(allocated - effective, 0);
    const percent = Math.floor((allocated / effective) * 1000) / 10;
    let timeline, monthly = null;
    if (remaining === 0) timeline = 'funded';
    else if (!goal.date) timeline = 'no_date';
    else if (goal.date < today) timeline = 'overdue';
    else if (ml < 1) timeline = 'due_soon';
    else { timeline = 'scheduled'; monthly = Math.ceil(remaining / ml); }
    return { allocated, effective, remaining, surplus, percent, monthsLeft: ml, monthly, timeline, pace: pace(goal, remaining, today) };
  }
  function pace(goal, remaining, today) {
    const [y, m] = parts(today); const thisMonth = `${y}-${String(m).padStart(2, '0')}-01`; const start = addMonths(y, m, -3) + '-01';
    const cs = goal.contributions; if (!cs.length || cs.reduce((a, x) => (x.on < a ? x.on : a), '9999') >= start) return null;
    const per = cs.filter((x) => x.on >= start && x.on < thisMonth).reduce((s, x) => s + x.amount, 0) / 3;
    if (per <= 0) return null;
    if (remaining <= 0) return { per, reach: null };
    const k = Math.ceil(remaining / per);
    return k > 600 ? { per, beyond: true } : { per, reach: addMonths(y, m, k) };
  }
  function nextStep(r, goal) {
    if (r.timeline === 'funded') return r.surplus > 0 ? `Fully funded (${rp(r.surplus)} over)` : 'Fully funded';
    if (r.timeline === 'no_date') return 'Set a target date';
    if (r.timeline === 'overdue') return `Target date passed, ${rp(r.remaining)} still to go`;
    if (r.timeline === 'due_soon') return `${rp(r.remaining)} needed by ${dmy(goal.date)}`;
    return `${rp(r.monthly)} a month until ${ym(goal.date.slice(0, 7))}`;
  }

  /* Foundation gate (bars = scoring rubric Cleared ≥ 70) */
  const BARS = { spend: 0.89, cover: 2.1, dti: 0.296 };
  const SCENARIOS = {
    not_recommended_yet: { label: 'Not recommended', cushion: 15500000, stale: false, dtiKnown: true, spend: 0.68 },
    clear: { label: 'Checked', cushion: 42000000, stale: false, dtiKnown: true, spend: 0.68 },
    not_evaluated: { label: 'Not checked', cushion: 42000000, stale: true, dtiKnown: false, spend: 0.68 },
  };
  const BASE = { consumption: 9500000, income: 14000000, debtService: 1150000 };
  function earmarkedInSavings(goals) {
    const sav = new Set(ACCOUNTS.filter((a) => a.type === 'savings').map((a) => a.id));
    return goals.filter((g) => g.status === 'active' || g.status === 'paused').flatMap((g) => g.contributions).filter((x) => x.held && sav.has(x.held)).reduce((s, x) => s + x.amount, 0);
  }
  function foundation(goals, scenarioKey) {
    const S = SCENARIOS[scenarioKey]; const earmarked = Math.max(earmarkedInSavings(goals), 0);
    const liquid = earmarked + S.cushion; const failing = [], missing = [];
    const checks = [];
    checks.push({ key: 'spend', label: 'Spending', value: `${Math.round(S.spend * 100)}% of income`, bar: 'at most 89%', state: S.spend <= BARS.spend ? 'pass' : 'fail' });
    let cover = null;
    if (S.stale) { missing.push('savings_stale'); checks.push({ key: 'cover', label: 'Cushion after goal money', value: 'Balance out of date', bar: 'at least 2.1 months', state: 'missing' }); }
    else { cover = Math.floor(((liquid - Math.min(earmarked, liquid)) / BASE.consumption) * 100) / 100; const ok = cover >= BARS.cover; if (!ok) failing.push('cover_after_earmarks'); checks.push({ key: 'cover', label: 'Cushion after goal money', value: `${cover.toLocaleString('en-US', { maximumFractionDigits: 1 })} months`, bar: 'at least 2.1 months', state: ok ? 'pass' : 'fail' }); }
    let dti = null;
    if (!S.dtiKnown) { missing.push('manageable_dti'); checks.push({ key: 'dti', label: 'Debt payments', value: 'Debts not recorded', bar: 'at most 29.6%', state: 'missing' }); }
    else { dti = BASE.debtService / BASE.income; checks.push({ key: 'dti', label: 'Debt payments', value: `${(dti * 100).toFixed(1)}% of take-home`, bar: 'at most 29.6%', state: dti <= BARS.dti ? 'pass' : 'fail' }); if (dti > BARS.dti) failing.push('manageable_dti'); }
    const state = failing.length ? 'not_recommended_yet' : missing.length ? 'not_evaluated' : 'clear';
    return { state, checks, cover, dti, earmarked, failing, missing, scenario: S };
  }
  function goalGate(f, goal) {
    let state = f.state, post = null; const extra = [];
    if (goal.instalment > 0) {
      if (f.dti == null) { extra.push('post_purchase_dti_missing'); if (state === 'clear') state = 'not_evaluated'; }
      else { post = (BASE.debtService + goal.instalment) / BASE.income; if (post > BARS.dti) { state = 'not_recommended_yet'; extra.push('post_purchase_dti'); } }
    }
    return { state, post, extra };
  }
  const GATE = {
    clear: { title: 'Foundation checked', tone: 'success' },
    not_recommended_yet: { title: 'Not recommended yet', tone: 'warning' },
    not_evaluated: { title: 'Not checked yet', tone: 'muted' },
  };
  function gateBody(f) {
    const out = [];
    if (f.state === 'clear') out.push(`Your cushion (${f.cover.toLocaleString('en-US', { maximumFractionDigits: 1 })} months) and debt payments (${(f.dti * 100).toFixed(1)}% of take-home income) are within the Defense bars. This checks your foundation, not whether this purchase is right for you.`);
    if (f.failing.includes('cover_after_earmarks')) out.push(`By the Defense rule, your cushion covers ${f.cover.toLocaleString('en-US', { maximumFractionDigits: 1 })} months and the bar is 2.1. You can keep saving here; the rule asks you to finish your cushion before you commit to a purchase.`);
    if (f.failing.includes('spend_lt_income')) out.push('By the Foundations rule, your spending is above 89% of your income. Get it under the bar before you commit to a purchase.');
    if (f.missing.includes('savings_stale')) out.push('Record your savings balance. BCA Tabungan was last updated 74 days ago.');
    if (f.missing.includes('manageable_dti')) out.push('Record your debts, or confirm you have none.');
    return out;
  }

  window.PFGoals = { TODAY, rp, rpShort, ym, dmy, CATEGORIES, PRIORITY, COST_TYPES, ACCOUNTS, GUIDE, EXAMPLE, compute, nextStep, monthsLeft, cashNeeded, totalCost, allocatedOf, foundation, goalGate, GATE, gateBody, SCENARIOS, BARS, BASE, addMonths };
})();
