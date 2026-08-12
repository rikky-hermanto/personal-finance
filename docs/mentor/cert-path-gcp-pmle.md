# Learning Path — Google Cloud Professional Machine Learning Engineer (PMLE)

> Sertifikasi tier **S+** — paling dihormati praktisi ML secara teknis, premium gaji tertinggi (~25%).
> Ini stretch goal jangka panjang: mulai SETELAH PF-AI series selesai, karena cakupannya jauh lebih luas
> dari LLM application engineering (ML pipeline, feature engineering, MLOps di GCP).
>
> Disusun: 2026-08-12 · Verifikasi ulang exam guide resmi sebelum daftar: https://cloud.google.com/learn/certification/machine-learning-engineer

## Fakta Ujian

| Item | Detail |
|------|--------|
| Biaya | $200 USD |
| Durasi | 2 jam |
| Jumlah soal | 50–60 (multiple choice + multiple select, banyak soal skenario) |
| Format | Online proctored atau test center (Kryterion/Webassessor) |
| Prasyarat resmi | Tidak ada — rekomendasi 3+ tahun industri, 1+ tahun GCP |
| Masa berlaku | 2 tahun |
| Bahasa | Inggris (dan Jepang) |

## Domain Ujian (6 domain)

Bobot per exam guide terakhir — cek ulang di halaman resmi karena Google merevisi berkala:

| # | Domain | Bobot ± | Intinya |
|---|--------|---------|---------|
| 1 | Architecting low-code AI solutions | ~13% | BigQuery ML, AutoML, pre-trained APIs (Vision, NL, Speech), Model Garden |
| 2 | Collaborating within and across teams to manage data and models | ~14% | Data exploration, feature engineering, Feature Store, privacy/PII |
| 3 | Scaling prototypes into ML models | ~18% | Framework choice, training di Vertex AI, distributed training, hyperparameter tuning |
| 4 | Serving and scaling models | ~20% | Vertex AI Prediction (online/batch), scaling, latency optimization, GPU/TPU serving |
| 5 | Automating and orchestrating ML pipelines | ~22% | Vertex AI Pipelines (Kubeflow/TFX), CI/CD untuk model, retraining triggers |
| 6 | Monitoring AI solutions | ~13% | Model monitoring, drift/skew detection, logging, troubleshooting |

**Pola penting:** Domain 4+5+6 = ~55% ujian adalah **MLOps**, bukan modeling. Ini ujian tentang
mengoperasikan ML di production, bukan tentang matematika ML.

## Posisi Kamu Saat Ini (gap analysis)

**Sudah kuat dari project Personal Finance:**
- ✅ Observability & monitoring mindset (PF-AI001 Langfuse, LGTM stack) → Domain 6
- ✅ Evaluation harness & metrics (PF-AI002 eval F1) → konsep evaluasi model
- ✅ Embeddings, vector search, RAG (PF-AI003/004/006) → GenAI portion
- ✅ Production API design, Docker, CI/CD → fondasi MLOps
- ✅ LLM provider abstraction, structured output → Vertex AI GenAI section terasa familiar

**Gap yang harus ditutup (ini kerja utamanya):**
- ❌ Ekosistem GCP itu sendiri — Vertex AI end-to-end, BigQuery/BigQuery ML, Dataflow, Cloud Storage patterns
- ❌ ML klasik: feature engineering, class imbalance, regularization, evaluasi model non-LLM (AUC, precision/recall trade-off)
- ❌ TensorFlow/TFX dan distributed training
- ❌ Kubeflow Pipelines / Vertex AI Pipelines
- ❌ ML system design ala Google (soal skenario "perusahaan X mau Y, arsitektur mana?")

## Rencana Belajar — 10 Minggu (±8 jam/minggu)

### Fase 1 — Fondasi GCP + ML Klasik (Minggu 1–3)
- [ ] Buat akun GCP free tier + aktifkan Vertex AI ($300 credit cukup untuk semua lab)
- [ ] Google Cloud Skills Boost: learning path resmi "Machine Learning Engineer" (kerjakan lab-nya, jangan cuma nonton)
- [ ] Refresh ML klasik: bias/variance, regularization, feature crosses, class imbalance, metric selection — Google Machine Learning Crash Course gratis dan persis kalibrasi ujiannya
- [ ] BigQuery ML hands-on: train model logistic regression + forecasting langsung dari SQL
- [ ] Kenali kapan pakai apa: AutoML vs custom training vs BigQuery ML vs pre-trained API (ini muncul TERUS di ujian)

### Fase 2 — Vertex AI Deep Dive (Minggu 4–6)
- [ ] Custom training job di Vertex AI: container, hyperparameter tuning, distributed strategy
- [ ] Vertex AI Feature Store, Model Registry, Experiments
- [ ] Serving: online prediction vs batch prediction, autoscaling, private endpoints
- [ ] Vertex AI Pipelines: bangun 1 pipeline KFP end-to-end (ingest → train → evaluate → deploy)
- [ ] GenAI di Vertex: Model Garden, Gemini API, grounding, tuning — bagian ini kamu sudah 80% paham dari kerjaan sehari-hari

### Fase 3 — MLOps + Monitoring (Minggu 7–8)
- [ ] Model monitoring: training-serving skew vs prediction drift (bedakan keduanya — soal favorit)
- [ ] CI/CD untuk ML: kapan retrain, trigger otomatis, canary deployment untuk model
- [ ] Responsible AI: explainability (Vertex Explainable AI), fairness, PII handling (DLP API)
- [ ] Cost optimization: preemptible/spot untuk training, komparasi GPU vs TPU

### Fase 4 — Exam Prep (Minggu 9–10)
- [ ] Baca exam guide resmi baris per baris, tandai yang belum bisa dijelaskan dalam 2 kalimat
- [ ] Official sample questions dari Google (gratis)
- [ ] 2–3 practice exam penuh (timed) — target stabil >80% sebelum daftar
- [ ] Review pola soal skenario: jawaban yang benar biasanya yang paling *managed* dan paling *simple* (Google bias ke solusi serverless/managed)

## Resource Utama

1. **Official Exam Guide** — cloud.google.com/learn/certification/machine-learning-engineer (sumber kebenaran satu-satunya untuk cakupan)
2. **Google Cloud Skills Boost** — learning path resmi + lab hands-on
3. **Machine Learning Crash Course** (Google, gratis) — kalibrasi ML klasik
4. **Official sample questions** — dari halaman sertifikasi
5. Buku pendamping opsional: *Official Google Cloud Certified Professional Machine Learning Engineer Study Guide* (Wiley)

## Tips Spesifik Ujian Ini

- Soal berbentuk skenario: "Startup retail punya data di BigQuery, tim kecil, butuh forecast cepat" → jawabannya hampir selalu opsi paling managed (BigQuery ML / AutoML), bukan custom TF di GKE.
- Hafalkan decision tree: **pre-trained API → AutoML → BigQuery ML → custom training** (urutan eskalasi kompleksitas).
- Skew ≠ drift: skew = beda distribusi training vs serving; drift = distribusi serving berubah seiring waktu.
- Kalau ada dua jawaban benar, pilih yang lebih murah/lebih sedikit ops overhead.
