/* ── Shell: state switcher + rationale rail + tweaks ──────────────────────── */
const K = window.KT;
const kcn = (...a) => a.filter(Boolean).join(' ');

const KT_STATES = [
  { id: 'watch', label: 'Belajar' },
  { id: 'daily', label: 'Harian' },
  { id: 'forecast', label: 'Prakiraan' },
  { id: 'depleted', label: 'Bebas habis' },
  { id: 'receipt', label: 'Tutup bulan' },
];

const KT_WHY = {
  watch: {
    title: 'Belum dievaluasi tampil sebagai belum dievaluasi',
    body: 'Di bawah 3 bulan data, tidak ada angka harian — hanya yang benar-benar pasti (tagihan tetap) dan tanggal kapan angka itu datang. Jago butuh kuis kepribadian karena tidak punya riwayat; kita punya, jadi kita menunggu, bukan menebak.',
  },
  daily: {
    title: 'Satu angka, satu layar',
    body: 'Hero-nya jatah harian, bukan izin belanja — label “setelah Wajib & Simpanan” adalah pengukuran, bukan restu. Wajib bisa diketuk karena angkanya hasil tebakan kategorisasi; caveat tanpa jalan memeriksa cuma bikin cemas.',
  },
  forecast: {
    title: 'Peringatan datang saat masih bisa diapa-apakan',
    body: 'Ini state yang tidak ada di rancangan awal. Rekonsiliasi akhir bulan adalah postmortem — tidak ada yang bisa diperbaiki. Hari ke-26 masih punya 5 hari, jadi prakiraan digandeng satu langkah konkret. Amber, bukan merah: merah disimpan untuk Wajib terancam.',
  },
  depleted: {
    title: 'Angka negatif tidak pernah jadi hero',
    body: '“−Rp 43.000” besar dan merah = layar rasa bersalah tepat saat desain paling dibutuhkan. Yang ditampilkan: fakta netral, lalu dua hal yang tetap aman (Wajib, Simpanan), baru penyebab terbesarnya — satu, bukan lima.',
  },
  receipt: {
    title: 'Rekonsiliasi lintas rekening — yang tidak bisa Jago lakukan',
    body: 'Jago mengeksekusi alokasi tapi hanya melihat Jago. Kita tidak mengeksekusi apa pun, tapi menyerap BCA, Superbank, Jago, Wise — jadi bisa bilang “rencana Rp 1jt, yang masuk Rp 600rb” dan menunjukkan transfer mana. Dibuka dengan kemenangan; kekurangan selalu segaris dengan penyebabnya. Slider bulan depan pre-filled: fresh-start effect, satu ketuk.',
  },
};

function KantongApp() {
  const [tw, setTweak] = useTweaks({
    state: 'daily', lumpy: false, dark: false, caveat: true, rail: true, zen: true, simpanan: 1000000,
  });
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const state = tw.state;

  React.useEffect(() => {
    document.documentElement.classList.toggle('dark', tw.dark);
  }, [tw.dark]);
  React.useEffect(() => {
    if (window.lucide) return;
  }, []);

  const why = KT_WHY[state];

  return (
    <div className={kcn('min-h-screen w-full', tw.zen && 'zen-canvas')} style={{ background: 'hsl(var(--background))' }}>
      <div className="mx-auto max-w-[1080px] px-8 py-10">
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div>
            <h1 className="text-[19px] font-semibold tracking-tight">Kantong</h1>
            <p className="text-[12px] text-muted-foreground mt-1 max-w-[58ch]" style={{ textWrap: 'pretty' }}>
              Satu kartu, lima keadaan. Bukan tiga layar terpisah — kartunya berganti keadaan seiring bulan berjalan.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex p-0.5 rounded-lg border border-border" style={{ background: 'hsl(var(--card))' }}>
            {KT_STATES.map((s) => (
              <button key={s.id} onClick={() => setTweak('state', s.id)}
                className={kcn('text-[11.5px] font-medium px-3 py-1.5 rounded-md transition-colors whitespace-nowrap',
                  state === s.id ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
                style={state === s.id ? { background: 'hsl(var(--primary))' } : undefined}>
                {s.label}
              </button>
            ))}
            </div>
            <button onClick={() => setTweak({ lumpy: !tw.lumpy, state: 'daily' })} title="Hero berganti jadi daya tahan, bukan jatah harian"
              className={kcn('flex items-center gap-1.5 text-[11.5px] font-medium px-3 py-2 rounded-lg border transition-colors whitespace-nowrap',
                tw.lumpy ? 'border-foreground/25 text-foreground' : 'border-border text-muted-foreground hover:text-foreground')}
              style={{ background: tw.lumpy ? 'hsl(var(--foreground) / 0.06)' : 'hsl(var(--card))' }}>
              <Icon name="Waves" size={13} />Penghasilan tidak tetap
            </button>
          </div>
        </div>

        <div className="mt-8 flex gap-8 items-start flex-wrap">
          <div className="w-[452px] flex-shrink-0">
            <KantongCard state={state} simpananPlan={tw.simpanan} setSimpananPlan={(v) => setTweak('simpanan', v)}
              lumpy={tw.lumpy} showCaveat={tw.caveat} sheetOpen={sheetOpen} setSheetOpen={setSheetOpen} />
            <div className="mt-3 flex items-center gap-2 px-1">
              <Icon name="Layers" size={12} className="text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground">Kartu ini tinggal di dashboard — bukan tab tersendiri, bukan onboarding sekali pakai.</span>
            </div>
          </div>

          {tw.rail && (
            <div className="flex-1 min-w-[280px] max-w-[400px] pt-1">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">Kenapa begini</div>
              <div className="mt-3 text-[13.5px] font-semibold tracking-tight leading-snug" style={{ textWrap: 'pretty' }}>{why.title}</div>
              <p className="mt-2 text-[12.5px] text-muted-foreground leading-relaxed" style={{ textWrap: 'pretty' }}>{why.body}</p>

              <div className="mt-6 pt-5 border-t border-border">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">Diturunkan dari</div>
                <div className="mt-3 space-y-2">
                  {[['Wajib', K.median.wajib, 'wajib'], ['Bebas', K.median.bebas, 'bebas'], ['Sisa → Simpanan', K.median.sisa, 'simpanan']].map(([l, v, k]) => (
                    <div key={l} className="flex items-center gap-2.5">
                      <KtGlyph kind={k} size={20} />
                      <span className="text-[12px] flex-1">{l}</span>
                      <span className="font-data text-[12px] font-semibold tabular-nums">{K.rp(v)}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[11px] text-muted-foreground leading-relaxed">
                  Median {K.months.join(' · ')} — bukan rata-rata, supaya satu bulan Lebaran tidak menentukan anggaran setahun. Tanpa patokan 50/30/20.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <TweaksPanel title="Kantong">
        <TweakSection label="Keadaan">
          <TweakSelect label="State" value={tw.state} options={KT_STATES.map((s) => ({ value: s.id, label: s.label }))} onChange={(v) => setTweak('state', v)} />
          <TweakToggle label="Penghasilan tidak tetap" value={tw.lumpy} onChange={(v) => setTweak('lumpy', v)} />
        </TweakSection>
        <TweakSection label="Anggaran">
          <TweakSlider label="Simpanan / bulan" value={tw.simpanan} min={0} max={2400000} step={50000} onChange={(v) => setTweak('simpanan', v)} />
          <TweakButton label="Buka rincian Wajib" onClick={() => setSheetOpen(true)} />
        </TweakSection>
        <TweakSection label="Tampilan">
          <TweakToggle label="Caveat derivasi" value={tw.caveat} onChange={(v) => setTweak('caveat', v)} />
          <TweakToggle label="Catatan “kenapa begini”" value={tw.rail} onChange={(v) => setTweak('rail', v)} />
          <TweakToggle label="Grid zen" value={tw.zen} onChange={(v) => setTweak('zen', v)} />
          <TweakToggle label="Mode gelap" value={tw.dark} onChange={(v) => setTweak('dark', v)} />
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<KantongApp />);
