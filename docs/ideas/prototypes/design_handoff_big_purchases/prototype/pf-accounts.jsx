/* ── Assets › Accounts (zen revamp) — mirrors apps/frontend/src/components/accounts/* ── */
(function migrateAccountsV2() {
  const s = PFStore.state; if (s.accountsV2) return;
  PFStore.update((st) => {
    const typeOf = { 'acc-bca': 'checking' };
    const accounts = st.accounts.map((a) => ({ accountType: typeOf[a.id] || 'savings', isActive: true, includeInCashflow: true, ...a }));
    const insts = [...st.institutions];
    const addInst = (i) => { if (!insts.some((x) => x.id === i.id)) insts.push(i); };
    addInst({ id: 'inst-gopay', name: 'GoPay', type: 'other' });
    addInst({ id: 'inst-binance', name: 'Binance', type: 'crypto_exchange' });
    const extra = [
      { id: 'acc-bibit', name: 'Bibit', institutionId: 'inst-bibit', accountType: 'brokerage', value: 25300000, at: '2026-09-01' },
      { id: 'acc-gopay', name: 'GoPay', institutionId: 'inst-gopay', accountType: 'wallet', value: 450000, at: '2026-08-02' },
      { id: 'acc-binance', name: 'Binance', institutionId: 'inst-binance', accountType: 'wallet', value: 6250000, at: '2026-05-14' },
    ].filter((x) => !accounts.some((a) => a.id === x.id))
      .map((x) => ({ id: x.id, name: x.name, institutionId: x.institutionId, accountType: x.accountType, currency: 'IDR', openingBalance: x.value, openingDate: x.at, isActive: true, includeInCashflow: false, valuation: { value: x.value, valuedAt: x.at } }));
    return { ...st, accountsV2: true, institutions: insts, accounts: [...accounts, ...extra] };
  });
})();

const ACC_STALE_DAYS = 30;
const ACC_GROUPS = [['cash', 'Cash'], ['investing', 'Investing'], ['crypto', 'Crypto'], ['other', 'Other']];
const ACC_TYPES = ['savings', 'checking', 'brokerage', 'wallet', 'credit_card', 'loan'];
const accNow = () => new Date(PFStore.TODAY);
const accDays = (iso) => Math.max(0, Math.round((accNow() - new Date(iso)) / 864e5));
function accAge(iso) {
  const d = accDays(iso);
  if (d === 0) return 'today'; if (d === 1) return 'yesterday'; if (d < 7) return `${d} days ago`; if (d < 14) return 'last week';
  if (d < 30) return `${Math.floor(d / 7)} weeks ago`; if (d < 60) return 'last month'; if (d < 365) return `${Math.floor(d / 30)} months ago`;
  if (d < 730) return 'last year'; return `${Math.floor(d / 365)} years ago`;
}
function accGroup(type, instType) {
  if (type === 'checking' || type === 'savings') return 'cash';
  if (type === 'brokerage') return 'investing';
  if (type === 'wallet') return instType === 'crypto_exchange' ? 'crypto' : 'cash';
  return 'other';
}
const instGroup = (t) => (t === 'bank' || t === 'digital bank' ? 'cash' : t === 'broker' ? 'investing' : t === 'crypto_exchange' ? 'crypto' : 'other');
function accTypeLabel(type, instType) {
  return { checking: 'Checking', savings: 'Savings', credit_card: 'Credit card', brokerage: 'Brokerage', loan: 'Loan' }[type] || (type === 'wallet' ? (instType === 'crypto_exchange' ? 'Crypto wallet' : 'E-wallet') : type);
}
const accInitials = (n) => { const w = n.trim().split(/\s+/).filter(Boolean); return !w.length ? '?' : w.length === 1 ? w[0].slice(0, 2).toUpperCase() : (w[0][0] + w[1][0]).toUpperCase(); };
const fmtAmt = (v) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(v);
const fmtRp = (v) => 'Rp ' + fmtAmt(Math.round(v));
function parseAmt(raw) { const c = raw.replace(/[^\d,]/g, ''); if (!/\d/.test(c)) return null; const [i, f = ''] = c.split(','); const v = Number(`${i || '0'}.${f || '0'}`); return Number.isFinite(v) ? v : null; }
function typingAmt(raw) {
  const c = raw.replace(/[^\d,]/g, ''); if (c === '') return '';
  const at = c.indexOf(','); const int = ((at === -1 ? c : c.slice(0, at)).replace(/^0+(?=\d)/, '') || '0').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return at === -1 ? int : `${int},${c.slice(at + 1).replace(/,/g, '').slice(0, 2)}`;
}

function useAccountViews() {
  const s = useStore(); const bal = PFStore.balances();
  const accounts = s.accounts.map((a) => {
    const inst = s.institutions.find((i) => i.id === a.institutionId);
    const last = s.transactions.filter((t) => t.accountId === a.id).slice(-1)[0];
    const txAt = last ? last.date : a.openingDate;
    const useVal = a.valuation && a.valuation.valuedAt >= txAt;
    const updatedAt = useVal ? a.valuation.valuedAt : txAt;
    const isActive = a.isActive !== false;
    return { ...a, inst, isActive, includeInCashflow: a.includeInCashflow !== false, accountType: a.accountType || 'savings', value: useVal ? a.valuation.value : bal[a.id] || 0, updatedAt, stale: isActive && accDays(updatedAt) >= ACC_STALE_DAYS, hasTx: !!last };
  });
  return { s, accounts };
}
const patchAccount = (id, patch) => PFStore.update((st) => ({ ...st, accounts: st.accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
const saveBalance = (id, value) => patchAccount(id, { valuation: { value, valuedAt: PFStore.TODAY } });

const ACC_PILL = 'inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition-opacity disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const ACC_DARK = ACC_PILL + ' bg-foreground text-background hover:opacity-90';
const ACC_TITLE = 'text-[30px] font-normal leading-[1.1]';
const titleFont = { fontFamily: 'var(--font-title)' };
const EYEBROW = 'text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground';

const Monogram = ({ name, lg, className }) => <span aria-hidden className={cx('grid shrink-0 place-items-center rounded-full bg-secondary font-data font-semibold text-foreground', lg ? 'h-14 w-14 text-[15px]' : 'h-9 w-9 text-xs', className)}>{accInitials(name)}</span>;

function AmountInput({ value, onChange, lg, autoFocus, className, invalid }) {
  return (
    <label className={cx('flex items-center gap-2 rounded-xl border bg-card px-3.5 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1', invalid ? 'border-destructive' : 'border-border', lg ? 'h-[60px] justify-center' : 'h-12', className)}>
      <span className={cx('text-muted-foreground', lg ? 'text-base' : 'text-sm')}>Rp</span>
      <input type="text" inputMode="decimal" autoComplete="off" autoFocus={autoFocus} value={value} onChange={(e) => onChange(typingAmt(e.target.value))} placeholder="0" size={lg ? Math.max(value.length, 1) : undefined}
        className={cx('font-data min-w-0 bg-transparent outline-none placeholder:text-muted-foreground/50', lg ? 'w-auto max-w-full text-2xl' : 'flex-1 text-lg')} />
    </label>
  );
}

const ROW = 'grid w-full grid-cols-[36px_1fr_auto_16px] items-center gap-3.5 rounded-xl p-3 text-left transition-colors hover:bg-background/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
function AccountRow({ a, onOpen }) {
  const typeLabel = accTypeLabel(a.accountType, a.inst && a.inst.type);
  const showInst = a.inst && a.inst.name.trim().toLowerCase() !== a.name.trim().toLowerCase();
  return (
    <button type="button" onClick={() => onOpen(a.id)} className={cx(ROW, !a.isActive && 'opacity-[.55]')}>
      <Monogram name={a.inst ? a.inst.name : a.name} />
      <div className="min-w-0"><div className="truncate text-sm font-medium">{a.name}</div><div className="mt-0.5 truncate text-xs text-muted-foreground">{showInst ? `${typeLabel} · ${a.inst.name}` : typeLabel}{!a.isActive && ' · Archived'}</div></div>
      <div className="text-right"><div className="font-data whitespace-nowrap text-sm font-medium">{fmtRp(a.value)}</div><div className={cx('mt-0.5 whitespace-nowrap text-[11.5px]', a.stale ? 'text-warning' : 'text-muted-foreground')}>{a.stale ? 'Needs update' : `Updated ${accAge(a.updatedAt)}`}</div></div>
      <Icon name="ChevronRight" size={16} className="text-muted-foreground/50" />
    </button>
  );
}
const FinishSetupRow = ({ inst, onFinish }) => (
  <button type="button" onClick={() => onFinish(inst)} className={cx(ROW, 'opacity-[.55] hover:opacity-100')}>
    <Monogram name={inst.name} />
    <div className="min-w-0"><div className="truncate text-sm font-medium">{inst.name}</div><div className="mt-0.5 text-xs text-muted-foreground">No account added yet</div></div>
    <div className="whitespace-nowrap text-right text-[11.5px] font-medium text-foreground">Finish setup</div>
    <Icon name="ChevronRight" size={16} className="text-muted-foreground/50" />
  </button>
);

function AccountSheet({ a, onClose, onEdit }) {
  const toast = useToast();
  const current = a.valuation && a.valuation.valuedAt >= a.updatedAt ? a.valuation.value : a.value;
  const [draft, setDraft] = React.useState(fmtAmt(current));
  const [confirm, setConfirm] = React.useState(false);
  React.useEffect(() => setDraft(fmtAmt(a.value)), [a.value]);
  React.useEffect(() => { const h = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, []);
  const parsed = parseAmt(draft); const changed = parsed !== null && parsed !== a.value;
  const typeLabel = accTypeLabel(a.accountType, a.inst && a.inst.type);
  const remove = () => {
    setConfirm(false);
    if (a.hasTx) { toast({ variant: 'destructive', title: 'Couldn’t remove this account', description: 'It still has transactions linked to it. Archive it from Edit details instead.' }); return; }
    PFStore.update((st) => ({ ...st, accounts: st.accounts.filter((x) => x.id !== a.id) })); onClose();
  };
  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-[rgb(40_36_30/0.18)]" onClick={onClose}></div>
      <aside className="absolute inset-y-0 right-0 flex w-[400px] max-w-full flex-col gap-6 overflow-y-auto border-l border-border bg-card p-7 shadow-[-12px_0_40px_rgb(0_0_0/0.06)] pop-in" style={{ animationName: 'accSlide', animationDuration: '200ms' }}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3"><Monogram name={a.inst ? a.inst.name : a.name} /><div className="min-w-0"><div className="truncate text-base font-medium">{a.name}</div><div className="mt-0.5 text-xs text-muted-foreground">{typeLabel} · {a.currency}{!a.isActive && ' · Archived'}</div></div></div>
          <button onClick={onClose} className="text-muted-foreground hover:opacity-70"><Icon name="X" size={18} /></button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); if (changed) saveBalance(a.id, parsed); }} className="flex flex-col gap-2.5">
          <span className={EYEBROW}>Balance today</span>
          <AmountInput value={draft} onChange={setDraft} />
          <p className={cx('text-xs', a.stale ? 'text-warning' : 'text-muted-foreground')}>{a.stale ? `Last updated ${accAge(a.updatedAt)}. Enter today’s balance to keep net worth accurate.` : `Last updated ${accAge(a.updatedAt)}`}</p>
          <button type="submit" disabled={!changed} className={cx(ACC_DARK, 'self-start')}>Save balance</button>
        </form>
        <div className="flex items-start gap-3.5 border-y border-border py-4">
          <div className="flex-1"><div className="text-[13.5px] font-medium">Include in Cashflow</div><p className="mt-1 text-[12.5px] leading-[1.45] text-muted-foreground">Transactions from this account count toward your monthly income and spending.</p></div>
          <button role="switch" aria-checked={a.includeInCashflow} onClick={() => patchAccount(a.id, { includeInCashflow: !a.includeInCashflow })} className={cx('relative h-6 w-10 shrink-0 rounded-full transition-colors', a.includeInCashflow ? 'bg-foreground' : 'bg-border')}>
            <span className={cx('absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-all', a.includeInCashflow ? 'left-[19px]' : 'left-[3px]')}></span>
          </button>
        </div>
        <dl className="grid grid-cols-[1fr_auto] gap-y-2.5 text-[13px] m-0">
          <dt className="text-muted-foreground">Bank / app</dt><dd className="text-right m-0">{a.inst ? a.inst.name : '—'}</dd>
          <dt className="text-muted-foreground">Type</dt><dd className="text-right m-0">{typeLabel}</dd>
          <dt className="text-muted-foreground">Currency</dt><dd className="text-right m-0">{a.currency}</dd>
        </dl>
        <div className="mt-auto flex justify-between text-[13px]">
          <button onClick={() => onEdit(a)} className="hover:opacity-70">Edit details</button>
          <button onClick={() => setConfirm(true)} className="text-destructive hover:opacity-70">Remove account</button>
        </div>
      </aside>
      {confirm && (
        <Modal onClose={() => setConfirm(false)}>
          <div className="p-6 flex flex-col gap-4">
            <div><p className="text-base font-semibold">Remove {a.name}?</p><p className="mt-1.5 text-sm text-muted-foreground">It will no longer count toward your net worth. An account with transactions or holdings can’t be removed; archive it from Edit details instead.</p></div>
            <div className="flex justify-end gap-2"><button onClick={() => setConfirm(false)} className={btnOutline}>Cancel</button><button onClick={remove} className={cx(btnPrimary, 'bg-destructive text-destructive-foreground')}>Remove account</button></div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function EditAccountDialog({ a, onClose }) {
  const [f, setF] = React.useState({ name: a.name, accountType: a.accountType, isActive: a.isActive });
  const save = () => { if (!f.name.trim()) return; patchAccount(a.id, { name: f.name.trim(), accountType: f.accountType, isActive: f.isActive }); onClose(); };
  return (
    <Modal onClose={onClose}>
      <div className="p-6 flex flex-col gap-4">
        <p className="text-base font-semibold">Edit details</p>
        <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">Name<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={inputCls} /></label>
        <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">Type<select value={f.accountType} onChange={(e) => setF({ ...f, accountType: e.target.value })} className={inputCls}>{ACC_TYPES.map((t) => <option key={t} value={t}>{accTypeLabel(t, a.inst && a.inst.type)}</option>)}</select></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!f.isActive} onChange={(e) => setF({ ...f, isActive: !e.target.checked })} />Archived</label>
        <div className="flex justify-end gap-2"><button onClick={onClose} className={btnOutline}>Cancel</button><button onClick={save} className={btnPrimary}>Save</button></div>
      </div>
    </Modal>
  );
}

function BalanceCheckIn({ queue, onClose }) {
  const [index, setIndex] = React.useState(0);
  const [draft, setDraft] = React.useState('');
  const [skipped, setSkipped] = React.useState(0);
  React.useEffect(() => { const h = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, []);
  const a = queue[index];
  const next = () => { setDraft(''); setIndex((i) => i + 1); };
  const saveNext = (v) => { saveBalance(a.id, v); next(); };
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-7 overflow-y-auto bg-card px-4 py-20 pop-in" style={{ animationName: 'accFade' }}>
      <div className="absolute inset-x-8 top-7 flex justify-between text-[13px] text-muted-foreground">
        <span>Balance check-in</span>
        <button onClick={onClose} className="flex items-center gap-1.5 hover:text-foreground"><Icon name="X" size={16} />Done for now</button>
      </div>
      {a ? (
        <form key={a.id} onSubmit={(e) => { e.preventDefault(); const v = parseAmt(draft); if (v !== null) saveNext(v); }} className="flex w-full flex-col items-center gap-7">
          <div className="flex gap-1.5">{queue.map((_, i) => <span key={i} className={cx('h-[3px] w-6 rounded-sm', i <= index ? 'bg-foreground' : 'bg-border')}></span>)}</div>
          <Monogram name={a.inst ? a.inst.name : a.name} lg />
          <div className="text-center">
            <p className={ACC_TITLE} style={titleFont}>What’s in your {a.name} {accTypeLabel(a.accountType, a.inst && a.inst.type).toLowerCase()} today?</p>
            <p className="mt-1.5 text-sm text-muted-foreground">Last recorded <span className="font-data">{fmtRp(a.value)}</span> · {accAge(a.updatedAt)}</p>
          </div>
          <AmountInput value={draft} onChange={setDraft} lg autoFocus className="w-full max-w-[360px]" />
          <div className="flex gap-2.5">
            <button type="button" onClick={() => saveNext(a.value)} className={cx(ACC_PILL, 'border border-border bg-card hover:bg-secondary')}>Same as before</button>
            <button type="submit" disabled={parseAmt(draft) === null} className={ACC_DARK}>Save &amp; next</button>
          </div>
          <p className="text-[12.5px] text-muted-foreground">{index + 1} of {queue.length} · <button type="button" onClick={() => { setSkipped((s) => s + 1); next(); }} className="hover:text-foreground">Skip this one</button></p>
        </form>
      ) : (
        <div className="flex flex-col items-center gap-6 text-center">
          <div>
            <p className={ACC_TITLE} style={titleFont}>{skipped === 0 ? 'All balances are up to date' : 'That’s all for now'}</p>
            {skipped > 0 && <p className="mt-1.5 text-sm text-muted-foreground">You skipped {skipped} {skipped === 1 ? 'account' : 'accounts'}. {skipped === 1 ? 'It' : 'They'}’ll be here next time.</p>}
          </div>
          <button onClick={onClose} autoFocus className={ACC_DARK}>Back to accounts</button>
        </div>
      )}
    </div>
  );
}

const PLACE_KINDS = [
  { kind: 'bank', icon: 'Landmark', title: 'Bank', desc: 'Savings or checking, like BCA or Jago', instType: 'bank', acc: 'savings', ph: 'e.g. BCA' },
  { kind: 'investing', icon: 'TrendingUp', title: 'Investing app', desc: 'Stocks or funds, like Bibit or Stockbit', instType: 'broker', acc: 'brokerage', ph: 'e.g. Bibit' },
  { kind: 'crypto', icon: 'Bitcoin', title: 'Crypto', desc: 'Exchange or wallet, like Binance', instType: 'crypto_exchange', acc: 'wallet', ph: 'e.g. Binance' },
  { kind: 'other', icon: 'Wallet', title: 'Something else', desc: 'E-wallet, cash, marketplace balance', instType: 'other', acc: 'wallet', ph: 'e.g. GoPay' },
];
const kindFor = (t) => (PLACE_KINDS.find((k) => k.instType === t) || (t === 'digital bank' ? PLACE_KINDS[0] : PLACE_KINDS[3]));

function AddPlaceFlow({ institutions, accounts, preset, onDone }) {
  const [step, setStep] = React.useState(preset ? 2 : 1);
  const [picked, setPicked] = React.useState(preset ? kindFor(preset.type).kind : null);
  const kind = PLACE_KINDS.find((k) => k.kind === picked) || PLACE_KINDS[0];
  return (
    <div className="flex w-full flex-col items-center gap-8">
      <div className="flex gap-1.5">{[1, 2].map((i) => <span key={i} className={cx('h-[3px] w-6 rounded-sm', i <= step ? 'bg-foreground' : 'bg-border')}></span>)}</div>
      {step === 1 ? (
        <>
          <div className="text-center"><h2 className={ACC_TITLE} style={titleFont}>Where does your money live?</h2><p className="mt-1.5 text-sm text-muted-foreground">Add one place to start. You can add the rest later.</p></div>
          <div className="grid w-full max-w-[492px] grid-cols-1 gap-3 sm:grid-cols-2">
            {PLACE_KINDS.map((k) => (
              <button key={k.kind} type="button" onClick={() => setPicked(k.kind)} onDoubleClick={() => { setPicked(k.kind); setStep(2); }}
                className={cx('flex flex-col gap-3.5 rounded-2xl border bg-card p-5 text-left transition-colors', picked === k.kind ? 'border-foreground ring-1 ring-foreground' : 'border-border hover:border-foreground/30')}>
                <Icon name={k.icon} size={20} />
                <span><span className="block text-sm font-medium">{k.title}</span><span className="mt-0.5 block text-[12.5px] leading-[1.45] text-muted-foreground">{k.desc}</span></span>
              </button>
            ))}
          </div>
          <button disabled={!picked} onClick={() => setStep(2)} className={cx(ACC_DARK, 'h-[42px] px-[22px]')}>Continue</button>
        </>
      ) : <PlaceForm kind={kind} institutions={institutions} accounts={accounts} preset={preset} onBack={preset ? null : () => setStep(1)} onDone={onDone} />}
    </div>
  );
}

function PlaceForm({ kind, institutions, accounts, preset, onBack, onDone }) {
  const [name, setName] = React.useState(preset ? preset.name : '');
  const [accountType, setAccountType] = React.useState(kind.acc);
  const [currency, setCurrency] = React.useState('IDR');
  const [balance, setBalance] = React.useState('');
  const [touched, setTouched] = React.useState(false);
  const trimmed = name.trim();
  const match = preset || institutions.find((i) => i.name.trim().toLowerCase() === trimmed.toLowerCase());
  const amount = parseAmt(balance);
  const errors = { name: trimmed ? null : 'Give this place a name', currency: /^[A-Za-z]{3}$/.test(currency.trim()) ? null : 'Use a 3-letter code, like IDR', balance: amount === null ? 'Enter today’s balance (0 is fine)' : null };
  const valid = !errors.name && !errors.currency && !errors.balance;
  const err = (m) => (touched && m ? <p className="text-xs text-destructive">{m}</p> : null);
  const submit = (e) => {
    e.preventDefault(); setTouched(true); if (!valid) return;
    PFStore.update((st) => {
      let inst = match; const insts = [...st.institutions];
      if (!inst) { inst = { id: 'inst-' + Date.now(), name: trimmed, type: kind.instType }; insts.push(inst); }
      const taken = st.accounts.some((a) => a.institutionId === inst.id && a.name.trim().toLowerCase() === trimmed.toLowerCase());
      const acc = { id: 'acc-' + Date.now(), name: taken ? `${trimmed} ${accTypeLabel(accountType, inst.type)}` : trimmed, institutionId: inst.id, accountType, currency: currency.trim().toUpperCase(), openingBalance: amount, openingDate: PFStore.TODAY, isActive: true, includeInCashflow: true, valuation: { value: amount, valuedAt: PFStore.TODAY } };
      return { ...st, institutions: insts, accounts: [...st.accounts, acc] };
    });
    onDone && onDone();
  };
  const removePreset = () => { PFStore.update((st) => ({ ...st, institutions: st.institutions.filter((i) => i.id !== preset.id) })); onDone && onDone(); };
  const label = 'text-sm font-medium';
  const field = 'h-12 w-full rounded-xl border border-border bg-card px-3.5 text-sm outline-none focus:ring-2 focus:ring-ring';
  return (
    <form onSubmit={submit} noValidate className="flex w-full max-w-[400px] flex-col gap-5">
      <div className="text-center"><h2 className={ACC_TITLE} style={titleFont}>{preset ? `Finish setting up ${preset.name}` : `Add your ${kind.title.toLowerCase()}`}</h2><p className="mt-1.5 text-sm text-muted-foreground">Enter what’s in it today. You can change this later.</p></div>
      <div className="flex flex-col gap-2">
        <label className={label}>Name</label>
        <input list="pf-place-names" value={name} onChange={(e) => setName(e.target.value)} readOnly={!!preset} autoFocus={!preset} autoComplete="off" placeholder={kind.ph} className={field} />
        <datalist id="pf-place-names">{institutions.map((i) => <option key={i.id} value={i.name}></option>)}</datalist>
        {match && !preset && <p className="text-xs text-muted-foreground">Adds an account to your existing {match.name}.</p>}
        {err(errors.name)}
      </div>
      <div className="grid grid-cols-[1fr_120px] gap-3">
        <div className="flex flex-col gap-2"><label className={label}>Type</label><select value={accountType} onChange={(e) => setAccountType(e.target.value)} className={field}>{ACC_TYPES.map((t) => <option key={t} value={t}>{accTypeLabel(t, match ? match.type : kind.instType)}</option>)}</select></div>
        <div className="flex flex-col gap-2"><label className={label}>Currency</label><input value={currency} maxLength={3} onChange={(e) => setCurrency(e.target.value.toUpperCase())} className={cx(field, 'font-data uppercase')} /></div>
      </div>
      {err(errors.currency)}
      <div className="flex flex-col gap-2"><label className={label}>Balance today</label><AmountInput value={balance} onChange={setBalance} autoFocus={!!preset} invalid={touched && !!errors.balance} />{err(errors.balance)}</div>
      <div className={cx('flex items-center', onBack || preset ? 'justify-between' : 'justify-end')}>
        {preset && <button type="button" onClick={removePreset} className="text-[13px] text-destructive hover:opacity-70">Remove {preset.name} instead</button>}
        {onBack && <button type="button" onClick={onBack} className="text-[13px] text-muted-foreground hover:text-foreground">Back</button>}
        <button type="submit" className={cx(ACC_DARK, 'h-[42px] px-[22px]')}>Add account</button>
      </div>
    </form>
  );
}

function AssetsAccountsTab() {
  const { s, accounts } = useAccountViews();
  const [filter, setFilter] = React.useState('all');
  const [showArchived, setShowArchived] = React.useState(false);
  const [selId, setSelId] = React.useState(null);
  const [edit, setEdit] = React.useState(null);
  const [addFlow, setAddFlow] = React.useState(null);
  const [checkIn, setCheckIn] = React.useState(null);
  const active = accounts.filter((a) => a.isActive);
  const archived = accounts.length - active.length;
  const stale = active.filter((a) => a.stale).sort((x, y) => x.updatedAt.localeCompare(y.updatedAt));
  const total = active.reduce((x, a) => x + a.value, 0);
  const withAcc = new Set(accounts.map((a) => a.institutionId));
  const unfinished = s.institutions.filter((i) => !withAcc.has(i.id));
  const listed = showArchived ? accounts : active;
  const groups = ACC_GROUPS.map(([key, label]) => {
    const rows = listed.filter((a) => accGroup(a.accountType, a.inst && a.inst.type) === key);
    return { key, label, rows, unfinished: unfinished.filter((i) => instGroup(i.type) === key), subtotal: rows.filter((a) => a.isActive).reduce((x, a) => x + a.value, 0) };
  }).filter((g) => g.rows.length || g.unfinished.length);
  const filters = ['all', ...groups.map((g) => g.key).filter((k) => k !== 'other')];
  const af = filters.includes(filter) ? filter : 'all';
  const visible = af === 'all' ? groups : groups.filter((g) => g.key === af);
  const sel = accounts.find((a) => a.id === selId);
  const FL = { all: 'All', cash: 'Cash', investing: 'Investing', crypto: 'Crypto' };

  if (accounts.length === 0 && s.institutions.length === 0) {
    return <div className="p-8"><div className="mx-auto flex min-h-[560px] w-full max-w-6xl items-center"><AddPlaceFlow institutions={s.institutions} accounts={accounts} /></div></div>;
  }
  return (
    <div className="p-8">
      <style>{'@keyframes accSlide{from{transform:translateX(24px);opacity:0}to{transform:none;opacity:1}}@keyframes accFade{from{opacity:0}to{opacity:1}}'}</style>
      <div className="mx-auto w-full max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className={cx(EYEBROW, 'mb-2.5')}>Accounts</p>
            <p className="font-data whitespace-nowrap text-[28px] font-medium leading-[1.1] sm:text-[34px]">{fmtRp(total)}</p>
            <p className="mt-1.5 text-[13px] text-muted-foreground">Across {active.length} {active.length === 1 ? 'account' : 'accounts'}</p>
          </div>
          <button onClick={() => setAddFlow({})} className={cx(ACC_DARK, 'shrink-0')}><Icon name="Plus" size={14} />Add account</button>
        </div>
        {stale.length > 0 && (
          <div className="mt-[22px] flex items-center justify-between gap-3 rounded-xl bg-warning/10 px-4 py-3 text-[13px]">
            <span className="flex min-w-0 items-center gap-2.5"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning"></span><span className="min-w-0">{`${stale.length} ${stale.length === 1 ? 'balance hasn’t' : 'balances haven’t'} been updated in 30+ days`}</span></span>
            <button onClick={() => setCheckIn(stale)} className="shrink-0 font-medium text-foreground hover:opacity-70">Review now →</button>
          </div>
        )}
        {filters.length > 2 && (
          <div className="mt-[22px] flex flex-wrap gap-1.5">
            {filters.map((f) => <button key={f} onClick={() => setFilter(f)} className={cx('h-[30px] rounded-full px-3 text-[12.5px] transition-colors', af === f ? 'bg-secondary font-medium text-foreground' : 'text-muted-foreground hover:text-foreground')}>{FL[f]}</button>)}
          </div>
        )}
        {visible.map((g) => (
          <section key={g.key}>
            <div className={cx(EYEBROW, 'flex items-baseline justify-between px-1 pb-2 pt-[22px]')}><span>{g.label}</span><span className="font-data whitespace-nowrap text-xs normal-case tracking-normal">{fmtRp(g.subtotal)}</span></div>
            <div className="flex flex-col">
              {g.rows.map((a) => <AccountRow key={a.id} a={a} onOpen={setSelId} />)}
              {g.unfinished.map((i) => <FinishSetupRow key={i.id} inst={i} onFinish={(preset) => setAddFlow({ preset })} />)}
            </div>
          </section>
        ))}
        {archived > 0 && <button onClick={() => setShowArchived((v) => !v)} className="mt-6 px-1 text-xs text-muted-foreground hover:text-foreground">{showArchived ? 'Hide archived' : `Show archived (${archived})`}</button>}
      </div>
      {addFlow && (
        <Modal onClose={() => setAddFlow(null)} width="max-w-[560px]">
          <div className="max-h-[92vh] overflow-y-auto px-6 py-10" onClick={(e) => e.stopPropagation()}><AddPlaceFlow institutions={s.institutions} accounts={accounts} preset={addFlow.preset} onDone={() => setAddFlow(null)} /></div>
        </Modal>
      )}
      {sel && <AccountSheet key={sel.id} a={sel} onClose={() => setSelId(null)} onEdit={(a) => { setSelId(null); setEdit(a); }} />}
      {edit && <EditAccountDialog a={edit} onClose={() => { setSelId(edit.id); setEdit(null); }} />}
      {checkIn && <BalanceCheckIn queue={checkIn} onClose={() => setCheckIn(null)} />}
    </div>
  );
}

Object.assign(window, { AssetsAccountsTab });
