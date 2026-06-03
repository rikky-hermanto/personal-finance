# PF-AI002 — LLM Evaluation Framework: Extraction Accuracy Harness

> **Fase Belajar:** Phase 1 · Minggu 2 dari 12 · Hari ~6 dari 90
> **Status:** BELUM DIMULAI (masih rencana)
> **Dimulai:** 2026-06-01
> **Sasaran utama minggu ini:** Nutup satu celah penting — "gimana kamu *tahu* hasil extraction-mu udah bener?" Ini pertanyaan yang nyaris selalu muncul di interview AI Engineering. Habis minggu ini, jawabanmu nggak lagi "kita cek manual", tapi "kita punya eval harness isi 20 fixture yang ngukur akurasi field-level di angka 9X%, dan Gemini Y% lebih murah dari Claude buat workload yang sama."

## Tujuan

Pipeline extraction kita (`LlmParser` → `GeminiProvider` / `AnthropicProvider`) **sama sekali belum punya cara otomatis buat ngukur akurasi**. Test yang ada cuma mock-based contract test (`tests/test_parse.py`) — itu cuma mastiin *sambungan pipa*-nya nyambung, tapi nggak pernah beneran ngejalanin model asli ke statement asli buat ngecek apakah angka yang keluar udah bener. Sekarang coba bayangin: ada satu perubahan prompt yang diam-diam ngebuang 10% transaksi, atau ngebalik `DB`/`CR` di transaksi refund. Outputnya jadi kacau, kan? Dan nggak ada satu pun yang bakal sadar — apalagi pas udah jalan di production.

Tugas ini bikin **ground-truth eval harness** di `services/ai-service/evals/` yang:

1. Nyimpen 20 fixture statement yang udah dianonimkan, lengkap sama expected output yang ditulis tangan sendiri (inilah si "golden dataset").
2. Ngejalanin tiap fixture lewat **kedua** provider, pakai jalur extraction yang asli.
3. Ngukur output terhadap ground truth dari dua sisi — **row-level** (semua transaksi kebaca nggak, ada baris hantu nggak?) dan **field-level** (nilai field-nya bener nggak?), di mana field yang krusial secara finansial (`date`, `amount_idr`, `flow`) dilaporin terpisah dari field yang cuma kosmetik.
4. Ngelaporin **akurasi + latency + cost-per-doc** per provider, jadi keluar tabel benchmark Gemini-vs-Claude yang beneran bisa kamu pertanggungjawabin.

Hasil akhirnya satu perintah — `python evals/eval_extraction.py --provider gemini` — yang nyetak tabel benchmark, plus `docs/eval-results.md` isinya angka-angka yang bisa kamu sebutin pas interview enam minggu lagi.

Butuh duluan: **PF-AI001** (kita pinjem `estimate_cost_usd()` dari `app/observability.py` buat ngitung biaya, plus layer Langfuse kalau mau ngubek run satu-satu). Buka jalan ke: **Week 3 RAG** (pola harness yang sama dipake buat ngukur kualitas retrieval — MRR/NDCG — gantiin extraction accuracy).

## Acceptance Criteria

- [ ] `services/ai-service/evals/` udah ada, lengkap sama subfolder `fixtures/` (teks statement) dan `ground_truth/` (JSON yang diharapkan)
- [ ] 20 fixture siap, masing-masing punya file ground-truth pasangannya — diambil dari teks test yang udah disanitasi, terus diperluas biar nyakup BCA, NeoBank, Superbank, sama sampel hasil screenshot
- [ ] `evals/scoring.py` ngitung precision/recall/F1 level-baris **dan** akurasi level-field, di mana critical field (`date`, `amount_idr`, `flow`) diskor terpisah
- [ ] `evals/scoring.py` punya unit test sendiri (`tests/test_eval_scoring.py`) — scorer-nya harus bisa dipercaya dulu sebelum angka-angkanya kita percaya
- [ ] Kedua provider ngeluarin token usage dari panggilan terakhir (`last_usage`), biar harness bisa ngitung biaya sendiri lewat `estimate_cost_usd()`
- [ ] `evals/eval_extraction.py --provider {gemini|anthropic}` ngejalanin semua fixture, nyetak tabel per-fixture + agregat (akurasi, latency, biaya)
- [ ] `evals/eval_extraction.py --compare` ngejalanin kedua provider terus nyetak benchmark berdampingan
- [ ] Benchmark udah dijalanin sampai kelar: Gemini 2.5 Flash vs Claude Sonnet 4.6
- [ ] `docs/eval-results.md` udah ditulis, isinya tabel benchmark + angka yang siap dipake interview
- [ ] (Stretch) Promptfoo atau LLM-as-judge udah disambung buat field yang sifatnya fuzzy kayak `description`/`category`

## Pendekatan

**Rakit harness sendiri, bukan main framework duluan.** Scorer yang kamu rakit sendiri *lebih ngejual* di interview ketimbang `pip install ragas` — kamu bisa jelasin tiap metrik karena kamu sendiri yang ngerancang. Lagian, extraction accuracy (bandingin field yang terstruktur) justru kasus di mana framework eval-RAG yang generik malah nggak pas. Promptfoo/RAGAS baru muncul sebagai layer opsional di Step 11, khusus buat field yang fuzzy.

**Bagian yang beneran susah itu alignment, bukan perbandingan.** Dua daftar transaksi nggak bisa diadu berdasarkan urutan posisi — model bisa aja ngeluarin baris dengan urutan beda, nyatuin dua baris jadi satu, atau ngarang baris yang sebenarnya nggak ada. Jadi scoring itu pada dasarnya soal *matching* dulu: cocokin tiap predicted row ke ground-truth row-nya pakai natural key (`date` + `amount_idr`, kunci yang sama yang dipake pipeline dedup di .NET), baru habis itu bandingin field-nya. Baris ground-truth yang nggak ketemu pasangannya itu **miss** (ngegerus recall); baris predicted yang nggak ada di ground truth itu **phantom** (ngegerus precision). Ini persis logika three-tier dedup yang udah ada di codebase — pakai ulang aja mental model yang itu.

**Soal biaya, kita pinjem dari Week 1.** PF-AI001 sengaja ninggalin `estimate_cost_usd(model, input_tokens, output_tokens)` di `app/observability.py`. Yang kurang tinggal satu: gimana caranya token count balik ke harness — beres pakai atribut `self.last_usage` di tiap provider, cuma 2 baris dan nggak ngerusak apa-apa (pemanggil yang lama nggak kena imbasnya). Latency diukur pakai wall-clock di harness. Cara ini bikin pengukuran biayanya tetap nyambung sama yang di live dashboard.

**Manggil API beneran, dan itu memang disengaja.** Beda sama unit test yang pakai mock, eval harness ini nembak model yang asli — ya itu intinya. Ini **bukan** bagian dari `pytest` / CI (makan biaya beneran dan hasilnya nggak deterministik). Ini script benchmark yang dijalanin manual. Cuma `scoring.py` (logika murni) yang dapet unit test di CI.

Di luar cakupan: optimasi A/B prompt, regression gating di CI, metrik retrieval RAG (Week 3), narik biaya otomatis dari Langfuse API (buat v1, baca dashboard manual udah cukup). Tahan godaan buat gold-plating sampai 200 fixture — 20 udah lebih dari cukup (lihat anti-pattern #5 di learning tips).

## File yang Disentuh

| File | Perubahan |
|------|-----------|
| `services/ai-service/evals/__init__.py` | Bikin baru — biar `evals` bisa di-import |
| `services/ai-service/evals/fixtures/*.txt` | Bikin baru — 20 fixture teks statement yang udah disanitasi |
| `services/ai-service/evals/ground_truth/*.json` | Bikin baru — 20 file expected output (satu per fixture) |
| `services/ai-service/evals/scoring.py` | Bikin baru — alignment + metrik level row/field |
| `services/ai-service/evals/eval_extraction.py` | Bikin baru — benchmark runner (CLI) |
| `services/ai-service/evals/README.md` | Bikin baru — cara nambah fixture, cara ngejalaninnya |
| `services/ai-service/app/providers/gemini.py` | Tambah `self.last_usage`, diisi tiap habis panggilan (nggak ngerusak apa-apa) |
| `services/ai-service/app/providers/anthropic.py` | Tambahan `self.last_usage` yang sama |
| `services/ai-service/tests/test_eval_scoring.py` | Bikin baru — unit test buat scorer-nya sendiri |
| `docs/eval-results.md` | Bikin baru — temuan benchmark + angka buat interview |

---

## TODO

### [ ] STEP 1 — Pahamin dulu mental model eval sebelum nulis satu baris kode pun (blok fokus 90 menit)

Ini jangkar **theory-on-demand** buat minggu ini. Jangan malah maraton nonton kursus — baca dua tulisan kanonik ini aja, terus tutup tab-nya dan tulis jawabannya dari ingatan (active retrieval).

**Baca (urutannya gini):**
1. Hamel Husain — *Your AI Product Needs Evals* → https://hamel.dev/blog/posts/evals/ (tulisan kanonik; baca tuntas, ~25 menit)
2. Eugene Yan — *Task-specific LLM evals that do & don't work* → https://eugeneyan.com/writing/evals/ (baca cepat buat nangkep taksonomi metriknya: classification vs extraction vs generation)

**Tugas active retrieval (JANGAN dilewat — di sinilah belajarnya, bukan di bacaannya):** Tutup dua-duanya tab. Di `evals/README.md` (nanti kamu bikin di Step 2), tulis 5 kalimat jawaban dari ingatan:
- Apa bedanya **unit test** sama **eval**?
- Buat *extraction*, kenapa **precision/recall level-baris** masih dibutuhin selain field accuracy?
- Kenapa `date`/`amount_idr` harus dikasih bobot beda dari `description`?

> **Kenapa kali ini teori dulu?** Sesuai `ai-engineer-learning-tips.md`, aturannya *project-first, theory-on-demand* — tapi desain eval punya satu konsep yang beneran nggak ketebak (alignment / row-matching) yang, kalau dilewat, bakal bikin scorer yang diam-diam ngelaporin angka ngawur. 90 menit ini pengecualian "nabrak tembok dulu baru baca peta": sebentar lagi kamu pasti nabrak tembok alignment itu, jadi mending baca petanya sekarang. Selebihnya minggu ini: bangun dulu, baru baca.

> **Buat jawaban interview:** "Eval itu ke sistem LLM kayak unit test ke kode deterministik — bedanya, oracle-nya itu dataset, bukan assertion." Hafalin kalimat itu. Itu kalimat pembuka buat pertanyaan nomor satu di interview AI Engineering.

---

### [ ] STEP 2 — Siapin kerangka direktori `evals/`

```bash
cd services/ai-service
mkdir -p evals/fixtures evals/ground_truth
```

Bikin `evals/__init__.py` (kosong) biar harness bisa `from app...` dengan rapi pas dijalanin sebagai module.

Bikin `evals/README.md` isi jawaban active retrieval dari Step 1, plus bagian stub "How to add a fixture" (sisanya kamu isi di Step 13):

```markdown
# Extraction Eval Harness

Ngukur akurasi extraction beneran dari GeminiProvider / AnthropicProvider terhadap
golden dataset yang dilabelin manual. BUKAN bagian dari pytest/CI — ini manggil
API beneran yang berbayar.

## Mental model eval-ku (ditulis dari ingatan, 2026-06-01)
1. Unit test vs eval ... 2. Precision/recall level-baris ... (isi dari Step 1)

## Cara Ngejalaninnya
    python evals/eval_extraction.py --provider gemini
    python evals/eval_extraction.py --compare
```

> **Kenapa direktori `evals/` dipisah, bukan ikut `tests/`?** `pytest` bakal nemu dan ngejalanin semua yang ada di `tests/`. Eval harness nggak boleh ikut jalan di CI — makan biaya, kena rate limit, dan hasilnya nggak deterministik (selisih 1 baris doang harusnya nggak bikin build gagal). Misahin secara fisik bikin batasnya jelas. Cuma scorer yang *logika murni* yang dapet unit test di `tests/`.

---

### [ ] STEP 3 — Ambil bibit fixture dari teks test yang udah disanitasi

Jangan mulai dari halaman kosong. Test suite kamu sendiri udah punya string statement yang disanitasi — gali itu dulu.

1. Buka `tests/test_superbank_extractor.py`, `tests/test_parse_pdf.py`, sama `tests/test_parse.py`. Tarik teks statement yang nyempil di situ ke file fixture masing-masing.
2. Kasih nama fixture-nya `{bank}_{nn}.txt`, misal `bca_01.txt`, `neobank_01.txt`, `superbank_01.txt`.
3. Targetin sebaran coverage kayak gini buat 20 fixture-nya (jangan bikin 20 kloningan BCA — justru keberagaman yang bikin failure mode kelihatan):

| Bank | Keanehan format yang perlu dicakup | Jumlah |
|------|------------------------------------|--------|
| BCA | Tanggal DD/MM/YYYY, desimal Indonesia `1.000.000,50` | 5 |
| NeoBank | Tanggal `DD MMM YYYY`, teks dari PDF yang banyak gaya/warna | 5 |
| Superbank | Tabel multi-halaman, kolom `Debit` = duit keluar | 5 |
| Dari screenshot | Noise ala OCR, kolom yang bolong | 3 |
| Edge case | Refund (CR tapi deskripsinya mirip Expense), baris FX, amount nol, multi-currency | 2 |

> **Kenapa edge case sengaja dimasukin?** Baris refund (kredit yang keliatan kayak pengeluaran), baris FX (`exchange_rate` keisi), sama baris multi-currency justru di situlah extraction diam-diam jebol. Eval set isi 20 baris bersih semua nggak ngasih tau apa-apa. Eval set yang ada 4 baris "nakal"-nya — nah di situ baru ketahuan beda Gemini sama Claude — dan "saya sengaja nyiapin fixture yang adversarial" itu sinyal yang kuat banget di interview.

> **Cek anonimisasi (SEC-01):** File ini bakal masuk ke git. Bersihin nomor rekening asli, nama asli, saldo asli. Ganti pakai data palsu yang masuk akal. *Strukturnya* dibikin tetap nyata, tapi *datanya* harus palsu.

---

### [ ] STEP 4 — Tulis JSON ground-truth buat tiap fixture

Buat tiap `fixtures/{name}.txt`, bikin `ground_truth/{name}.json` — hasil extraction yang bener, kamu verifikasi sendiri. Samain bentuknya sama `TransactionResult` (lihat `app/models.py`):

```json
{
  "transactions": [
    {
      "date": "2024-03-14",
      "description": "TRANSFER GOPAY",
      "remarks": "REF 88123",
      "flow": "DB",
      "type": "Expense",
      "amount_idr": 500000.0,
      "currency": "IDR",
      "exchange_rate": null
    }
  ]
}
```

Aturan pelabelan (ini bakal jadi kontrak scoring kamu):
- `date` selalu ISO `YYYY-MM-DD`. `amount_idr` selalu positif, dalam IDR.
- `flow`: `DB` = duit keluar, `CR` = duit masuk. Baris refund/FX harus *bener-bener pas* — justru baris-baris itu yang jadi pembeda.
- Cuma labelin field yang bakal kamu skor. Skip yang volatil (`raw_text`, `account_name`) — lihat Step 5.

> **Kenapa dilabelin manual, dan kenapa langkah ini mahal tapi nggak ada gantinya?** Ground truth itu sendiri *adalah* eval-nya. Salah ngelabel berarti kamu bakal "ngukur" model itu salah padahal dia bener (atau sebaliknya), dan semua angka di hilirnya ikut tercemar. Fokus penuh di sini — ngelabelin 20 statement dengan teliti makan sekitar 60–90 menit, dan ini jam paling berleverage di minggu ini. Langkah ini juga yang bikin eval-nya jadi *punyamu*: "saya bikin golden dataset 20 fixture sendiri lengkap dengan ground truth yang terverifikasi" itu kalimat yang bikin kamu kelihatan kredibel.

> **Pancingan spaced repetition:** Label-label ini bakal kamu sentuh lagi di Week 3 pas fixture yang sama di-embed buat RAG. Labelin yang bener sekarang; kamu yang versi nanti bakal makasih sendiri.

---

### [ ] STEP 5 — Bangun `evals/scoring.py` — mesin metriknya

Ini inti otaknya. Bikin `services/ai-service/evals/scoring.py`:

```python
"""Score extracted transactions against ground truth.

Two axes:
  - Row level: did we extract the right SET of transactions? (precision / recall / F1)
  - Field level: for correctly-matched rows, are the fields right? (per-field accuracy)

Alignment itu intinya soal matching: predicted row dicocokin ke ground-truth row
pakai natural key (date + amount yang udah dibulatkan), kunci yang sama kayak yang
dipake dedup .NET.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation

# Field yang diskor, dipisah menurut seberapa krusial secara finansial.
CRITICAL_FIELDS = ("date", "amount_idr", "flow")
COSMETIC_FIELDS = ("description", "remarks", "type", "currency", "exchange_rate")
SCORED_FIELDS = CRITICAL_FIELDS + COSMETIC_FIELDS


def _norm_amount(v) -> Decimal:
    try:
        return Decimal(str(v)).quantize(Decimal("1"))  # toleransi sampai rupiah penuh
    except (InvalidOperation, TypeError):
        return Decimal("-1")


def _row_key(tx: dict) -> tuple[str, Decimal]:
    return (str(tx.get("date", "")).strip(), _norm_amount(tx.get("amount_idr")))


def _field_equal(field_name: str, a, b) -> bool:
    if field_name == "amount_idr":
        return _norm_amount(a) == _norm_amount(b)
    if field_name in ("description", "remarks"):
        # teks kosmetik: case-insensitive, toleransi substring, spasi dirapatin
        sa = " ".join(str(a or "").lower().split())
        sb = " ".join(str(b or "").lower().split())
        return sa == sb or sa in sb or sb in sa
    if field_name == "exchange_rate":
        if a in (None, "") and b in (None, ""):
            return True
        return _norm_amount(a) == _norm_amount(b)
    return str(a or "").strip().upper() == str(b or "").strip().upper()


@dataclass
class FixtureScore:
    name: str
    matched: int = 0
    missed: int = 0          # ada di truth, nggak di predicted -> kena recall
    phantom: int = 0         # ada di predicted, nggak di truth  -> kena precision
    field_correct: dict = field(default_factory=lambda: {f: 0 for f in SCORED_FIELDS})
    field_total: dict = field(default_factory=lambda: {f: 0 for f in SCORED_FIELDS})

    @property
    def precision(self) -> float:
        denom = self.matched + self.phantom
        return self.matched / denom if denom else 0.0

    @property
    def recall(self) -> float:
        denom = self.matched + self.missed
        return self.matched / denom if denom else 0.0

    @property
    def f1(self) -> float:
        p, r = self.precision, self.recall
        return 2 * p * r / (p + r) if (p + r) else 0.0

    def field_accuracy(self, fields=SCORED_FIELDS) -> float:
        c = sum(self.field_correct[f] for f in fields)
        t = sum(self.field_total[f] for f in fields)
        return c / t if t else 0.0


def score_fixture(name: str, predicted: list[dict], truth: list[dict]) -> FixtureScore:
    s = FixtureScore(name=name)
    truth_by_key = {_row_key(t): t for t in truth}
    used = set()

    for p in predicted:
        key = _row_key(p)
        if key in truth_by_key and key not in used:
            used.add(key)
            s.matched += 1
            t = truth_by_key[key]
            for f in SCORED_FIELDS:
                s.field_total[f] += 1
                if _field_equal(f, p.get(f), t.get(f)):
                    s.field_correct[f] += 1
        else:
            s.phantom += 1

    s.missed = len(truth) - len(used)
    return s
```

> **Kenapa nyocokin pakai `date + amount`, bukan posisi?** Model ngeluarin baris dengan urutan ngasal dan kadang misah/nyatuin baris. Perbandingan berbasis index bakal ngelaporin extraction yang sempurna sebagai 0% begitu ada satu baris yang geser posisi. Matching pakai natural key ini insight yang sama persis kayak three-tier dedup punyamu — pakai ulang aja.

> **Kenapa amount-nya ditoleransi sampai satuan rupiah?** `500000.0`, `500000`, sama `"500000.00"` itu duit yang sama. Decimal-quantize ngebuang noise cara penulisan, jadi yang kamu ukur itu kesalahan *extraction*, bukan noise *format*. (THINK-03: di schema, amount itu `number` — tapi model kadang malah ngebalikinnya sebagai string; scorer-nya harus tahan sama itu, pipeline-nya nggak boleh.)

> **Kenapa `description` ditoleransi sampai substring?** `"GOPAY"` vs `"TRANSFER GOPAY"` itu extraction yang bener, cuma beda potongan dikit — kalau dihukum salah, metriknya jadi berisik. Critical field dapet exact match; cosmetic field dapet fuzzy match. Pemisahan ini justru inti dari `CRITICAL_FIELDS` vs `COSMETIC_FIELDS`, dan nuansa beginian yang sering dikorek pewawancara.

---

### [ ] STEP 6 — Buka akses token usage di kedua provider (tanpa ngerusak apa-apa)

Biar bisa ngitung biaya sendiri lewat `estimate_cost_usd()` dari Week 1, harness butuh token count. Tambahin satu atribut aja di tiap provider, diisi tiap habis panggilan berhasil. Pemanggil yang lama nggak bakal kena.

Di `app/providers/gemini.py`, di dalam `__init__` tambahin `self.last_usage: dict | None = None`, terus pas abis ngitung `input_tokens`/`output_tokens` di `extract_structured()`:

```python
self.last_usage = {"input": input_tokens, "output": output_tokens}
```

Lakuin hal yang sama persis di `app/providers/anthropic.py` (`self.last_usage = {"input": input_tokens, "output": output_tokens}` abis baca `message.usage`).

> **Kenapa pakai instance attribute, bukan ngubah return type?** Kalau `extract_structured()` diubah jadi ngembaliin `(dict, usage)`, efeknya nyebar ke `LlmParser`, ke router-router, dan ke keempat mock test — breaking change cuma demi enaknya benchmark. Side-channel `last_usage` yang write-only ini cuma dibaca sama eval harness, yang bikin instance provider-nya sendiri dan baca atribut itu langsung tiap habis panggilan. Dua baris, nol dampak ke mana-mana. Ini persis kaitan yang udah diramal PF-AI001 pas dia nyuruh kamu jangan ngehapus `estimate_cost_usd()`.

> **Cek dulu sebelum lanjut:** abis ngedit, jalanin mock yang udah ada — `pytest tests/test_parse.py -q` — semuanya harus tetap lolos (nggak ada yang nge-assert `last_usage`, jadi pasti lolos).

---

### [ ] STEP 7 — Bangun `evals/eval_extraction.py` — benchmark runner-nya

Bikin CLI runner-nya. Dia manggil jalur extraction yang **asli** (`LlmParser` + provider beneran), ngukur waktunya, ngasih skor, terus ngitung biaya.

```python
"""Extraction benchmark harness. Bikin real LLM call — BUKAN bagian dari CI.

    python evals/eval_extraction.py --provider gemini
    python evals/eval_extraction.py --provider anthropic --model claude-sonnet-4-6
    python evals/eval_extraction.py --compare
"""
import argparse, asyncio, json, time
from pathlib import Path

from app.config import settings
from app.providers.gemini import GeminiProvider
from app.providers.anthropic import AnthropicProvider
from app.observability import estimate_cost_usd
from app.models import ParseRequest
from app.services.llm_parser import LlmParser
from evals.scoring import score_fixture, CRITICAL_FIELDS, COSMETIC_FIELDS, SCORED_FIELDS

EVALS_DIR = Path(__file__).parent
FIXTURES = EVALS_DIR / "fixtures"
TRUTH = EVALS_DIR / "ground_truth"


def _make_provider(name: str, model: str | None):
    if name == "gemini":
        return GeminiProvider(api_key=settings.gemini_api_key, model=model or "gemini-2.5-flash")
    if name == "anthropic":
        return AnthropicProvider(api_key=settings.anthropic_api_key, model=model or "claude-sonnet-4-6")
    raise ValueError(name)


def _bank_hint(fixture_name: str) -> str:
    return fixture_name.split("_")[0]  # bca_01 -> bca


async def run_provider(name: str, model: str | None) -> dict:
    provider = _make_provider(name, model)
    parser = LlmParser(provider=provider)
    scores, latencies, costs = [], [], []

    for fx in sorted(FIXTURES.glob("*.txt")):
        truth = json.loads((TRUTH / f"{fx.stem}.json").read_text(encoding="utf-8"))["transactions"]
        text = fx.read_text(encoding="utf-8")

        t0 = time.perf_counter()
        resp = await parser.parse(ParseRequest(text=text, bank_hint=_bank_hint(fx.stem)))
        latency_ms = (time.perf_counter() - t0) * 1000

        predicted = [t.model_dump() for t in resp.transactions]
        s = score_fixture(fx.stem, predicted, truth)
        scores.append(s)
        latencies.append(latency_ms)

        usage = provider.last_usage or {"input": 0, "output": 0}
        cost = estimate_cost_usd(model or provider._model, usage["input"], usage["output"])
        costs.append(cost)

        print(f"  {fx.stem:24s}  F1={s.f1:5.2f}  crit={s.field_accuracy(CRITICAL_FIELDS):5.2f}  "
              f"all={s.field_accuracy():5.2f}  {latency_ms:7.0f}ms  ${cost:.5f}")

    return _aggregate(name, model, scores, latencies, costs)


def _aggregate(name, model, scores, latencies, costs) -> dict:
    n = len(scores)
    lat_sorted = sorted(latencies)
    p95 = lat_sorted[int(0.95 * (n - 1))] if n else 0
    return {
        "provider": name,
        "model": model or "default",
        "fixtures": n,
        "row_f1": sum(s.f1 for s in scores) / n,
        "recall": sum(s.recall for s in scores) / n,
        "precision": sum(s.precision for s in scores) / n,
        "critical_field_acc": sum(s.field_accuracy(CRITICAL_FIELDS) for s in scores) / n,
        "all_field_acc": sum(s.field_accuracy() for s in scores) / n,
        "p50_latency_ms": lat_sorted[n // 2] if n else 0,
        "p95_latency_ms": p95,
        "avg_cost_usd": sum(costs) / n if n else 0,
        "total_cost_usd": sum(costs),
    }


def _print_summary(agg: dict):
    print(f"\n=== {agg['provider']} ({agg['model']}) — {agg['fixtures']} fixtures ===")
    print(f"  Row F1            : {agg['row_f1']:.3f}  (precision {agg['precision']:.3f} / recall {agg['recall']:.3f})")
    print(f"  Critical fields   : {agg['critical_field_acc']:.3f}  (date, amount_idr, flow)")
    print(f"  All fields        : {agg['all_field_acc']:.3f}")
    print(f"  Latency p50 / p95 : {agg['p50_latency_ms']:.0f}ms / {agg['p95_latency_ms']:.0f}ms")
    print(f"  Cost / doc        : ${agg['avg_cost_usd']:.5f}  (total ${agg['total_cost_usd']:.4f})")


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--provider", choices=["gemini", "anthropic"])
    ap.add_argument("--model", default=None)
    ap.add_argument("--compare", action="store_true")
    args = ap.parse_args()

    if args.compare:
        for prov, model in (("gemini", "gemini-2.5-flash"), ("anthropic", "claude-sonnet-4-6")):
            print(f"\n--- Running {prov} ---")
            _print_summary(await run_provider(prov, model))
    else:
        _print_summary(await run_provider(args.provider or settings.ai_provider, args.model))


if __name__ == "__main__":
    asyncio.run(main())
```

> **Kenapa lewat `LlmParser`, bukan langsung manggil provider?** `LlmParser.parse()` itu *jalur produksi yang asli* — dia nerapin system prompt spesifik per bank (`_build_system_prompt`), ngejalanin `EXTRACT_SCHEMA`, dan ngelakuin row-skip lewat Pydantic. Nge-benchmark jalur produksi berarti angka-angkamu nyerminin apa yang beneran diterima user, bukan jalan pintas yang dibikin-bikin. (Bonus: `skipped_rows` ngebongkar kegagalan validasi yang diam-diam.)

> **Kenapa di sini latency-nya wall-clock, tapi di PF-AI001 pakai latency Langfuse?** Latency Langfuse itu span *generation* (waktu model doang). Wall-clock di harness udah termasuk bikin prompt + parsing Pydantic — angka end-to-end yang sebenarnya. Sebutin angka Langfuse buat "model latency" dan angka ini buat "pipeline latency"; ngerti bedanya aja udah jadi sinyal bagus.

> **Sadar biaya pas ngejalanin:** 20 fixture × 2 provider = 40 panggilan beneran tiap `--compare`. Dengan ukuran ~$0.003/doc, totalnya sekitar $0.12 sekali jalan. Murah — tapi jangan di-loop di CI.

---

### [ ] STEP 8 — Unit-test scorer-nya sendiri (yang ini MASUK CI)

Angka dari harness baru bisa dipercaya kalau scorer-nya emang bener. Bikin `tests/test_eval_scoring.py`:

```python
from evals.scoring import score_fixture, CRITICAL_FIELDS

TRUTH = [
    {"date": "2024-03-14", "description": "GOPAY", "flow": "DB", "amount_idr": 500000.0, "type": "Expense"},
    {"date": "2024-03-15", "description": "SALARY", "flow": "CR", "amount_idr": 9000000.0, "type": "Income"},
]


def test_perfect_extraction_scores_one():
    s = score_fixture("t", TRUTH, TRUTH)
    assert s.f1 == 1.0
    assert s.field_accuracy(CRITICAL_FIELDS) == 1.0


def test_missed_row_drops_recall():
    s = score_fixture("t", TRUTH[:1], TRUTH)  # cuma prediksi 1 dari 2
    assert s.recall == 0.5
    assert s.precision == 1.0
    assert s.missed == 1


def test_phantom_row_drops_precision():
    extra = TRUTH + [{"date": "2024-03-16", "description": "GHOST", "flow": "DB", "amount_idr": 1.0}]
    s = score_fixture("t", extra, TRUTH)
    assert s.recall == 1.0
    assert s.precision < 1.0
    assert s.phantom == 1


def test_amount_formatting_tolerated():
    pred = [{"date": "2024-03-14", "description": "GOPAY", "flow": "DB", "amount_idr": "500000.00"}]
    s = score_fixture("t", pred, TRUTH[:1])
    assert s.matched == 1  # string "500000.00" cocok sama float 500000.0


def test_flow_flip_caught_as_critical_error():
    pred = [{"date": "2024-03-14", "description": "GOPAY", "flow": "CR", "amount_idr": 500000.0}]
    s = score_fixture("t", pred, TRUTH[:1])
    assert s.matched == 1                       # date+amount sama -> matched
    assert s.field_accuracy(("flow",)) == 0.0   # tapi flow-nya salah
```

```bash
pytest tests/test_eval_scoring.py -q
```

> **Kenapa harness-nya ikut ditest?** THINK-04: "kegagalan test itu sinyal diagnostik." Kalau scorer-mu ada off-by-one di recall, kamu bakal ngejar regresi model yang sebenarnya nggak ada selama berhari-hari. Scorer yang udah kamu unit-test itu scorer yang angkanya bisa kamu pertahanin di interview pas ada yang nanya "gimana kamu tahu *eval*-mu sendiri udah bener?" — itu meta-pertanyaan di balik pertanyaan utamanya.

---

### [ ] STEP 9 — Jalanin benchmark-nya: Gemini 2.5 Flash vs Claude Sonnet 4.6

```bash
cd services/ai-service
# pastiin .env udah punya GEMINI_API_KEY sama ANTHROPIC_API_KEY dua-duanya
python evals/eval_extraction.py --compare
```

Catat dua blok summary-nya. Kira-kira bakal kayak gini (cuma ilustrasi — angka aslimu yang masuk ke dokumen):
- Gemini lebih murah per dokumen, mungkin agak kalah di fixture edge case yang susah.
- Claude sering lebih jago di `flow` buat baris refund/FX.
- Dua-duanya harusnya tinggi di critical field buat statement yang bersih; bedanya baru kelihatan di edge case (makanya Step 3 itu penting).

> **Jurus interleaving (dari dokumen tips):** selagi 40 panggilan jalan (beberapa menit), pindah konteks — buka bacaan RAG Week 3 atau baca cepat docs pgvector. Jangan ngeliatin progress bar. Interleaving lebih ngefek daripada belajar nge-blok buat transfer ilmu.

> **Kalau nilai sebuah provider rendahnya bikin kaget:** jangan "benerin" ground truth biar cocok sama model (THINK-04). Baca dulu ketidakcocokannya yang sebenarnya — biasanya itu kelemahan prompt yang nyata (misal, `SYSTEM_PROMPT` yang generik nggak nyebutin konvensi desimal Indonesia buat bank selain Superbank). Temuan itu sendiri udah jadi deliverable Week 2: "eval saya nemuin kalau jalur BCA nggak punya instruksi konvensi desimal yang eksplisit."

---

### [ ] STEP 10 — Tulis `docs/eval-results.md`

```markdown
# Extraction Eval Results — Personal Finance Platform

**Diambil:** 2026-06-0X
**Harness:** `services/ai-service/evals/` (20 fixture berlabel manual)
**Diskor pakai:** F1 level-baris + akurasi level-field (critical field dibobot terpisah)

## Benchmark — Gemini 2.5 Flash vs Claude Sonnet 4.6

| Metrik | Gemini 2.5 Flash | Claude Sonnet 4.6 |
|--------|------------------|-------------------|
| Row F1 (precision / recall) | 0.9X (.. / ..) | 0.9X (.. / ..) |
| Akurasi critical-field (date, amount, flow) | 0.9X | 0.9X |
| Akurasi semua field | 0.9X | 0.9X |
| Latency p50 / p95 | Xms / Xms | Xms / Xms |
| Biaya / doc | $0.00X | $0.0XX |

## Di mana tiap model menang / kalah
- Gemini: <misal: lebih murah, lemah di flow refund>
- Claude: <misal: lebih bagus di baris FX, biaya ~Nx lipat>

## Failure mode yang kebongkar lewat eval
1. <temuan nyata, misal: prompt generik nggak ada konvensi desimal>
2. ...

## Angka yang siap dipake interview
1. "Eval harness extraction saya ngejalanin 20 fixture berlabel manual; Gemini nyampe **akurasi critical-field 9X%** dengan biaya **$0.00X/doc**."
2. "Gemini **Y% lebih murah** dari Claude buat workload structured-extraction ini, dengan akurasi yang **setara**."
3. "Eval-nya berhasil nangkep <failure mode> yang nggak bakal kedeteksi sama mock test."
```

> **Kenapa nulis bagian failure-mode, bukan cuma angkanya?** Siapa aja bisa ngejalanin benchmark. "Eval saya *nemuin bug beneran*" itu sinyal level senior — itu ngebuktiin harness-nya beneran kerja, bukan cuma pajangan. Bagian ini juga bahan mentah buat blog post Week 10 sama STAR story Week 11.

---

### [ ] STEP 11 — (Stretch) LLM-as-judge atau Promptfoo buat field yang fuzzy

Exact/substring match nggak bisa adil ngenilai `description` yang ditulis ulang bebas atau `category`. Buat yang kayak gitu, tambahin pass **LLM-as-judge** — model murah yang ngenilai kemiripan makna dari 0 sampai 1.

Dua jalur (pilih satu, batasi 60 menit):
- **Ringan, di dalam harness:** tambahin `evals/judge.py` — panggil `claude-haiku-4-5` (murah, sesuai aturan cost-discipline) pakai rubrik: "Apakah dua deskripsi transaksi ini ngerujuk ke merchant yang sama di dunia nyata? Jawab 0 atau 1." Terus rata-ratain di semua fuzzy field.
- **Berbasis tool:** sambungin `promptfoo` (https://www.promptfoo.dev/docs/) pakai `promptfooconfig.yaml` yang nunjuk ke fixture-mu, manfaatin assertion `llm-rubric`-nya. Cocok buat perintah regression yang bisa diulang plus laporan HTML yang kece (bahan demo).

> **Kenapa ini ditaruh di stretch, bukan inti?** Field yang krusial secara finansial (`date`, `amount_idr`, `flow`) itu tempat duitnya beneran ada, dan field-field itu udah diskor secara deterministik di Step 5 — nggak butuh judge. LLM-as-judge nambah biaya + ketidakpastian dan cuma ngebantu cosmetic field. Kirim dulu inti yang deterministik (anti-pattern #5: jangan gold-plate v1). Tapi sekadar tahu *istilah* "LLM-as-a-judge" dan bisa jelasin jebakan bias-nya (position bias, verbosity bias — lihat Zheng et al. di Referensi) aja udah jadi modal di interview.

---

### [ ] STEP 12 — Commit

```bash
cd c:\workspaces\personal-finance
git add services/ai-service/evals/
git add services/ai-service/app/providers/gemini.py
git add services/ai-service/app/providers/anthropic.py
git add services/ai-service/tests/test_eval_scoring.py
git add docs/eval-results.md
git status   # pastiin NGGAK ADA .env, NGGAK ADA fixture data asli
git commit -m "PF-AI002: add extraction eval harness — 20-fixture golden dataset, Gemini vs Claude benchmark"
```

> **Gerbang anonimisasi sebelum commit (SEC-01):** grep lagi fixture-mu buat nyari apa pun yang keliatan kayak nomor rekening atau nama asli sebelum di-commit. `git diff --cached --stat` — lihat sekilas daftar fixture-nya.

---

### [ ] STEP 13 — Catat progress dan lanjutin checklist Week 2

Isi bagian "How to add a fixture" di `evals/README.md` (taruh `.txt` di `fixtures/`, `.json` pasangannya di `ground_truth/`, kasih nama `{bank}_{nn}`), terus:

```
/mentor log Built extraction eval harness — 20-fixture golden dataset, row+field scorer (unit-tested), Gemini vs Claude benchmark. Gemini 9X% critical-field acc at $0.00X/doc, Y% cheaper than Claude. Eval surfaced <failure mode>.
```

Habis itu di `docs/mentor/progress.md`, tandain task Week 2 udah kelar:
- [x] Bikin direktori `services/ai-service/evals/` isi 20 fixture
- [x] Tulis JSON expected output (ground truth)
- [x] Bangun `eval_extraction.py` — kedua provider, akurasi level-field
- [x] Benchmark Gemini 2.5 Flash vs Claude Sonnet 4.6
- [x] Tulis temuan ke `docs/eval-results.md`
- [ ] Stretch: Promptfoo/RAGAS ← cuma kalau Step 11 dikerjain

---

## Referensi / Teori yang Perlu Dipelajari

Disusun **per konsep**, bukan per kursus — sesuai prinsip kurikulum (`docs/mentor/ai-engineer-learning-path.md`): *referensi itu nempel ke topik, bukan jadi urutan sendiri.* Baca yang nyambung sama apa yang lagi kamu bangun; sisanya skip dulu sampai kamu nabrak tembok itu.

### Konsep 1 — Kenapa eval itu ada (eval-driven development)
- **Hamel Husain — *Your AI Product Needs Evals*** → https://hamel.dev/blog/posts/evals/ — esai kanonik; framing "eval itu unit test-nya AI". **Baca di Step 1.**
- **Hamel Husain & Shreya Shankar — *A Field Guide to Rapidly Improving AI Products*** → https://hamel.dev/blog/posts/field-guide/ — gimana eval masuk ke loop iterasi yang nyata (error analysis → eval → fix).

### Konsep 2 — Taksonomi metrik (yang lagi kamu implementasiin)
- **Eugene Yan — *Task-specific LLM evals that do & don't work*** → https://eugeneyan.com/writing/evals/ — classification vs extraction vs generation; precision/recall/F1 buat extraction. **Peta langsung buat Step 5.**
- **Eugene Yan — *Patterns for Building LLM-based Systems & Products* (bagian Evals)** → https://eugeneyan.com/writing/llm-patterns/ — di mana posisi eval di antara 7 pola yang ada.
- Penyegaran IR (precision/recall/F1) — sumber klasik mana aja; kamu udah kenal ini dari search/dedup — eval cuma makainya lagi.

### Konsep 3 — Bikin golden dataset
- **Langfuse — Datasets & Scores docs** → https://langfuse.com/docs/datasets/overview dan https://langfuse.com/docs/scores/overview — gimana tool yang kamu setup di Week 1 nyimpen ground truth + scores (sekarang kamu lakuin di file dulu; Langfuse datasets itu versi yang udah dikelola, enak buat disebut pas interview).
- **Anthropic — *Create strong empirical evaluations*** → https://docs.anthropic.com/en/docs/test-and-evaluate/develop-tests — panduan dari Anthropic sendiri soal bikin test set + cara ngenilainya.

### Konsep 4 — LLM-as-a-judge (stretch Step 11)
- **Zheng et al. 2023 — *Judging LLM-as-a-Judge* (MT-Bench / Chatbot Arena)** → https://arxiv.org/abs/2306.05685 — paper fondasinya; baca bagian *limitations*-nya (position bias, verbosity bias, self-enhancement bias) — itu emasnya buat interview.
- **Eugene Yan — *LLM-as-Judge*** → https://eugeneyan.com/writing/llm-evaluators/ — jebakan-jebakan praktis dan kapan (sebaiknya nggak) makainya.

### Konsep 5 — Tooling eval (kenalin namanya, coba satu)
- **Promptfoo docs** → https://www.promptfoo.dev/docs/intro — eval berbasis assertion + matrix testing lintas provider; paling mirip sama harness-mu. **Opsional di Step 11.**
- **RAGAS docs** → https://docs.ragas.io — metrik khusus RAG (faithfulness, answer relevancy). *Belum dibutuhin minggu ini* — bookmark dulu buat eval RAG Week 3–4.
- **OpenAI Cookbook — *Getting started with evals*** → https://cookbook.openai.com/examples/evaluation/getting_started_with_openai_evals — satu lagi mental model buat eval yang terstruktur.

### Konsep 6 — Konteks benchmarking cost/accuracy
- **Chip Huyen — *AI Engineering* (Bab 3–4, Evaluation)** → https://huyenchip.com/books/ — pembahasan setebal buku soal tradeoff pemilihan model / eval; baca cepat bab evaluasinya.
- **Artificial Analysis** → https://artificialanalysis.ai/ — benchmark model yang publik (cost vs latency vs quality) — berguna buat ngecek apakah angkamu masuk akal dibanding pasaran.

### Video (pilih SATU, tonton segmennya aja, jangan maraton — anti-pattern #1)
- **DeepLearning.AI — *Evaluating and Debugging Generative AI Models* (Weights & Biases)** → https://learn.deeplearning.ai (gratis; tonton segmen eval-metrics + tracking-nya aja).
- **Hamel Husain — *Mastering LLMs / Evals* talks** (cari "Hamel Husain evals" di YouTube) — versi talk dari blog di atas; cocok buat didengerin di jalan, bukan di depan layar.

---

## Strategi Belajar (dari `docs/mentor/ai-engineer-learning-tips.md`)

Petakan langkah-langkah minggu ini ke daily loop — *learn → build → prove* dalam satu hari, bukan tiga hari.

**Daily loop diterapin ke Week 2:**
- **06:30 Pemanasan retrieval (30 menit):** buka `progress.md`, tulis dari ingatan apa yang dikirim sesi kemarin + satu konsep yang belum bisa kamu jelasin (hari ini: "apa bedanya akurasi row-level sama field-level?"). Baca ulang gap-nya doang.
- **Deep block #1 (90 menit):** bangun eval-nya — satu step sekali jalan. Step 5 (scorer) sama Step 7 (runner) itu dua deep block yang beneran; kerjain di hari yang beda.
- **Deep block #2, interleaved (90 menit):** *fase yang beda* — baca cepat RAG Week 3 / pgvector biar konteksnya udah anget pas eval kelar. Jangan numpuk dua deep block eval berturut-turut.
- **10:30 Teach-back + log (30 menit):** tulis paragraf ala Feynman — "jelasin eval harness ini kayak lagi nge-onboard karyawan baru." Paragraf itu nanti jadi bagian blog Week 10 sama STAR story Week 11. Tambahin ke `progress.md`.

**5 prinsip, konkretnya buat minggu ini:**
1. **Active retrieval** — abis baca Hamel (Step 1), tutup tab-nya dan tulis jawaban 5 kalimat di `evals/README.md`. Jangan nyontek; inget-inget sendiri.
2. **Project-first** — satu-satunya bacaan di awal cuma konsep alignment di Step 1 (satu-satunya tembok yang beneran). Selebihnya: bangun dulu, baca docs kalau mentok.
3. **Spaced repetition** — konsep ini bakal kamu sentuh lagi di Hari 3 (jalanin benchmark), Hari 7 (RAG Week 3 makai ulang fixture-nya), Hari 21 (blog post). Jangan ngotot "nyelesain belajar eval" hari ini.
4. **Interleaving** — jalanin benchmark 40-panggilan (Step 9) *sambil* baca materi RAG. Waktu nganggur = waktu transfer ilmu.
5. **Teach-back** — bagian "failure modes" di `docs/eval-results.md` itu sendiri udah jadi teach-back-nya. Kalau kamu nggak bisa jelasin kenapa model gagal di suatu fixture, berarti kamu belum bener-bener nguasain hasilnya.

**Anti-pattern yang harus kamu hindarin minggu ini:**
- ❌ Gold-plating sampai 200 fixture. 20 fixture dengan coverage edge-case yang bagus > 200 kloningan (tips: Phase-2 speed hack).
- ❌ Nonton kursus eval utuh dari awal sampai akhir. Ambil satu segmen aja yang nyambung sama metrik yang lagi kamu coding hari ini.
- ❌ Bikin eval di repo/notebook terpisah. Tempatnya di `personal-finance/services/ai-service/evals/`. Portofolio numpuk dari situ.
- ❌ "Benerin" ground truth biar model keliatan bagus (THINK-04). Nilai rendah itu *temuan*, bukan bug di eval-mu.

**Metrik Hari Minggu (tanyain lagi Minggu depan):**
> "Apa yang bisa aku omongin di interview hari ini yang Minggu lalu belum bisa?"
> Jawaban yang dituju: *"Saya bikin eval extraction 20 fixture; Gemini nyampe akurasi critical-field 9X% dengan biaya $0.00X/doc dan Y% lebih murah dari Claude — dan eval-nya berhasil nangkep bug prompt yang nyata."* Kalau kamu bisa ngomong itu lengkap sama angkanya, minggu ini berhasil.

---

## Catatan

- **Harness ini NGGAK ada di CI.** Dia manggil API beneran, berbayar, dan nggak deterministik. Cuma `tests/test_eval_scoring.py` (logika murni) yang jalan di `pytest`/CI. Jaga batasnya: `evals/` = benchmark manual, `tests/` = otomatis.
- **Sengaja makai ulang PF-AI001:** `estimate_cost_usd()` dari `app/observability.py` itu fungsi biayanya — jangan bikin ulang. Atribut `last_usage` di provider (Step 6) itu satu-satunya sambungan baru yang dibutuhin buat ngisinya.
- **`bank_hint` itu penting:** runner-nya nurunin ini dari nama file fixture (`bca_01` → `bca`) biar jalur `_build_system_prompt()` produksi nerapin prompt spesifik per bank (misal Superbank). Kasih nama fixture yang bener, atau kamu malah nge-benchmark prompt yang salah.
- **Kaitan THINK-03:** scorer-nya nolerir amount yang string-vs-number karena model kadang ngelanggar schema `number`. Toleransi itu tempatnya di *scorer*, bukan di pipeline — pipeline harus tetep masukin `amount_idr` sebagai angka beneran ke PostgreSQL.
- **Kontrak beku (THINK-05):** nama field di ground truth ngikutin kontrak `TransactionResult` / `TransactionDto`. Kalau kontrak itu berubah, fixture sama `SCORED_FIELDS` di scorer ikut berubah — di commit yang sama.
- **Minggu depan (Week 3 — RAG):** pola harness yang sama persis (golden set → run → score → tabel) balik lagi, tapi metriknya ganti jadi **MRR/NDCG buat retrieval**, bukan field accuracy. 20 fixture yang kamu labelin minggu ini bakal di-*embed* dan dipake ulang sebagai retrieval test set. Labelin yang bener.
- **Ditunda:** narik biaya otomatis lewat Langfuse query API, regression gating di CI buat skor eval, integrasi RAGAS — semua nanti aja. v1 = benchmark yang bisa dijalanin + tabel yang udah didokumentasiin.
