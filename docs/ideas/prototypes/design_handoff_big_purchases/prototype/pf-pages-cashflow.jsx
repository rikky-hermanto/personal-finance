/* ── Cashflow tabs: Transactions, Upload, Bank Accounts, Statements, Spend Pulse ── */

function TransactionTable({ accountId }) {
  const s = useStore();
  const [search, setSearch] = React.useState('');
  const [cat, setCat] = React.useState('all');
  const [type, setType] = React.useState('all');
  const [order, setOrder] = React.useState('desc');
  const [editing, setEditing] = React.useState(null);
  const [limit, setLimit] = React.useState(50);
  const sentinel = React.useRef(null);
  const all = React.useMemo(() => PFStore.withRunningBalance(), [s]);
  const rows = React.useMemo(() => {
    let r = all.filter((t) => (!accountId || t.accountId === accountId) && (cat === 'all' || t.category === cat) && (type === 'all' || t.type === type) && (!search || t.description.toLowerCase().includes(search.toLowerCase())));
    return order === 'desc' ? r.slice().reverse() : r;
  }, [all, accountId, cat, type, search, order]);
  React.useEffect(() => setLimit(50), [accountId, cat, type, search, order]);
  React.useEffect(() => {
    const el = sentinel.current; if (!el) return;
    const obs = new IntersectionObserver((e) => { if (e[0].isIntersecting) setLimit((l) => l + 50); }, { threshold: 0.1 });
    obs.observe(el); return () => obs.disconnect();
  }, []);
  const shown = rows.slice(0, limit);
  const setCategory = (id, category) => PFStore.update((st) => ({ ...st, transactions: st.transactions.map((t) => (t.id === id ? { ...t, category } : t)) }));
  const th = 'px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground';
  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative flex-1 min-w-48">
          <Icon name="Search" size={14} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search transactions…" className={cx(inputCls, 'pl-9')} />
        </div>
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="px-3 py-1.5 bg-muted border border-border rounded text-sm text-foreground focus:outline-none">
          <option value="all">All Categories</option>{s.categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)} className="px-3 py-1.5 bg-muted border border-border rounded text-sm text-foreground focus:outline-none">
          <option value="all">All Types</option><option value="income">Income</option><option value="expense">Expense</option><option value="transfer">Transfer</option>
        </select>
      </div>
      <div className="bg-card border border-border rounded-t-lg overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-border bg-muted/20">
            <tr>
              <th className={th}><button onClick={() => setOrder((o) => (o === 'desc' ? 'asc' : 'desc'))} className="inline-flex items-center gap-1 uppercase hover:text-foreground">Date <Icon name={order === 'desc' ? 'ArrowDown' : 'ArrowUp'} size={11} /></button></th>
              <th className={th}>Description</th><th className={th}>Category</th><th className={th}>Bank Account</th>
              <th className={cx(th, 'text-right')}>Amount</th><th className={cx(th, 'text-right')}>Balance</th><th className={th}></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {shown.length === 0 && <tr><td colSpan="7" className="px-5 py-10 text-center text-sm text-muted-foreground">No transactions found matching your criteria.</td></tr>}
            {shown.map((tx) => (
              <tr key={tx.id} className="hover:bg-foreground/[0.03] transition-colors">
                <td className="px-5 py-3 whitespace-nowrap font-mono text-xs text-muted-foreground tabular-nums">{fmtDate(tx.date)}</td>
                <td className="px-5 py-3 text-xs text-foreground/80 max-w-xs truncate">{tx.description}</td>
                <td className="px-5 py-3 whitespace-nowrap">
                  {editing === tx.id ? (
                    <select autoFocus value={tx.category} onBlur={() => setEditing(null)} onChange={(e) => { setCategory(tx.id, e.target.value); setEditing(null); }} className="bg-muted border border-border rounded text-xs px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring">
                      {s.categories.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  ) : <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-secondary text-secondary-foreground">{tx.category}</span>}
                </td>
                <td className="px-5 py-3 whitespace-nowrap text-xs text-muted-foreground">{tx.bank}</td>
                <td className={cx('px-5 py-3 whitespace-nowrap font-mono text-xs tabular-nums text-right', tx.flow === 'CR' ? 'text-income' : 'text-expense')}>{tx.flow === 'CR' ? fmtPlain(tx.amount) : `(${fmtPlain(tx.amount)})`}</td>
                <td className="px-5 py-3 whitespace-nowrap font-mono text-xs text-muted-foreground tabular-nums text-right">{fmtPlain(tx.balance)}</td>
                <td className="px-5 py-3"><button onClick={() => setEditing(tx.id)} className="text-muted-foreground hover:text-foreground transition-colors"><Icon name="Edit2" size={14} strokeWidth={1.5} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div ref={sentinel} className="h-1"></div>
      <div className="px-5 py-3 border border-t-0 border-border bg-card rounded-b-lg text-center">
        <p className="text-xs text-muted-foreground">Showing {shown.length} of {rows.length} transaction{rows.length !== 1 ? 's' : ''}</p>
      </div>
    </div>
  );
}

function downloadText(name, text, mime = 'text/csv') {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: mime })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function exportCsv() {
  const rows = PFStore.withRunningBalance();
  const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
  downloadText('transactions.csv', ['date,description,category,account,flow,amount_idr,balance'].concat(rows.map((t) => [t.date, esc(t.description), esc(t.category), esc(t.bank), t.flow, t.amount, t.balance].join(','))).join('\n'));
}

function DeleteAllDialog({ onClose }) {
  const toast = useToast();
  const [phrase, setPhrase] = React.useState('');
  const count = PFStore.state.transactions.length;
  const go = () => { PFStore.update((st) => ({ ...st, transactions: [] })); toast({ title: 'Transactions deleted', description: `${count} transactions were permanently deleted.` }); onClose(); };
  return (
    <Modal onClose={onClose}>
      <div className="p-6 space-y-3">
        <h2 className="text-lg font-semibold">Delete all transactions?</h2>
        <p className="text-sm text-muted-foreground">This will permanently delete <span className="font-semibold text-foreground">{count.toLocaleString()} transactions</span>. Your category rules will not be affected. <span className="font-medium text-foreground">This cannot be undone.</span></p>
        <p className="text-xs text-muted-foreground">Type <span className="font-mono font-medium text-foreground">delete all</span> to confirm:</p>
        <input value={phrase} onChange={(e) => setPhrase(e.target.value)} placeholder="delete all" className={inputCls} />
        <p className="text-[11px] text-muted-foreground">Settings → Data restores the sample dataset.</p>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className={btnOutline}>Cancel</button>
          <button disabled={phrase.trim().toLowerCase() !== 'delete all'} onClick={go} className={cx(btnPrimary, 'bg-destructive text-destructive-foreground')}>I understand, delete everything</button>
        </div>
      </div>
    </Modal>
  );
}

function TransactionsTab({ onNav }) {
  const [menu, setMenu] = React.useState(false);
  const [del, setDel] = React.useState(false);
  return (
    <div className="p-8 min-h-full">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Transactions</h1>
            <p className="text-sm text-muted-foreground mt-1">View and manage all your transactions</p>
          </div>
          <div className="flex gap-2 items-center relative">
            <button onClick={() => onNav('/cashflow/upload')} className={cx(btnPrimary, 'h-9 text-sm px-3')}><Icon name="Upload" size={16} />Upload Statement</button>
            <button onClick={() => setMenu((m) => !m)} className="h-9 w-9 rounded-md hover:bg-foreground/5 flex items-center justify-center"><Icon name="MoreHorizontal" size={16} /></button>
            {menu && (
              <div className="absolute right-0 top-full mt-1 w-52 z-30 pf-card shadow-lg p-1" onMouseLeave={() => setMenu(false)}>
                <button onClick={() => { exportCsv(); setMenu(false); }} className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-foreground/5"><Icon name="FileDown" size={14} />Export CSV</button>
                <div className="my-1 h-px bg-border"></div>
                <button onClick={() => { setDel(true); setMenu(false); }} className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded text-destructive hover:bg-destructive/10"><Icon name="Trash2" size={14} />Delete all transactions</button>
              </div>
            )}
          </div>
        </div>
        <TransactionTable />
      </div>
      {del && <DeleteAllDialog onClose={() => setDel(false)} />}
    </div>
  );
}

// ── Upload: drop → preview (dedup + categorize) → submit ─────────────
function samplePreview(accountId) {
  const existing = PFStore.state.transactions;
  const dup = existing.filter((t) => t.accountId === accountId).slice(-2);
  const fresh = [
    { date: '2026-10-21', description: 'Starbucks Reserve', amount: 87000, flow: 'DB', type: 'expense', category: 'Food & Dining' },
    { date: '2026-10-22', description: 'Tokopedia — Buku', amount: 214000, flow: 'DB', type: 'expense', category: 'Shopping' },
    { date: '2026-10-23', description: 'Bluebird Taxi', amount: 112000, flow: 'DB', type: 'expense', category: 'Transport' },
    { date: '2026-10-24', description: 'Bunga Tabungan', amount: 18450, flow: 'CR', type: 'income', category: 'Refund' },
    { date: '2026-10-24', description: 'Halodoc Konsultasi', amount: 95000, flow: 'DB', type: 'expense', category: 'Medical' },
  ];
  return [...dup.map((t) => ({ ...t, duplicate: true })), ...fresh.map((t, i) => ({ ...t, id: 'u' + Date.now() + i, accountId, duplicate: false }))].map((t) => ({ ...t, include: !t.duplicate }));
}

function UploadTab({ onNav }) {
  const toast = useToast();
  const s = useStore();
  const [phase, setPhase] = React.useState('drop');
  const [file, setFile] = React.useState(null);
  const [acc, setAcc] = React.useState('acc-bca');
  const [rows, setRows] = React.useState([]);
  const [over, setOver] = React.useState(false);
  const input = React.useRef(null);
  const start = (name) => { setFile(name); setPhase('parsing'); setTimeout(() => { setRows(samplePreview(acc)); setPhase('preview'); }, 900); };
  const submit = () => {
    const add = rows.filter((r) => r.include).map(({ duplicate, include, ...t }) => ({ ...t, id: 't' + Date.now() + Math.random().toString(36).slice(2, 6) }));
    PFStore.update((st) => ({ ...st, transactions: [...st.transactions, ...add].sort((a, b) => a.date.localeCompare(b.date)) }));
    toast({ title: 'Transaksi baru', description: `${add.length} transaksi masuk` });
    setPhase('done');
  };
  return (
    <div className="p-8 min-h-full">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Upload Transactions</h1>
          <p className="text-sm text-muted-foreground mt-1">Import your bank statements and transaction files</p>
        </div>
        {phase === 'drop' && (
          <div className="mt-[12vh] max-w-2xl mx-auto">
            <div onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; start(f ? f.name : 'statement.pdf'); }}
              onClick={() => input.current.click()} className={cx('cursor-pointer rounded-xl border-2 border-dashed px-8 py-14 text-center transition-colors', over ? 'border-foreground/40 bg-foreground/[0.03]' : 'border-border hover:border-foreground/25')}>
              <div className="w-11 h-11 rounded-full bg-foreground/5 mx-auto flex items-center justify-center"><Icon name="Upload" size={18} className="text-muted-foreground" /></div>
              <p className="text-sm font-medium mt-4">Drop your statement here, or click to browse</p>
              <p className="text-xs text-muted-foreground mt-1">BCA CSV, Neo Commerce PDF, standard CSV template, or a screenshot</p>
              <input ref={input} type="file" className="hidden" accept=".csv,.pdf,image/*" onChange={(e) => e.target.files[0] && start(e.target.files[0].name)} />
            </div>
            <div className="flex items-center justify-between mt-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Account</span>
                <select value={acc} onChange={(e) => setAcc(e.target.value)} className="px-2 py-1 bg-muted border border-border rounded text-xs">{s.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
              </div>
              <button onClick={() => start('bca-sample.csv')} className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">Try with a sample BCA statement</button>
            </div>
          </div>
        )}
        {phase === 'parsing' && (
          <div className="mt-[18vh] text-center"><Icon name="Loader2" size={20} className="animate-spin mx-auto text-muted-foreground" /><p className="text-sm text-muted-foreground mt-3">Reading {file}…</p></div>
        )}
        {phase === 'preview' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm"><span className="font-medium">{file}</span><span className="text-muted-foreground"> · {PFStore.accountName(acc)} · {rows.length} rows · {rows.filter((r) => r.duplicate).length} duplicates skipped</span></div>
              <div className="flex gap-2"><button onClick={() => setPhase('drop')} className={btnOutline}>Cancel</button><button onClick={submit} className={btnPrimary}>Submit {rows.filter((r) => r.include).length} transactions</button></div>
            </div>
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="border-b border-border bg-muted/20"><tr>{['', 'Date', 'Description', 'Category', 'Amount', ''].map((h, i) => <th key={i} className={cx('px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground', i === 4 ? 'text-right' : 'text-left')}>{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r, i) => (
                    <tr key={r.id} className={cx(r.duplicate && 'opacity-50')}>
                      <td className="px-4 py-2.5"><input type="checkbox" checked={r.include} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)))} /></td>
                      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{fmtDate(r.date)}</td>
                      <td className="px-4 py-2.5 text-xs">{r.description}</td>
                      <td className="px-4 py-2.5"><select value={r.category} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, category: e.target.value } : x)))} className="bg-muted border border-border rounded text-xs px-2 py-1">{s.categories.map((c) => <option key={c}>{c}</option>)}</select></td>
                      <td className={cx('px-4 py-2.5 font-mono text-xs text-right', r.flow === 'CR' ? 'text-income' : 'text-expense')}>{r.flow === 'CR' ? fmtPlain(r.amount) : `(${fmtPlain(r.amount)})`}</td>
                      <td className="px-4 py-2.5">{r.duplicate && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded text-warning bg-warning/10">duplicate</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {phase === 'done' && (
          <div className="mt-[16vh] text-center">
            <div className="w-11 h-11 rounded-full bg-success/10 mx-auto flex items-center justify-center"><Icon name="Check" size={18} className="text-success" /></div>
            <p className="text-sm font-medium mt-4">Statement imported</p>
            <div className="flex justify-center gap-2 mt-4"><button onClick={() => setPhase('drop')} className={btnOutline}>Upload another</button><button onClick={() => onNav('/cashflow/transactions')} className={btnPrimary}>View transactions</button></div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Statement table ──────────────────────────────────────────────────
function StatementTable({ data }) {
  const [collapsed, setCollapsed] = React.useState({});
  if (!data || !data.periods.length) return <div className="w-full h-48 bg-card border border-border rounded-lg flex items-center justify-center text-sm text-muted-foreground">No data available for this range.</div>;
  const fv = (v) => (v < 0 ? `(${fmtPlain(v)})` : fmtPlain(v));
  const sticky = 'sticky left-0 bg-card z-10';
  return (
    <div className="w-full bg-card border border-border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead><tr className="border-b border-border bg-muted/20">
            <th className={cx(sticky, 'p-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-[240px]')}>Item (IDR)</th>
            {data.periods.map((p) => <th key={p} className="p-4 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-[120px]">{p}</th>)}
          </tr></thead>
          <tbody className="text-sm">
            {data.sections.map((sec) => (
              <React.Fragment key={sec.id}>
                <tr className="cursor-pointer bg-muted/30 hover:bg-muted/50 border-t border-border" onClick={() => setCollapsed((c) => ({ ...c, [sec.id]: !c[sec.id] }))}>
                  <td className="sticky left-0 z-10 bg-muted p-3 font-bold text-foreground"><span className="inline-flex items-center gap-2"><Icon name={collapsed[sec.id] ? 'ChevronRight' : 'ChevronDown'} size={16} />{sec.label}</span></td>
                  {data.periods.map((p) => <td key={p}></td>)}
                </tr>
                {!collapsed[sec.id] && sec.subsections.map((sub) => (
                  <React.Fragment key={sub.id}>
                    <tr className="border-b border-border/50"><td className={cx(sticky, 'p-2 pl-8 font-medium text-muted-foreground italic text-xs')}>{sub.label}</td>{data.periods.map((p) => <td key={p}></td>)}</tr>
                    {sub.categories.map((c) => (
                      <tr key={c.category} className="hover:bg-muted/10 border-b border-border/30">
                        <td className={cx(sticky, 'p-2 pl-12 text-foreground/80')}>{c.category}</td>
                        {data.periods.map((p) => { const v = c.values[p] || 0; return <td key={p} className={cx('p-2 text-right text-xs font-mono', v < 0 ? 'text-expense/80' : 'text-income/80')}>{fv(v)}</td>; })}
                      </tr>
                    ))}
                    <tr className="border-b border-border/50 font-semibold">
                      <td className={cx(sticky, 'p-2 pl-8 text-foreground/90')}>Total {sub.label}</td>
                      {data.periods.map((p) => { const v = sub.totals[p] || 0; return <td key={p} className={cx('p-2 text-right text-xs font-mono border-t border-border/30', v < 0 ? 'text-expense/80' : 'text-income/80')}>{fv(v)}</td>; })}
                    </tr>
                  </React.Fragment>
                ))}
                {!collapsed[sec.id] && (
                  <tr className="bg-muted/20 border-b border-border font-bold">
                    <td className={cx(sticky, 'p-3 pl-4 text-foreground')}>Net {sec.label.split(' ')[0]}</td>
                    {data.periods.map((p) => { const v = sec.totals[p] || 0; return <td key={p} className={cx('p-3 text-right text-sm font-mono', v < 0 ? 'text-expense' : 'text-income')}>{fv(v)}</td>; })}
                  </tr>
                )}
              </React.Fragment>
            ))}
            <tr className="bg-muted/40 border-t-2 border-foreground/30 font-bold">
              <td className={cx(sticky, 'p-4 text-foreground uppercase tracking-tight')}>Net Cash Change</td>
              {data.periods.map((p) => { const v = data.grandTotals[p] || 0; return <td key={p} className={cx('p-4 text-right text-sm font-mono', v < 0 ? 'text-expense' : 'text-income underline decoration-double underline-offset-4')}>{fv(v)}</td>; })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

const GROUP_OPTS = [{ value: 'quarterly', label: 'Quarterly', icon: 'LayoutGrid' }, { value: 'monthly', label: 'Monthly', icon: 'Calendar' }];

function StatementTab() {
  const s = useStore();
  const [range, setRange] = useLS('pf_statement_range', 6);
  const [groupBy, setGroupBy] = useLS('pf_statement_groupby', 'quarterly');
  const data = React.useMemo(() => PFStore.statement(range, range === -1 ? 'quarterly' : groupBy), [s, range, groupBy]);
  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-foreground tracking-tight">Cash Flow Statement</h2>
            <p className="text-sm text-muted-foreground mt-1">Broken down by operating, investing, and financing activities.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2"><Segmented options={GROUP_OPTS} value={groupBy} onChange={setGroupBy} /><div className="w-px h-5 bg-border"></div><RangePills value={range} onChange={setRange} /></div>
        </div>
        {range === -1 && groupBy === 'monthly' && <p className="text-xs text-muted-foreground">Quarterly view applied — monthly columns would be too wide for All Time.</p>}
        <StatementTable data={data} />
      </div>
    </div>
  );
}

function BankAccountsTab() {
  const s = useStore();
  const [sel, setSel] = React.useState(null);
  const [view, setView] = useLS('pf_accounts_view', 'table');
  const [range, setRange] = useLS('pf_accounts_range', 6);
  const [groupBy, setGroupBy] = useLS('pf_accounts_groupby', 'quarterly');
  const sums = React.useMemo(() => PFStore.accountSummaries(), [s]);
  const tot = sums.reduce((a, x) => ({ income: a.income + x.totalIn, expenses: a.expenses + x.totalOut, count: a.count + x.transactionCount }), { income: 0, expenses: 0, count: 0 });
  const net = tot.income - tot.expenses;
  const selSum = sums.find((x) => x.accountId === sel);
  const title = selSum ? selSum.accountName : 'All Bank Accounts';
  const stmt = React.useMemo(() => (view === 'statement' ? PFStore.statement(range, range === -1 ? 'quarterly' : groupBy, sel) : null), [s, view, range, groupBy, sel]);
  const cardCls = (on) => cx('w-full text-left px-4 py-3 rounded-lg border transition-all duration-150', on ? 'border-primary/60 bg-primary/10 text-foreground' : 'border-border bg-card hover:bg-foreground/[0.03] text-foreground');
  return (
    <div className="h-full overflow-auto">
    <div className="max-w-7xl mx-auto flex gap-8 p-8">
      <div className="w-64 shrink-0 self-start sticky top-0 flex flex-col max-h-[calc(100vh-8rem)]">
        <div className="pb-3">
          <h2 className="text-sm font-semibold text-foreground mb-4">Bank Accounts</h2>
          <div className="rounded-lg bg-muted/50 border border-border px-3 py-3">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Net Position</div>
            <div className={cx('text-lg font-bold font-mono', net >= 0 ? 'text-success' : 'text-destructive')}>{net >= 0 ? '+' : ''}Rp {fmtCompact(net)}</div>
            <div className="flex gap-3 mt-1.5"><span className="text-success font-mono text-[10px]">↑ Rp {fmtCompact(tot.income)}</span><span className="text-destructive font-mono text-[10px]">↓ Rp {fmtCompact(tot.expenses)}</span></div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto space-y-1.5">
          <button onClick={() => setSel(null)} className={cardCls(sel === null)}>
            <div className="flex items-center gap-2"><Icon name="Building2" size={16} /><span className="text-sm font-medium">All Bank Accounts</span></div>
            <div className="text-[10px] text-muted-foreground mt-0.5 ml-6">{tot.count.toLocaleString()} transactions</div>
          </button>
          {sums.map((x) => {
            const on = sel === x.accountId; const pos = x.netPosition >= 0;
            return (
              <button key={x.accountId} onClick={() => setSel(on ? null : x.accountId)} className={cardCls(on)}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={cx('w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold', on ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground')}>{x.accountName.charAt(0)}</div>
                    <div className="min-w-0"><span className="text-sm font-medium block truncate">{x.accountName}</span><span className="text-[10px] text-muted-foreground">{x.institutionName}</span></div>
                  </div>
                  <span className={cx('text-xs font-mono font-medium shrink-0 ml-2', pos ? 'text-success' : 'text-destructive')}>{pos ? '+' : ''}Rp {fmtCompact(x.netPosition)}</span>
                </div>
                <div className="grid grid-cols-2 gap-1 mt-1">
                  <div className="flex items-center gap-1"><Icon name="TrendingUp" size={12} className="text-success" /><span className="text-[11px] text-muted-foreground font-mono">Rp {fmtCompact(x.totalIn)}</span></div>
                  <div className="flex items-center gap-1"><Icon name="TrendingDown" size={12} className="text-destructive" /><span className="text-[11px] text-muted-foreground font-mono">Rp {fmtCompact(x.totalOut)}</span></div>
                </div>
                <div className="text-[10px] text-muted-foreground mt-1.5">{x.transactionCount > 0 ? `${x.transactionCount.toLocaleString()} transactions` : 'No transactions yet'}</div>
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div>
          <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-foreground tracking-tight">{title}</h1>
              <p className="text-sm text-muted-foreground mt-1">{sel ? `Transactions for ${title}` : 'View transactions across all bank accounts'}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Segmented options={[{ value: 'table', label: 'Table', icon: 'LayoutList' }, { value: 'statement', label: 'Statement', icon: 'LayoutGrid' }]} value={view} onChange={setView} />
              {view === 'statement' && <><Segmented options={GROUP_OPTS} value={groupBy} onChange={setGroupBy} /><div className="w-px h-5 bg-border"></div><RangePills value={range} onChange={setRange} /></>}
              {sel && <button onClick={() => setSel(null)} className="h-7 px-2 text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground"><Icon name="X" size={14} />Clear</button>}
            </div>
          </div>
          {view === 'table' ? <TransactionTable key={sel || 'all'} accountId={sel} /> : <StatementTable data={stmt} />}
        </div>
      </div>
    </div>
    </div>
  );
}

Object.assign(window, { TransactionTable, TransactionsTab, UploadTab, StatementTable, StatementTab, BankAccountsTab, downloadText });
