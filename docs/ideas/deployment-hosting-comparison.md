# Deployment hosting comparison: demo untuk interview

> **Status:** bahan diskusi, belum plan. Dibuat 2026-11-21.
> **Tujuan:** app bisa diakses di internet untuk demo saat interview, sebisa mungkin $0/bulan.
> **Menggantikan:** plan lama PF-122 (Cloudflare + Koyeb + Render, sudah dihapus). Battle plan lama di `docs/records/battle-plans/PF-105-deployment-strategy-*.md` ditulis sebelum auth (PF-S08/S09) dan internal auth AI service (PF-S15), jadi anggap sudah usang.
> **Catatan angka:** semua limit free tier dicek lewat web search pada 2026-11-21. Free tier sering berubah, jadi cek lagi di halaman pricing resmi sebelum eksekusi. Angka yang sumbernya lemah ditandai ⚠.

## TL;DR

**Rekomendasi: Vercel (frontend) + Google Cloud Run region Jakarta/Singapore (API .NET dan AI service) + Supabase Cloud Free region Singapore (database, auth, storage, realtime) + Grafana Cloud Free (observability) + Langfuse Cloud Hobby (LLM tracing).**

Biayanya $0 untuk trafik demo. Satu-satunya syarat yang mengganjal adalah Cloud Run butuh billing account (kartu kredit). Kalau tidak mau pakai kartu, jalur cadangannya adalah Render Free untuk API dan AI, dengan konsekuensi cold start sekitar satu menit dan RAM 512 MB yang kemungkinan tidak cukup untuk AI service.

Vercel cocok untuk frontend saja. Vercel tidak bisa menjalankan API .NET, dan AI service terlalu berat untuk Vercel Functions (penjelasan di bagian 2).

Langkah eksekusi Bundle A ada di [deployment-bundle-a-runbook.md](deployment-bundle-a-runbook.md).

---

## 1. Inventaris komponen

Stack yang sekarang berjalan secara lokal, dan apa yang perlu di-host di cloud:

| Komponen | Isi | Perlu di-host? | Kebutuhan khusus |
|---|---|---|---|
| **Frontend** | React 18 + Vite SPA, build jadi file statis | Ya | Env saat build: `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_AI_CHAT_ENABLED`. Perlu SPA fallback (semua route diarahkan ke `index.html`). |
| **API** | .NET 10, Docker image (`apps/api/Dockerfile`, port 7208) | Ya | Runtime .NET (container). Banyak call PostgREST per request, jadi **harus satu region dengan database**. Startup .NET butuh CPU yang layak. |
| **AI service** | FastAPI Python 3.12 (`services/ai-service/Dockerfile`, port 8000) | Ya | Dependency berat: langgraph, langchain, litellm, smolagents, PyMuPDF, flashrank (model reranker ONNX), asyncpg. RAM belum diukur, tapi kemungkinan besar di atas 512 MB. Ada streaming SSE untuk chat. Konek langsung ke Postgres (pgvector). |
| **Database + BaaS** | Supabase: Postgres 17 + pgvector, Auth (GoTrue), Storage (`bank-statements`), Realtime, PostgREST | Ya | App bergantung ke semua fitur Supabase, bukan hanya Postgres. |
| **Observability** | OTel → Alloy → Prometheus + Loki + Tempo → Grafana (Docker lokal) | Opsional | Di cloud, stack lokal ini tidak perlu di-host. Ganti dengan layanan OTLP managed. |
| **LLM observability** | Langfuse | Opsional | Sudah pakai Langfuse Cloud (`langfuse_host` default `cloud.langfuse.com`). |
| **LLM provider** | Gemini (utama), Anthropic (alternatif), OpenAI (embedding opsional), TypeSafe Jev (opsional) | Tidak (API eksternal) | Butuh API key dan batas biaya. |
| **CI** | GitHub Actions `ci.yml` | Sudah ada | Bisa ditambah job deploy, atau pakai integrasi git bawaan platform. |

Komponen yang **tidak** perlu di-host: Alloy, Prometheus, Loki, Tempo, Grafana lokal, Supabase Studio, dan Inbucket. Semuanya hanya untuk dev lokal.

Sebagai gambaran, Supabase lokal saja memakai sekitar 1 GB RAM di 10 container (diukur dengan `docker stats`). Karena itu, self-host Supabase di VM gratis yang kecil tidak realistis.

---

## 2. Kenapa tidak semuanya di Vercel?

Banyak orang pakai Vercel karena project mereka Next.js atau full-stack JavaScript. Di situ frontend dan backend sama-sama berjalan sebagai Vercel Functions. Project ini berbeda karena punya tiga runtime:

| Komponen | Bisa di Vercel? | Alasan |
|---|---|---|
| Frontend (Vite SPA) | ✅ Ya, sangat cocok | Static hosting, preview deploy per PR, domain `*.vercel.app` gratis. |
| API .NET 10 | ❌ Tidak | Vercel tidak punya runtime .NET dan tidak menjalankan container Docker. |
| AI service Python | ❌ Praktisnya tidak | Vercel punya runtime Python, tapi bundle function-nya dibatasi ukuran (⚠ sekitar 250 MB unzipped, cek lagi). Dependency LangChain, LangGraph, litellm, smolagents, dan PyMuPDF hampir pasti melewati batas itu. Hobby juga dibatasi 300 detik per eksekusi dan sekitar 4 jam active CPU per bulan ⚠. Agent dan chat SSE tidak cocok dengan model ini. |
| Database | ❌ | Vercel Postgres/Marketplace bukan Supabase. App ini butuh Auth, Storage, dan Realtime dari Supabase. |

Soal lisensi: Hobby hanya untuk **non-commercial personal use**. Demo portfolio untuk interview masuk kategori itu. Kalau nanti app ini dipakai orang lain secara komersial, Vercel mewajibkan Pro ($20/bulan).

**Kesimpulan:** Vercel untuk frontend saja. Itu juga pola umum: frontend di Vercel, backend di tempat lain.

---

## 3. Perbandingan per komponen

### 3.1 Frontend (SPA statis)

| | **Vercel Hobby** | **Cloudflare Pages / Workers Static Assets** | **Netlify Free** | **Azure Static Web Apps Free** |
|---|---|---|---|---|
| Biaya | $0 | $0 | $0 | $0 |
| Limit utama | Non-commercial saja. Akun bisa di-pause kalau melewati limit, tanpa tagihan. | Bandwidth dan request statis unlimited, 500 build/bulan | Kredit bulanan (model kredit sejak 2025) ⚠ | 100 GB bandwidth ⚠ |
| SPA fallback | Perlu `vercel.json` rewrites | Pages otomatis. Workers perlu `not_found_handling: single-page-application`. | `_redirects` | `staticwebapp.config.json` |
| Preview deploy per PR | ✅ Sangat bagus | ✅ | ✅ | ✅ |
| Nilai untuk interview | Nama paling dikenal | Dikenal | Dikenal | Bagus kalau ceritanya "Azure" |
| **Peran** | **🏆 Winner** | **Cadangan 1** | Cadangan 2 | Pilih kalau bundle Azure |

**Kenapa Vercel menang:** untuk SPA statis, Vercel dan Cloudflare secara teknis setara. Keunggulan bandwidth unlimited Cloudflare tidak berarti apa-apa untuk trafik demo. Vercel menang tipis karena DX dan preview deploy-nya rapi, dan namanya paling dikenal. Kalau suatu saat ada niat komersial, langsung pindah ke Cloudflare karena tidak ada klausul non-commercial.

### 3.2 API .NET 10 (container)

| | **Google Cloud Run** | **Azure Container Apps (Consumption)** | **Render Free** | **Koyeb Free** | Fly.io / Railway |
|---|---|---|---|---|---|
| Biaya | $0 dalam free grant | $0 dalam free grant | $0 | $0 | Tidak ada free tier yang berguna |
| Free grant / limit | Sekitar 180k vCPU-detik, 360k GiB-detik, dan 2 juta request per bulan (request-based billing, harga us-central1; region lain bisa beda tier ⚠) | 180k vCPU-detik, 360k GiB-detik, dan 2 juta request per bulan per subscription | 512 MB RAM, 0.1 CPU ⚠, 750 jam/bulan **dibagi ke semua service di workspace** | 1 instance per organisasi, 512 MB, 0.1 vCPU | Fly: trial singkat untuk akun baru. Railway: $1/bulan. |
| Region dekat Supabase SG | ✅ Jakarta (`asia-southeast2`) / Singapore (`asia-southeast1`) | ✅ Southeast Asia (Singapore) | ✅ Singapore | ❌ Free hanya Frankfurt / Washington DC | Fly: SG ada (berbayar) |
| CPU saat request | 1 vCPU penuh atau lebih | 0.25 sampai 2 vCPU, bisa diatur | 0.1 CPU | 0.1 vCPU | n/a |
| Idle / cold start | Scale to zero. Cold start .NET beberapa detik. | Scale to zero. Cold start biasanya lebih lambat dari Cloud Run ⚠ (pengalaman umum, belum diukur). | Tidur setelah 15 menit. Bangun **sampai sekitar 1 menit**. | Tidur setelah 1 jam, tidak bisa dimatikan | n/a |
| Kartu kredit | Wajib (billing account) | Wajib (Azure account) | Tidak | Tidak | n/a |
| Risiko biaya | Ada kalau kebocoran trafik. Mitigasi: `max-instances=1` dan budget alert. | Sama. Mitigasi: max replicas 1 dan budget alert. | Nol | Nol | n/a |
| Catatan | Deploy langsung dari Dockerfile yang sudah ada | Cocok dengan "Cloud target: Azure" di CLAUDE.md | 0.1 CPU membuat .NET lambat start dan lambat JIT | Region jauh, sehingga setiap call PostgREST lintas benua. Ada laporan Koyeb diakuisisi Mistral (Feb 2026) ⚠, jadi syarat free tier bisa berubah. | n/a |
| **Peran** | **🏆 Winner** | **Cadangan 1 (jalur Azure)** | **Cadangan 2 (tanpa kartu)** | ❌ Dicoret | ❌ Dicoret |

**Kenapa Cloud Run menang:**
1. **Region.** Bisa Jakarta atau Singapore, satu region dengan Supabase. Ini faktor terpenting, karena satu pass scoring melakukan banyak read ke PostgREST.
2. **CPU nyata.** Instance dapat 1 vCPU saat melayani request, bukan 0.1. Startup .NET 10 dan pass scoring jadi beberapa kali lebih cepat.
3. **Cold start dalam hitungan detik**, bukan satu menit. Ini penting saat interviewer sedang menonton layar.
4. **Free grant jauh di atas kebutuhan demo.** Contohnya, demo dua jam per minggu dengan beberapa request per detik hanya memakai sebagian kecil dari 180k vCPU-detik.

**Kapan pilih Azure Container Apps:** kalau ingin cerita "deployed on Azure" di CV atau sedang interview di perusahaan .NET/Microsoft. CLAUDE.md juga menyebut Azure sebagai target cloud jangka panjang. Secara teknis bedanya kecil. Yang perlu diukur adalah cold start-nya.

### 3.3 AI service Python (container, berat)

| | **Google Cloud Run** | **Azure Container Apps** | **Hugging Face Spaces (Docker, CPU Basic)** | **Render Free** | **Koyeb Free** |
|---|---|---|---|---|---|
| RAM | Bisa diatur 1 sampai 2 GiB atau lebih (tetap dalam free GiB-detik) | Sampai 4 GiB per replica | 16 GB, 2 vCPU | 512 MB | 512 MB |
| Cocok untuk dependency LangChain + flashrank? | ✅ | ✅ | ✅ | ⚠ Kemungkinan OOM | ⚠ Kemungkinan OOM, dan slot gratis sudah dipakai API kalau API di sini |
| Region | Jakarta / Singapore | Southeast Asia | US/EU (tidak bisa pilih) | Singapore | Frankfurt / DC |
| Idle | Scale to zero | Scale to zero | Tidur setelah 48 jam | Tidur setelah 15 menit, bangun sekitar 1 menit | Tidur setelah 1 jam |
| SSE / streaming | ✅ (timeout request sampai 60 menit) | ✅ | ✅ | ✅ | ✅ |
| Kartu kredit | Wajib | Wajib | Tidak | Tidak | Tidak |
| Catatan | Satu platform dengan API: satu billing, satu cara deploy | Satu platform dengan API kalau pilih jalur Azure | Ada laporan komunitas (Juli 2026) soal quota dan pembatasan Docker di tier gratis ⚠. Space harus private karena memegang secret. | 750 jam dibagi dengan API kalau API juga di Render | n/a |
| **Peran** | **🏆 Winner** | **Cadangan 1 (jalur Azure)** | **Cadangan 2 (tanpa kartu)** | Cadangan 3 | ❌ |

**Kenapa Cloud Run menang:** RAM bisa diatur sesuai kebutuhan nyata, region sama dengan DB dan API, dan satu platform dengan API. Kalau harus tanpa kartu, HF Spaces lebih masuk akal daripada Render karena 16 GB RAM. Risikonya, region-nya jauh dan kebijakan quota-nya sedang tidak jelas.

**Yang harus diukur dulu:** RAM AI service saat idle dan saat chat/agent berjalan. Angka ini menentukan apakah opsi 512 MB (Render, Koyeb) masih layak dipertimbangkan.

### 3.4 Database + Auth + Storage + Realtime

| | **Supabase Cloud Free** | Supabase Cloud Pro | Self-host Supabase di VM | Neon / Postgres lain |
|---|---|---|---|---|
| Biaya | $0 | $25/bulan | $0 sampai $6/bulan + waktu ops | $0 |
| Limit | DB 500 MB, Storage 1 GB, Egress 5 GB, 50k MAU, 2 project aktif, RAM 500 MB shared | Lebih besar dan tidak pernah pause | Tergantung VM. Supabase lokal saja sekitar 1 GB RAM. | Hanya Postgres |
| Pause | **Pause setelah 7 hari tidak aktif**, lalu harus di-resume manual dari dashboard | Tidak | Tidak | Scale to zero, bangun otomatis |
| Fitur yang dipakai app | Semua (Auth, Storage, Realtime, pgvector, PostgREST) | Semua | Semua, tapi ops berat | ❌ Tidak ada Auth, Storage, Realtime, PostgREST |
| **Peran** | **🏆 Winner** | Upgrade kalau demo rutin | ❌ | ❌ |

Tidak ada pesaing nyata, karena app ini dibangun di atas Supabase. Pilih region **Singapore**.

### 3.5 Observability

| | **Grafana Cloud Free** | Observability bawaan platform (Cloud Logging/Trace, Azure Monitor) | Matikan saja |
|---|---|---|---|
| Biaya | $0 | $0 dalam free tier masing-masing ⚠ | $0 |
| Limit | Metrics 10k series, Logs 50 GB/bulan, Traces 50 GB/bulan, retensi 14 hari | Per platform | n/a |
| Kerja yang dibutuhkan | Ubah kode exporter (lihat bagian 5) dan set env OTLP | Ganti exporter ke vendor | Matikan exporter, cukup pakai log platform |
| Nilai demo | ✅ Tinggi: bisa menunjukkan trace lintas API → AI service → DB di Grafana | Sedang | Rendah |
| **Peran** | **🏆 Winner** | Cadangan | Minimal |

Untuk LLM tracing, tetap pakai **Langfuse Cloud Hobby** (gratis, sekitar 50k unit/bulan ⚠, retensi 30 hari). Tidak perlu di-host.

### 3.6 Lain-lain

| Item | Rekomendasi | Catatan |
|---|---|---|
| Domain | `*.vercel.app` dan `*.run.app` gratis. Custom domain sekitar $10/tahun, opsional. | Custom domain terlihat lebih rapi saat demo, tapi tidak wajib. |
| Secrets | Env var di Vercel. Secret Manager (GCP) atau Key Vault/ACA secrets (Azure) untuk backend. | Jangan ada di repo. |
| Deploy | Vercel: integrasi git bawaan. Cloud Run: GitHub Action dengan Workload Identity Federation, atau `gcloud run deploy --source` manual. | Untuk demo, deploy manual sudah cukup. |
| Biaya LLM | Gemini API **free tier** untuk demo (rate-limited, tanpa billing) | Free tier Gemini boleh memakai data untuk training. Ini terkait keputusan PF-149. Pakai **data sintetis** saja. |

---

## 4. Perbandingan bundle (stack lengkap)

| Kriteria | **A. Vercel + Cloud Run + Supabase** 🏆 | **B. Vercel/SWA + Azure Container Apps + Supabase** | **C. Tanpa kartu: Vercel + Render (API) + HF Spaces (AI) + Supabase** | **D. Satu VPS kecil (docker compose) + Supabase** |
|---|---|---|---|---|
| Biaya/bulan | $0 | $0 | $0 | Sekitar $5–6 ⚠ |
| Kartu kredit | Ya (GCP) | Ya (Azure) | Tidak | Ya |
| Latensi ke DB | ✅ Satu region | ✅ Satu region | API ✅, AI ❌ (US/EU) | ✅ kalau VPS di SG |
| Cold start saat demo | Beberapa detik | Beberapa sampai belasan detik ⚠ | Sekitar 1 menit (Render) | Tidak ada |
| Risiko RAM AI service | Rendah | Rendah | Rendah (16 GB) | Tergantung ukuran VPS |
| Usaha setup | Sedang | Sedang sampai tinggi (lebih banyak konsep Azure) | Sedang (dua platform) | Sedang (ops sendiri: TLS, update, restart) |
| Risiko kebijakan berubah | Rendah | Rendah | Tinggi (quota HF tidak jelas) | Rendah |
| Nilai cerita interview | "Serverless containers di GCP, satu region dengan DB" | "Azure", sesuai target jangka panjang | "Bisa di-deploy gratis" | "Bisa ops sendiri" |
| **Skor (1–5)** | **4.5** | 4 | 3 | 3.5 |

**Sampai kapan gratisnya (dicek 2026-11-22):** jatah gratis bulanan yang dipakai bundle A dan B **tidak punya tanggal kedaluwarsa**. Yang kedaluwarsa hanya kredit sign-up, dan kredit itu tidak dibutuhkan untuk demo.

| | Kredit sign-up | Jatah container bulanan (180k vCPU-detik, 360k GiB-detik, 2 juta request) |
|---|---|---|
| **GCP (A)** | $300, berlaku **90 hari** atau sampai habis. Setelah trial, billing account ditutup dan resource dihentikan kecuali di-upgrade ke akun berbayar (ada masa pulih 30 hari). | Free Tier Cloud Run, **tanpa batas waktu**, reset tiap bulan, tetap berlaku setelah upgrade. Dihitung gabungan per billing account. Region Tier 2 dapat jatah CPU lebih kecil (sekitar 128k vCPU-detik) ⚠ Cek tier Jakarta dan Singapore. |
| **Azure (B)** | $200, berlaku **30 hari**. Layanan "free 12 bulan" tidak mencakup Container Apps. | Free grant Container Apps Consumption, **tanpa batas waktu**, reset per bulan kalender, per subscription. Untuk Dedicated plan belum terkonfirmasi. |

Jadi, setelah masa trial habis, upgrade ke akun berbayar dan biarkan kartu tetap terpasang. Tagihan tetap $0 selama pemakaian di bawah jatah bulanan. Risikonya hanya kalau pemakaian melewati jatah, dan mitigasinya tetap `max-instances=1` / max replicas 1 plus budget alert.

**Winner: Bundle A.** Bundle ini satu-satunya yang sekaligus $0, satu region, CPU dan RAM cukup, dan cold start-nya dalam hitungan detik. Bundle B adalah alternatif yang sah kalau label "Azure" lebih bernilai bagi interview yang dituju. Bundle C hanya kalau benar-benar tidak mau memasukkan kartu kredit. Bundle D layak dipertimbangkan kalau ingin nol cold start dan rela bayar sekitar $5/bulan.

Oracle Cloud Always Free (VM ARM gratis) sempat dipertimbangkan untuk bundle D, tapi dicoret. Limit-nya dipotong setengah pada pertengahan 2026, dan region Singapore sering "out of capacity".

---

## 5. Pekerjaan yang dibutuhkan apa pun platformnya

Ini temuan dari review plan lama yang masih berlaku untuk semua opsi:

1. **Pisahkan `/health`.** Health check sekarang ikut memanggil Grafana di `localhost:3000` dan AI service ([Program.cs:110-113](../../apps/api/src/PersonalFinance.Api/Program.cs#L110-L113)), sehingga di cloud selalu Unhealthy. Buat endpoint liveness tanpa dependency untuk platform, dan endpoint readiness terpisah.
2. **Exporter OTel.** Python memakai gRPC dengan `insecure=True` ([main.py:160-166](../../services/ai-service/app/main.py#L160)), dan .NET memakai default gRPC. Grafana Cloud butuh OTLP HTTP/protobuf lewat TLS plus header auth. Buat ini configurable lewat env.
3. **Matriks env var lengkap.** API wajib punya `CashflowPilot__*`, `AiService__InternalApiKey`, `AiChat__*`, dan `Cors__AllowedOrigins__0` (bukan `CORS_ORIGINS`). AI service wajib punya `INTERNAL_API_KEY`, `OWNER_SIGNING_SECRET`, `CASHFLOW_PILOT_ENABLED`, `DATABASE_URL`, dan `NET_API_BASE_URL`. Frontend wajib punya `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY`.
4. **Koneksi Postgres dari AI service.** `asyncpg.create_pool` ([main.py:124](../../services/ai-service/app/main.py#L124)) tidak mematikan statement cache, sehingga rusak di Supabase **transaction pooler** (port 6543). Koneksi direct Supabase Free hanya IPv6. Pakai **session pooler** (Supavisor, port 5432, IPv4), atau set `statement_cache_size=0`. Ini juga berlaku untuk connection string Npgsql di API.
5. **Model flashrank diunduh saat runtime** ke `/tmp/flashrank` ([reranker.py:23](../../services/ai-service/app/services/reranker.py#L23)), jadi setiap cold start mengunduh ulang. Bake model ke dalam image.
6. **Auth di Supabase Cloud.** `supabase db push` tidak membawa setting auth dari `config.toml`. Di project cloud: **matikan signup** (kalau tidak, orang asing bisa membuat akun dan menghabiskan kuota LLM), set Site URL dan Redirect URLs ke domain Vercel, lalu buat akun owner secara manual.
7. **Data demo.** Jangan taruh mutasi bank asli di internet. Buat akun demo dengan **data sintetis** (CSV contoh ada di `apps/frontend/e2e/fixtures/`), lalu seed sampai pyramid dan quest terlihat menarik.
8. **Ritual sebelum interview.** Supabase pause setelah 7 hari, dan backend scale to zero. Daripada cron keep-alive, cukup checklist: H-1, buka dashboard Supabase dan resume project kalau ter-pause. 10 menit sebelum demo, buka app sekali supaya semua instance hangat.

---

## 6. Pertanyaan untuk diskusi

1. **Mau masukkan kartu kredit ke GCP atau Azure?** Jawabannya menentukan A/B versus C.
2. **GCP atau Azure?** Kalau interview yang dituju banyak di .NET/Microsoft shop, B punya nilai cerita lebih. Kalau tidak, A lebih simpel dan cold start-nya lebih cepat.
3. **Fitur apa yang wajib jalan saat demo?** Upload CSV dan journey pyramid hampir pasti. Upload PDF via LLM, AI chat, dan agents perlu diputuskan, karena chat dan agents menambah env var, biaya LLM, dan risiko.
4. **Perlu Grafana Cloud di versi pertama?** Itu nilai tambah saat interview (menunjukkan trace end-to-end), tapi butuh perubahan kode exporter. Bisa ditunda ke fase 2.
5. **Demo dilakukan sendiri (screen share) atau interviewer diberi link dan akun?** Kalau diberi akun, perlu akun demo terpisah dan batas biaya LLM yang lebih ketat.
6. **Custom domain?** Opsional, sekitar $10/tahun.

---

## Sumber (dicek 2026-11-21)

- Vercel Hobby: [vercel.com/docs/plans/hobby](https://vercel.com/docs/plans/hobby), [Fair use guidelines](https://vercel.com/docs/limits/fair-use-guidelines.md), [Functions limitations](https://vercel.com/docs/functions/limitations)
- Cloudflare: [Workers vs Pages compatibility matrix](https://developers.cloudflare.com/workers/static-assets/compatibility-matrix), [Migrate from Pages](https://developers.cloudflare.com/workers/static-assets/migrate-from-pages/)
- Google Cloud Run: [Cloud Run pricing](https://cloud.google.com/run/pricing), [Free Trial FAQs](https://cloud.google.com/signup-faqs?hl=en), [Free features and trial offer](https://docs.cloud.google.com/free)
- Azure Container Apps: [Billing](https://learn.microsoft.com/azure/container-apps/billing), [Pricing](https://azure.microsoft.com/pricing/details/container-apps/), [Free account FAQ](https://azure.microsoft.com/free/free-account-faq)
- Render: [Deploy for Free](https://render.com/docs/free), [Regions](https://render.com/regions)
- Koyeb: [Pricing FAQ](https://www.koyeb.com/docs/faqs/pricing), [Scale to zero](https://www.koyeb.com/docs/run-and-scale/scale-to-zero), [Pricing](https://koyeb.com/pricing)
- Fly.io: [Discontinued plans](https://fly.io/docs/about/discontinued-plans/)
- Railway: [Free plan](https://docs.railway.com/pricing/free-plan), [Free trial](https://docs.railway.com/pricing/free-trial)
- Oracle Always Free: [Always Free resources](https://docs.oracle.com/iaas/Content/FreeTier/resourceref.htm), [InfoQ: free tier limits cut (Jul 2026)](https://infoq.com/news/2026/07/oracle-cloud-free-tier-limits/)
- Hugging Face Spaces: [Spaces overview](https://huggingface.co/docs/hub/spaces-overview), [Spaces hardware](https://huggingface.co/docs/hub/main/spaces-gpus), [Forum: CPU Basic quota](https://discuss.huggingface.co/t/cpu-basic-quota-limit-with-only-one-space/180646)
- Supabase: [Free project pausing](https://supabase.com/kb/faqs/platform/free-project-pausing), [Pricing](https://supabase.com/pricing)
- Grafana Cloud: [Free tier](https://grafana.com/products/cloud/free-tier), [Pricing](https://grafana.com/pricing/)
- Langfuse: [Pricing](https://langfuse.com/pricing)
