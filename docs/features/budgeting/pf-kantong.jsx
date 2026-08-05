/* ── Kantong: one card, five states. Wajib sheet. ─────────────────────────── */
const K = window.KT;
const kcn = (...a) => a.filter(Boolean).join(' ');

const KT_TONE = {
  wajib: 'hsl(var(--foreground))',
  simpanan: 'hsl(var(--success))',
  bebas: 'hsl(220 55% 55%)',
  over: 'hsl(var(--warning))',
  risk: 'hsl(var(--destructive))',
};

function KtGlyph({ kind, size = 26 }) {
  const icon = kind === 'wajib' ? 'Lock' : kind === 'simpanan' ? 'Shield' : 'Coffee';
  const tone = KT_TONE[kind];
  return (
    <div className="grid place-items-center rounded-md flex-shrink-0"
      style={{ width: size, height: size, background: `color-mix(in oklab, ${tone} 12%, transparent)`, color: tone }}>
      <Icon name={icon} size={Math.round(size * 0.54)} strokeWidth={1.9} />
    </div>
  );
}

function KtBar({ pct, tone, height = 6, track = 0.07 }) {
  return (
    <div className="w-full rounded-full overflow-hidden" style={{ height, background: `hsl(var(--foreground) / ${track})` }}>
      <div className="grow-bar h-full rounded-full" style={{ width: Math.max(0, Math.min(100, pct)) + '%', background: tone }} />
    </div>
  );
}

/* Wajib is a guess until the user confirms it. Expandable, correctable. */
function KtWajibSheet({ open, onClose, items, onDemote }) {
  if (!open) return null;
  const total = items.reduce((s, i) => s + i.amount, 0);
  const guessed = items.filter((i) => !i.certain).length;
  const guessLabel = guessed === 0 ? 'semua terkonfirmasi' : guessed + ' masih tebakan';
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-6" style={{ background: 'hsl(var(--foreground) / 0.28)' }} onClick={onClose}>
      <div className="pf-card w-full max-w-[520px] overflow-hidden pop-in" onClick={(e) => e.stopPropagation()} style={{ boxShadow: '0 24px 60px -12px rgb(0 0 0 / 0.30)' }}>
        <div className="px-5 pt-5 pb-4 flex items-start gap-3 border-b border-border">
          <KtGlyph kind="wajib" size={30} />
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold tracking-tight">Wajib</div>
            <div className="text-xs text-muted-foreground mt-0.5">{K.rp(total)} · {items.length} komitmen · {guessLabel}</div>
          </div>
          <button onClick={onClose} className="p-1.5 -mr-1.5 -mt-1 rounded-md hover:bg-foreground/5 text-muted-foreground transition-colors"><Icon name="X" size={15} /></button>
        </div>
        <div className="max-h-[42vh] overflow-y-auto">
          {items.map((it) => (
            <div key={it.id} className="group px-5 py-3 flex items-center gap-3 border-b border-border/60 last:border-0">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium truncate">{it.name}</span>
                  {!it.certain && <span className="text-[10px] font-medium px-1.5 py-px rounded" style={{ color: 'hsl(var(--warning))', background: 'hsl(var(--warning) / 0.12)' }}>tebakan</span>}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{it.due} · {it.src}{it.note ? ' · ' + it.note : ''}</div>
              </div>
              <div className="font-data text-[13px] font-semibold tabular-nums">{K.rp(it.amount)}</div>
              <button onClick={() => onDemote(it.id)}
                className="text-[11px] font-medium px-2 py-1 rounded-md border border-border text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground hover:border-foreground/25 transition-all whitespace-nowrap">
                Bukan Wajib
              </button>
            </div>
          ))}
        </div>
        <div className="px-5 py-3 bg-secondary/60 flex items-center gap-2">
          <Icon name="Info" size={13} className="text-muted-foreground flex-shrink-0" />
          <span className="text-[11px] text-muted-foreground leading-snug">Memindahkan komitmen ke Bebas juga memperbaiki kategorisasi transaksi berikutnya.</span>
        </div>
      </div>
    </div>
  );
}

/* The three-row strip. Wajib = streak, Simpanan = the only goal bar, Bebas = depleting bar. */
function KtStrip({ wajib, simpanan, bebasBudget, bebasSpent, streak, mode, onOpenWajib, items }) {
  const bebasLeft = bebasBudget - bebasSpent;
  const over = bebasLeft < 0;
  const savedPct = Math.round((K.simpanan.now / K.simpanan.target) * 100);
  const paid = items.filter((i) => i.paid).length;
  return (
    <div className="flex flex-col">
      <button onClick={onOpenWajib} className="text-left px-5 py-3.5 flex items-center gap-3 border-t border-border hover:bg-foreground/[0.025] transition-colors">
        <KtGlyph kind="wajib" />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium">Wajib</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {mode === 'receipt'
              ? <span className="inline-flex items-center gap-1" style={{ color: KT_TONE.simpanan }}><Icon name="Check" size={11} strokeWidth={3} />lunas semua — {streak} bulan berturut-turut</span>
              : <>{paid} dari {items.length} tagihan sudah keluar · sisa jatuh tempo 10–20 Agu</>}
          </div>
        </div>
        <div className="text-right">
          <div className="font-data text-[13px] font-semibold tabular-nums">{K.rpShort(wajib)}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center justify-end gap-0.5">rincian <Icon name="ChevronRight" size={10} /></div>
        </div>
      </button>

      <div className="px-5 py-3.5 flex items-center gap-3 border-t border-border">
        <KtGlyph kind="simpanan" />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium">Simpanan</div>
          <div className="mt-2 flex items-center gap-2.5">
            <div className="flex-1"><KtBar pct={savedPct} tone={KT_TONE.simpanan} /></div>
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">{K.rpShort(K.simpanan.now)} dari {K.rpShort(K.simpanan.target)}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="font-data text-[13px] font-semibold tabular-nums" style={{ color: KT_TONE.simpanan }}>{K.rpShort(simpanan)}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">per bulan</div>
        </div>
      </div>

      <div className="px-5 py-3.5 flex items-center gap-3 border-t border-border">
        <KtGlyph kind="bebas" />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium">Bebas</div>
          <div className="mt-2 flex items-center gap-2.5">
            <div className="flex-1"><KtBar pct={over ? 100 : (bebasSpent / bebasBudget) * 100} tone={over ? KT_TONE.over : KT_TONE.bebas} /></div>
            <span className="text-[11px] whitespace-nowrap" style={{ color: over ? KT_TONE.over : undefined }}>
              {over ? 'terpakai penuh' : K.rpShort(bebasLeft) + ' sisa'}
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="font-data text-[13px] font-semibold tabular-nums">{K.rpShort(bebasBudget)}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">jatah bulan ini</div>
        </div>
      </div>
    </div>
  );
}

function KtHero({ label, value, caption, tone, small }) {
  return (
    <div className="px-5 pt-5 pb-4">
      <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.11em]">{label}</div>
      <div className="font-data font-semibold tracking-[-0.03em] tabular-nums mt-1.5" style={{ fontSize: small ? 30 : 42, lineHeight: 1.05, color: tone }}>{value}</div>
      {caption && <div className="text-[12px] text-muted-foreground mt-2 leading-snug max-w-[42ch]" style={{ textWrap: 'pretty' }}>{caption}</div>}
    </div>
  );
}

function KtCaveat({ onOpen }) {
  return (
    <div className="px-5 py-2.5 border-t border-border flex items-start gap-2" style={{ background: 'hsl(var(--foreground) / 0.02)' }}>
      <Icon name="Sparkles" size={12} className="text-muted-foreground mt-px flex-shrink-0" />
      <span className="text-[11px] text-muted-foreground leading-snug">
        Diperkirakan dari kategori transaksimu — <button onClick={onOpen} className="font-medium text-foreground underline decoration-foreground/25 hover:decoration-foreground underline-offset-2">periksa kalau ada yang meleset</button>.
      </span>
    </div>
  );
}

function KtSimpananSlider({ value, onChange, bebas, floor, tight }) {
  return (
    <div className="px-5 py-4 border-t border-border">
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] font-medium">Simpanan bulan depan</span>
        <span className="font-data text-[15px] font-semibold tabular-nums" style={{ color: KT_TONE.simpanan }}>{K.rp(value)}</span>
      </div>
      <input type="range" min={0} max={2400000} step={50000} value={value} onChange={(e) => onChange(+e.target.value)}
        className="w-full mt-3 kt-range" style={{ accentColor: 'hsl(var(--success))' }} />
      <div className="mt-2 flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">Bebas jadi <span className="font-data font-semibold tabular-nums text-foreground">{K.rp(bebas)}</span></span>
        <span className="text-muted-foreground">median kamu {K.rpShort(K.median.bebas)}</span>
      </div>
      {tight && (
        <div className="mt-2.5 flex items-start gap-2 px-2.5 py-2 rounded-md" style={{ background: 'hsl(var(--warning) / 0.1)' }}>
          <Icon name="TriangleAlert" size={12} className="mt-px flex-shrink-0" style={{ color: 'hsl(var(--warning))' }} />
          <span className="text-[11px] leading-snug" style={{ color: 'hsl(var(--warning))' }}>
            Biasanya kamu pakai {K.rp(K.median.bebas)} sebulan. Yakin cukup dengan {K.rp(bebas)}?
          </span>
        </div>
      )}
    </div>
  );
}

/* ── The card ─────────────────────────────────────────────────────────────── */
function KantongCard({ state, simpananPlan, setSimpananPlan, lumpy, showCaveat, sheetOpen, setSheetOpen }) {
  const [demoted, setDemoted] = React.useState([]);
  const items = K.wajibItems.filter((i) => !demoted.includes(i.id));
  const wajib = items.reduce((s, i) => s + i.amount, 0);
  const bebasBudget = K.median.income - wajib - simpananPlan;
  const tight = bebasBudget < K.softFloor;
  const f = K.states[state];
  const openSheet = () => setSheetOpen(true);

  const chip = { watch: 'Mode belajar', daily: 'Hari ke-17', forecast: 'Hari ke-26', depleted: 'Hari ke-24', receipt: 'Tutup bulan Juli' }[state];

  let body = null;
  if (state === 'watch') {
    body = (
      <>
        <KtHero label="Kantong" small value="Masih dipelajari" caption="Kami sudah lihat 1 dari 3 bulan transaksimu. Angka harian muncul setelah pola belanjamu cukup jelas — sekitar 8 Oktober." />
        <div className="px-5 pb-4">
          <div className="flex gap-1.5">{[1, 0, 0].map((on, i) => <div key={i} className="h-1.5 flex-1 rounded-full" style={{ background: on ? 'hsl(var(--foreground) / 0.55)' : 'hsl(var(--foreground) / 0.09)' }} />)}</div>
          <div className="mt-2 text-[11px] text-muted-foreground">Agustus terekam · September & Oktober berjalan</div>
        </div>
        <div className="px-5 py-3.5 border-t border-border flex items-center gap-3">
          <KtGlyph kind="wajib" />
          <div className="flex-1 text-[12px] text-muted-foreground leading-snug">Yang sudah bisa kami pastikan: <span className="text-foreground font-medium">4 tagihan tetap</span> senilai {K.rpShort(3485000)}.</div>
          <button onClick={openSheet} className="text-[11px] font-medium px-2.5 py-1.5 rounded-md border border-border hover:border-foreground/25 transition-colors whitespace-nowrap">Lihat</button>
        </div>
      </>
    );
  } else if (state === 'daily' && lumpy) {
    body = (
      <>
        <KtHero label="Wajib tertutup sampai" value={K.runway.coversUntil} caption={`Saldo lancar ${K.rp(K.runway.liquid)} di 4 rekening menutup ${K.rp(wajib)} tagihan bulanan selama ${K.runway.days} hari. Penghasilanmu naik-turun 34% antar bulan, jadi kami pakai daya tahan, bukan jatah harian.`} />
        <div className="px-5 pb-4 flex items-center gap-2">
          <Icon name="Waves" size={13} className="text-muted-foreground" />
          <span className="text-[11px] text-muted-foreground">Penghasilan tidak tetap terdeteksi · jatah harian dimatikan</span>
        </div>
        <KtStrip wajib={wajib} simpanan={simpananPlan} bebasBudget={bebasBudget} bebasSpent={f.spent} streak={0} mode="daily" onOpenWajib={openSheet} items={items} />
      </>
    );
  } else if (state === 'daily') {
    const left = bebasBudget - f.spent, days = K.daysInMonth - f.day;
    body = (
      <>
        <KtHero label="Sisa harian" value={K.rp(Math.floor(left / days / 1000) * 1000)} caption={`Setelah Wajib & Simpanan. ${K.rp(left)} tersisa untuk ${days} hari.`} />
        <KtStrip wajib={wajib} simpanan={simpananPlan} bebasBudget={bebasBudget} bebasSpent={f.spent} streak={3} mode="daily" onOpenWajib={openSheet} items={items} />
      </>
    );
  } else if (state === 'forecast') {
    const left = bebasBudget - f.spent, days = K.daysInMonth - f.day;
    const projected = f.pace7 * days, over = projected - left;
    body = (
      <>
        <div className="px-5 pt-5 pb-4">
          <div className="text-[11px] font-medium uppercase tracking-[0.11em]" style={{ color: KT_TONE.over }}>Prakiraan · {days} hari lagi</div>
          <div className="font-data font-semibold tracking-[-0.03em] tabular-nums mt-1.5" style={{ fontSize: 34, lineHeight: 1.05 }}>
            Bebas akan lewat <span style={{ color: KT_TONE.over }}>±{K.rpShort(over)}</span>
          </div>
          <div className="text-[12px] text-muted-foreground mt-2 leading-snug max-w-[46ch]" style={{ textWrap: 'pretty' }}>
            Ritme 7 hari terakhir {K.rp(f.pace7)}/hari. Sisa jatah {K.rp(left)} — cukup untuk {Math.floor(left / f.pace7)} hari dengan ritme itu.
          </div>
          <div className="mt-3.5 flex items-center gap-2 px-3 py-2.5 rounded-lg" style={{ background: 'hsl(var(--warning) / 0.09)' }}>
            <Icon name="ArrowDownRight" size={14} style={{ color: KT_TONE.over }} className="flex-shrink-0" />
            <span className="text-[12px] leading-snug" style={{ color: 'hsl(var(--foreground))' }}>
              Turun ke <span className="font-data font-semibold tabular-nums">{K.rp(Math.floor(left / days / 1000) * 1000)}/hari</span> dan bulan ini masih pas.
            </span>
          </div>
        </div>
        <KtStrip wajib={wajib} simpanan={simpananPlan} bebasBudget={bebasBudget} bebasSpent={f.spent} streak={3} mode="forecast" onOpenWajib={openSheet} items={items} />
      </>
    );
  } else if (state === 'depleted') {
    const days = K.daysInMonth - f.day;
    body = (
      <>
        <div className="px-5 pt-5 pb-4">
          <div className="text-[11px] font-medium uppercase tracking-[0.11em]" style={{ color: KT_TONE.over }}>Bebas · terpakai penuh</div>
          <div className="font-semibold tracking-[-0.02em] mt-1.5" style={{ fontSize: 26, lineHeight: 1.18, maxWidth: '30ch' }}>
            Jatah Bebas bulan ini sudah terpakai — sisa {days} hari.
          </div>
          <div className="text-[12px] text-muted-foreground mt-2.5 leading-snug max-w-[46ch]" style={{ textWrap: 'pretty' }}>
            Wajib dan Simpanan tetap aman: keduanya sudah disisihkan di awal bulan. Yang lewat cuma belanja harian.
          </div>
          <div className="mt-3.5 grid grid-cols-2 gap-2">
            <div className="px-3 py-2.5 rounded-lg" style={{ background: 'hsl(var(--success) / 0.08)' }}>
              <div className="text-[10px] uppercase tracking-wider" style={{ color: KT_TONE.simpanan }}>Wajib</div>
              <div className="text-[12px] font-medium mt-1 flex items-center gap-1"><Icon name="Check" size={12} strokeWidth={3} style={{ color: KT_TONE.simpanan }} />Semua tertutup</div>
            </div>
            <div className="px-3 py-2.5 rounded-lg" style={{ background: 'hsl(var(--success) / 0.08)' }}>
              <div className="text-[10px] uppercase tracking-wider" style={{ color: KT_TONE.simpanan }}>Simpanan</div>
              <div className="text-[12px] font-medium mt-1">{K.rp(simpananPlan)} utuh</div>
            </div>
          </div>
          <div className="mt-3 text-[12px] text-muted-foreground leading-snug">
            Penyebab terbesar: <span className="text-foreground font-medium">{f.biggest.name}</span> {K.rpShort(f.biggest.amount)} — biasanya {K.rpShort(f.biggest.usual)}.
          </div>
        </div>
        <KtStrip wajib={wajib} simpanan={simpananPlan} bebasBudget={bebasBudget} bebasSpent={f.spent} streak={3} mode="depleted" onOpenWajib={openSheet} items={items} />
      </>
    );
  } else {
    const pct = Math.round((f.simpananActual / f.simpananPlanned) * 100);
    body = (
      <>
        <div className="px-5 pt-5 pb-4">
          <div className="text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">Juli · tutup bulan</div>
          <div className="flex items-start gap-2.5 mt-2">
            <div className="grid place-items-center rounded-full flex-shrink-0 mt-0.5" style={{ width: 22, height: 22, background: 'hsl(var(--success) / 0.14)', color: KT_TONE.simpanan }}>
              <Icon name="Check" size={13} strokeWidth={3} />
            </div>
            <div className="font-semibold tracking-[-0.02em]" style={{ fontSize: 24, lineHeight: 1.2, maxWidth: '28ch' }}>
              Wajib lunas semua. Tiga bulan berturut-turut.
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-border">
          <div className="flex items-center gap-3">
            <KtGlyph kind="simpanan" />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-medium">Simpanan</span>
                <span className="font-data text-[12px] tabular-nums text-muted-foreground">{K.rp(f.simpananActual)} dari {K.rp(f.simpananPlanned)}</span>
              </div>
              <div className="mt-2"><KtBar pct={pct} tone={KT_TONE.simpanan} height={7} /></div>
            </div>
          </div>
          <div className="mt-3 ml-[38px] rounded-lg border border-border overflow-hidden">
            <div className="px-3 py-2 text-[11px] font-medium border-b border-border" style={{ background: 'hsl(var(--foreground) / 0.02)' }}>Yang kami temukan lintas rekening</div>
            {f.transfers.map((t, i) => (
              <div key={i} className="px-3 py-2 flex items-center gap-2 text-[11px] border-b border-border/60 last:border-0">
                <span className="text-muted-foreground">{t.date}</span>
                <span className="flex-1 truncate">{t.from} <span className="text-muted-foreground">→</span> {t.to}</span>
                <span className="font-data font-semibold tabular-nums">{K.rp(t.amount)}</span>
              </div>
            ))}
            <div className="px-3 py-2 text-[11px] flex items-center gap-1.5" style={{ background: 'hsl(var(--foreground) / 0.02)' }}>
              <Icon name="Minus" size={11} className="text-muted-foreground" />
              <span className="text-muted-foreground">Rencana {K.rp(f.simpananPlanned)} tanggal 25 · yang masuk {K.rp(f.simpananActual)}</span>
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-border flex items-start gap-3">
          <KtGlyph kind="bebas" />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[13px] font-medium">Bebas</span>
              <span className="font-data text-[12px] font-semibold tabular-nums" style={{ color: KT_TONE.over }}>lewat {K.rp(f.bebasOver)}</span>
            </div>
            <div className="text-[11px] text-muted-foreground mt-1.5 leading-snug">
              Hampir seluruhnya dari <span className="text-foreground font-medium">{f.biggest.name}</span> {K.rp(f.biggest.amount)} — biasanya {K.rp(f.biggest.usual)}.
            </div>
          </div>
        </div>

        <KtSimpananSlider value={simpananPlan} onChange={setSimpananPlan} bebas={bebasBudget} floor={K.softFloor} tight={tight} />
        <div className="px-5 pb-5 pt-1 flex gap-2">
          <button className="flex-1 text-[12px] font-semibold py-2.5 rounded-lg text-primary-foreground hover:opacity-90 transition-opacity" style={{ background: 'hsl(var(--primary))' }}>Pakai untuk Agustus</button>
          <button className="text-[12px] font-medium py-2.5 px-4 rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors">Nanti</button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="pf-card overflow-hidden" style={{ boxShadow: '0 1px 2px rgb(0 0 0/0.04), 0 12px 32px -18px rgb(0 0 0/0.16)' }}>
        <div className="px-5 pt-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold tracking-tight">Kantong</span>
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded text-muted-foreground" style={{ background: 'hsl(var(--foreground) / 0.05)' }}>{chip}</span>
          </div>
          <button className="p-1 -mr-1 rounded hover:bg-foreground/5 text-muted-foreground transition-colors"><Icon name="Ellipsis" size={15} /></button>
        </div>
        {body}
        {showCaveat && state !== 'receipt' && <KtCaveat onOpen={openSheet} />}
      </div>
      <KtWajibSheet open={sheetOpen} onClose={() => setSheetOpen(false)} items={items} onDemote={(id) => setDemoted((d) => [...d, id])} />
    </>
  );
}

Object.assign(window, { KantongCard, KtWajibSheet, KtStrip, KtGlyph, KtBar, KT_TONE });
