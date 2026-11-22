# Runbook deploy Bundle A: Vercel + Cloud Run + Supabase Cloud

> **Status:** draft langkah demi langkah, belum dieksekusi. Dibuat 2026-11-22.
> **Sumber keputusan:** [deployment-hosting-comparison.md](deployment-hosting-comparison.md), bagian 4 (Bundle A) dan bagian 5 (pekerjaan wajib).
> **Hasil akhir:** frontend di `https://<app>.vercel.app`, API dan AI service di Cloud Run region Singapore (`asia-southeast1`), database di Supabase Cloud Free region Singapore. Biaya target $0/bulan untuk trafik demo.
> **Perkiraan waktu:** sekitar satu hari kerja. Langkah 1 (perubahan kode) paling lama.

Semua perintah `gcloud`, `supabase`, dan `curl` di bawah ditulis untuk Git Bash. Ganti placeholder dalam `<...>`. Angka free tier yang belum dicek ditandai ⚠.

## Ringkasan urutan

| # | Langkah | Kenapa urutannya begini |
|---|---|---|
| 0 | Siapkan akun dan putuskan scope demo | Scope menentukan flag dan secret mana yang dibutuhkan. |
| 1 | Perubahan kode wajib (satu PR) | Tanpa ini, health check selalu Unhealthy, `/mcp` terbuka ke publik, dan AI service salah konek ke pooler. |
| 2 | Ukur RAM AI service secara lokal | Menentukan `--memory` di Cloud Run. |
| 3 | Buat project Supabase Cloud dan push schema | API dan AI service butuh URL, key, dan connection string-nya. |
| 4 | Siapkan project GCP, budget alert, dan registry | Pagar biaya dipasang sebelum ada resource yang berjalan. |
| 5 | Simpan secret di Secret Manager | Secret tidak boleh ada di repo atau di flag perintah. |
| 6 | Build dan push dua image | |
| 7 | Deploy AI service | API butuh URL AI service. |
| 8 | Deploy API | Frontend butuh URL API. |
| 9 | Deploy frontend ke Vercel | |
| 10 | Tutup lingkaran: CORS dan URL Auth | Domain Vercel baru diketahui setelah langkah 9. |
| 11 | Buat akun demo dan isi data sintetis | |
| 12 | Smoke test dan ukur cold start | |
| 13 | Pagar pengaman | |
| 14 | Ritual sebelum interview | |
| 15 | Auto deploy setiap merge ke `main` | Dipasang setelah deploy manual pertama berhasil, karena workflow hanya mengganti image. |

---

## Langkah 0. Akun, tool, dan scope

**Akun yang dibutuhkan:**

1. Google Cloud dengan billing account (kartu kredit). Kredit trial $300 tidak dibutuhkan, tapi tidak apa-apa kalau ikut aktif.
2. Supabase (login pakai GitHub).
3. Vercel Hobby (login pakai GitHub, beri akses ke repo ini).
4. Google AI Studio untuk Gemini API key **di project tanpa billing**, supaya tetap di free tier dan otomatis kena rate limit.
5. Opsional: Langfuse Cloud Hobby untuk LLM tracing.

**Tool lokal:**

```bash
gcloud --version     # Google Cloud CLI
supabase --version   # Supabase CLI, sudah dipakai untuk dev lokal
docker --version     # untuk mengukur RAM di langkah 2
openssl version      # untuk membuat secret acak (ikut Git for Windows)
```

**Scope demo versi pertama (default yang dipakai runbook ini):**

| Fitur | Default | Efek kalau diubah |
|---|---|---|
| Upload CSV, transaksi, journey pyramid, quest | Nyala | Inti demo, wajib. |
| Upload PDF via LLM | Nyala | Butuh Gemini key, sudah termasuk. |
| AI chat (`/api/chat/*`) | Nyala | Butuh `OWNER_SIGNING_SECRET`. Matikan dengan `AiChat__Enabled=false`, `AI_CHAT_ENABLED=false`, dan `VITE_AI_CHAT_ENABLED=false`. |
| Agents (advisor) | Mati | Kalau dinyalakan, set `AiChat__AgentsEnabled=true` dan `AI_AGENTS_ENABLED=true`. Agents memanggil API lewat `NET_API_BASE_URL`. |
| Grafana Cloud | Mati, fase 2 | Butuh perubahan exporter OTel (lihat Langkah 16). |
| Custom domain | Tidak | Opsional, sekitar $10/tahun. |

---

## Langkah 1. Perubahan kode wajib (satu PR sebelum deploy)

Kerjakan di branch terpisah, jalankan `ci-check`, lalu merge. Semua perubahan ini aman untuk dev lokal karena default-nya tetap sama dengan perilaku sekarang.

### 1a. Health check yang tidak bergantung ke localhost

Masalah: [Program.cs:110-113](../../apps/api/src/PersonalFinance.Api/Program.cs#L110-L113) selalu memeriksa Grafana di `http://localhost:3000`. Di Cloud Run itu tidak ada, jadi `/health` selalu Unhealthy dan halaman status di frontend ikut merah.

Perubahan:

1. Daftarkan check Grafana hanya kalau config `Monitoring:GrafanaHealthUrl` diisi, atau kalau environment-nya Development (fallback ke `http://localhost:3000/api/health`). Dev lokal tidak berubah, dan di cloud (Production) check ini hilang.
2. Tambah endpoint liveness `/health/live` tanpa dependency (`Predicate = _ => false`, `AllowAnonymous()`). `/health` tetap menjadi readiness (Database dan AI Service).

Cloud Run memakai TCP startup probe secara default, jadi deploy tidak gagal walaupun `/health` merah. Perubahan ini untuk kejujuran status di UI dan untuk smoke test.

### 1b. OTel exporter yang bisa dimatikan

Masalah: .NET mengirim ke `http://localhost:4317` secara default, dan Python memakai gRPC `insecure=True` ([main.py:160-166](../../services/ai-service/app/main.py#L160)). Di cloud tidak ada collector, jadi log penuh error export.

Perubahan untuk fase 1 (cukup ini dulu): tambah flag `OTEL_ENABLED` dengan default `true` di kedua service, sehingga dev lokal tidak berubah. Di cloud, flag ini diset `false` lewat env file (Langkah 7 dan 8).

1. API: bungkus seluruh blok OpenTelemetry di Program.cs dengan `if (builder.Configuration.GetValue("OTEL_ENABLED", true))`.
2. AI service: tambah `otel_enabled: bool = True` di [config.py](../../services/ai-service/app/config.py), lalu bungkus setup tracing dan metrics di `main.py` dengan `if settings.otel_enabled:`.

Konfigurasi OTLP HTTP dengan TLS dan header auth untuk Grafana Cloud ditunda ke Langkah 15.

### 1c. Tutup `/mcp` di AI service

Masalah: middleware `pilot_access_gate` ([main.py:198-217](../../services/ai-service/app/main.py#L198-L217)) melewatkan `/health` **dan semua path `/mcp`** tanpa autentikasi. Tool MCP membaca transaksi owner lewat pool Postgres. Begitu AI service punya URL publik di Cloud Run, siapa pun bisa query data owner lewat `/mcp`.

Perubahan: tambah setting `mcp_enabled: bool = False`. Kalau `False`, sub-app MCP tidak di-mount dan `/mcp` mengembalikan 404. Kalau `True`, `/mcp` tetap wajib membawa header `x-internal-api-key` yang benar. Set `MCP_ENABLED=true` hanya di `.env` lokal.

Ini wajib, bukan opsional. Tanpa perubahan ini, Bundle A membocorkan data.

### 1d. Model flashrank dimasukkan ke image

Masalah: [reranker.py:23](../../services/ai-service/app/services/reranker.py#L23) mengunduh model ke `/tmp/flashrank` saat runtime. Di Cloud Run, `/tmp` disimpan di memori, jadi model ikut memakan RAM instance dan diunduh ulang setiap cold start.

Perubahan:

1. Baca `cache_dir` dari setting baru `flashrank_cache_dir` (default tetap `/tmp/flashrank` untuk lokal).
2. Di [services/ai-service/Dockerfile](../../services/ai-service/Dockerfile), setelah `pip install`, unduh model saat build:

```dockerfile
ENV FLASHRANK_CACHE_DIR=/opt/flashrank
RUN python -c "from flashrank import Ranker; Ranker(model_name='ms-marco-MiniLM-L-12-v2', cache_dir='/opt/flashrank')"
```

### 1e. Jangan bawa file dev ke image

1. Tambah `**/appsettings.Development.json` ke [apps/api/.dockerignore](../../apps/api/.dockerignore). Sekarang `COPY . .` ikut menyalinnya ke image, lalu `dotnet publish` menaruhnya di output.
2. Buat `services/ai-service/.dockerignore` berisi `.env`, `**/__pycache__`, `tests/`, dan `evals/`.

### 1f. Koneksi Postgres (tidak perlu ubah kode)

Pakai **session pooler** Supabase (Supavisor, port 5432, IPv4). Session pooler mendukung prepared statement, jadi `asyncpg.create_pool` di [main.py:124](../../services/ai-service/app/main.py#L124) dan Npgsql di API berjalan tanpa perubahan. Jangan pakai transaction pooler (port 6543), karena asyncpg akan rusak tanpa `statement_cache_size=0`. Jangan pakai koneksi direct, karena di Free hanya IPv6 dan Cloud Run tidak mendukung egress IPv6 tanpa VPC.

---

## Langkah 2. Ukur RAM AI service secara lokal

Setelah PR di Langkah 1 masuk:

```bash
docker compose build ai-service
docker compose up -d ai-service
docker stats --no-stream personalfinance-ai-service   # cek nama container di docker compose ps
```

Catat RAM saat idle, lalu jalankan satu chat dan satu upload PDF, lalu catat lagi puncaknya. Pilih `--memory` Cloud Run dengan aturan berikut:

| Puncak RAM | `--memory` |
|---|---|
| Di bawah 700 MB | `1Gi` |
| 700 MB sampai 1.4 GB | `2Gi` |
| Di atas 1.4 GB | `4Gi` (Cloud Run butuh `--cpu=2` untuk 4 GiB ⚠) |

Tulis angka hasil ukur ke bagian 3.3 di [deployment-hosting-comparison.md](deployment-hosting-comparison.md), karena angka itu sekarang masih tebakan.

---

## Langkah 3. Supabase Cloud

### 3a. Buat project

1. Di dashboard Supabase, buat project baru. Region: **Southeast Asia (Singapore)**. Plan: Free.
2. Simpan database password di password manager. Password ini dipakai di Langkah 5.

### 3b. Push schema

```bash
cd /c/workspaces/personal-finance
supabase login
supabase link --project-ref <project-ref>
supabase db push            # menerapkan semua file di supabase/migrations/
```

Setelah selesai, cek di dashboard:

- Table Editor menampilkan tabel aplikasi (`transactions`, `category_rules`, `quest_completions`, `goals`, dan lainnya).
- Storage punya bucket `bank-statements` (dibuat oleh `20260101000002_storage.sql`).
- Database > Extensions menunjukkan `vector` aktif.

`supabase db push` tidak menjalankan `seed.sql`. Jalankan isinya sekali lewat SQL Editor kalau preset `TARIKAN ATM` dibutuhkan.

### 3c. Setting Auth (tidak ikut terbawa dari `config.toml`)

Di **Authentication**:

1. **Sign In / Providers:** matikan "Allow new users to sign up". Tanpa ini, orang asing bisa membuat akun dan menghabiskan kuota LLM.
2. **Sign In / Providers:** matikan anonymous sign-ins (default-nya sudah mati, cukup dicek).
3. **Password policy:** minimal 12 karakter, wajib huruf besar, huruf kecil, angka, dan simbol, sama seperti `config.toml`.
4. **URL Configuration:** isi Site URL sementara dengan `http://localhost:8080`. Nilai ini diganti di Langkah 10.

### 3d. Catat nilai yang dibutuhkan

| Nilai | Tempat di dashboard | Dipakai oleh |
|---|---|---|
| Project URL `https://<ref>.supabase.co` | Project Settings > API | API, frontend |
| Anon key | Project Settings > API Keys | API, frontend (boleh publik) |
| Service role key | Project Settings > API Keys | API saja (secret) |
| Tipe JWT signing key | Project Settings > JWT Keys | API: `Jwks` kalau ECC/RSA, `LegacySecret` kalau masih HS256 |
| Session pooler connection string | Tombol **Connect** > Session pooler | API dan AI service (secret) |

Pakai tab legacy key (anon dan service_role berbentuk JWT) kalau ada. Kompatibilitas `supabase-csharp` dengan format baru `sb_publishable_...` dan `sb_secret_...` belum dicek ⚠.

Session pooler string bentuknya seperti ini (host bisa `aws-0` atau `aws-1`, salin dari dashboard):

```text
postgresql://postgres.<ref>:<db-password>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres
```

Untuk API, ubah ke format Npgsql:

```text
Host=aws-0-ap-southeast-1.pooler.supabase.com;Port=5432;Database=postgres;Username=postgres.<ref>;Password=<db-password>;SSL Mode=Require
```

Untuk AI service, pakai format URL di atas dan tambahkan `?sslmode=require`.

---

## Langkah 4. Project GCP, budget alert, dan registry

```bash
gcloud auth login
gcloud projects create <project-id> --name="pf-demo"
gcloud config set project <project-id>
gcloud config set run/region asia-southeast1

gcloud billing accounts list                       # ambil BILLING_ACCOUNT_ID
gcloud billing projects link <project-id> --billing-account=<BILLING_ACCOUNT_ID>

gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
  cloudbuild.googleapis.com secretmanager.googleapis.com billingbudgets.googleapis.com
```

**Budget alert, dipasang sekarang sebelum ada resource yang berjalan:**

```bash
gcloud billing budgets create --billing-account=<BILLING_ACCOUNT_ID> \
  --display-name="pf-demo" --budget-amount=2USD \
  --threshold-rule=percent=0.5 --threshold-rule=percent=1.0
```

Budget alert hanya mengirim email. Alert tidak menghentikan pemakaian, jadi pagar yang benar-benar membatasi biaya tetap `--max-instances=1` di Langkah 7 dan 8.

**Registry image dan service account runtime:**

```bash
gcloud artifacts repositories create pf --repository-format=docker --location=asia-southeast1

# Simpan hanya 2 versi terakhir supaya storage tetap di bawah jatah gratis 0.5 GB ⚠
cat > ar-cleanup.json <<'EOF'
[{"name":"keep-2","action":{"type":"Keep"},"mostRecentVersions":{"keepCount":2}},
 {"name":"delete-rest","action":{"type":"Delete"},"condition":{"tagState":"any"}}]
EOF
gcloud artifacts repositories set-cleanup-policies pf --location=asia-southeast1 \
  --policy=ar-cleanup.json --no-dry-run
rm ar-cleanup.json

gcloud iam service-accounts create pf-run --display-name="pf Cloud Run runtime"
```

**Hitung URL Cloud Run di depan.** URL Cloud Run sudah bisa ditebak sebelum deploy, sehingga API dan AI service bisa saling diisi tanpa deploy dua kali:

```bash
PROJECT_NUMBER=$(gcloud projects describe <project-id> --format='value(projectNumber)')
echo "AI : https://pf-ai-${PROJECT_NUMBER}.asia-southeast1.run.app"
echo "API: https://pf-api-${PROJECT_NUMBER}.asia-southeast1.run.app"
```

Region `asia-southeast1` kemungkinan masuk pricing Tier 2, yang jatah CPU gratisnya lebih kecil ⚠. Untuk trafik demo, bedanya tidak terasa.

---

## Langkah 5. Secret Manager

Buat dua secret acak baru. Jangan pakai ulang nilai dari `.env` lokal.

```bash
openssl rand -base64 32   # untuk pf-internal-api-key
openssl rand -base64 32   # untuk pf-owner-signing-secret
```

Simpan setiap secret. Perintah `read -s` membuat nilai tidak tercatat di history shell.

```bash
for name in pf-internal-api-key pf-owner-signing-secret pf-supabase-service-role \
            pf-db-npgsql pf-db-asyncpg pf-gemini-key; do
  read -rsp "Value for $name: " v; echo
  printf '%s' "$v" | gcloud secrets create "$name" --data-file=- --replication-policy=automatic
  gcloud secrets add-iam-policy-binding "$name" \
    --member="serviceAccount:pf-run@<project-id>.iam.gserviceaccount.com" \
    --role=roles/secretmanager.secretAccessor
done
```

| Secret | Isi | Dipakai oleh |
|---|---|---|
| `pf-internal-api-key` | Hasil `openssl` pertama | API (`AiService__InternalApiKey`) dan AI (`INTERNAL_API_KEY`) |
| `pf-owner-signing-secret` | Hasil `openssl` kedua | API (`AiChat__OwnerSigningSecret`) dan AI (`OWNER_SIGNING_SECRET`) |
| `pf-supabase-service-role` | Service role key | API (`Supabase__ServiceRoleKey`) |
| `pf-db-npgsql` | Connection string format Npgsql | API (`ConnectionStrings__Default`) |
| `pf-db-asyncpg` | Connection string format URL | AI (`DATABASE_URL`) |
| `pf-gemini-key` | Gemini API key dari project tanpa billing | AI (`GEMINI_API_KEY`) |

Enam secret aktif masih di dalam jatah gratis Secret Manager ⚠. Kalau Langfuse dipakai, secret ketujuh (`pf-langfuse-secret`) kena biaya sekitar $0.06/bulan ⚠.

---

## Langkah 6. Build dan push image

Cloud Build membangun image dari Dockerfile yang sudah ada:

```bash
REG=asia-southeast1-docker.pkg.dev/<project-id>/pf
TAG=$(git rev-parse HEAD)   # full SHA; workflow auto deploy membandingkan commit lewat tag ini

gcloud builds submit services/ai-service --tag "$REG/ai-service:$TAG"
gcloud builds submit apps/api          --tag "$REG/api:$TAG"
```

Alternatif kalau ingin hemat menit Cloud Build: build di Docker lokal, jalankan `gcloud auth configure-docker asia-southeast1-docker.pkg.dev`, lalu `docker push`.

---

## Langkah 7. Deploy AI service

Simpan konfigurasi non-secret di file. Nilai ini boleh di-commit, misalnya ke `deploy/cloudrun/ai.env.yaml`:

```yaml
AI_PROVIDER: gemini
AI_MODEL: gemini-2.5-flash
EMBEDDING_PROVIDER: gemini
LOG_LEVEL: INFO
CASHFLOW_PILOT_ENABLED: "true"
AI_CHAT_ENABLED: "true"
AI_AGENTS_ENABLED: "false"
MCP_ENABLED: "false"
OTEL_ENABLED: "false"            # Langkah 1b
NET_API_BASE_URL: https://pf-api-<PROJECT_NUMBER>.asia-southeast1.run.app
```

```bash
gcloud run deploy pf-ai \
  --image="$REG/ai-service:$TAG" \
  --port=8000 --cpu=1 --memory=2Gi \
  --min-instances=0 --max-instances=1 --concurrency=20 \
  --timeout=900 --cpu-boost \
  --service-account=pf-run@<project-id>.iam.gserviceaccount.com \
  --allow-unauthenticated \
  --env-vars-file=deploy/cloudrun/ai.env.yaml \
  --set-secrets=GEMINI_API_KEY=pf-gemini-key:latest,INTERNAL_API_KEY=pf-internal-api-key:latest,OWNER_SIGNING_SECRET=pf-owner-signing-secret:latest,DATABASE_URL=pf-db-asyncpg:latest
```

Penjelasan flag yang penting:

- `--memory` diisi dari hasil Langkah 2.
- `--max-instances=1` adalah pagar biaya utama.
- `--timeout=900` memberi ruang untuk streaming chat SSE dan parsing PDF.
- `--allow-unauthenticated` diperlukan karena API memanggil URL publik ini. Perlindungannya ada di header `x-internal-api-key` dan di Langkah 1c. Alternatif yang lebih ketat adalah IAM invoker dengan ID token dari API, tapi itu butuh perubahan kode dan bisa ditunda.

Cek cepat:

```bash
curl -s https://pf-ai-${PROJECT_NUMBER}.asia-southeast1.run.app/health
curl -s -o /dev/null -w '%{http_code}\n' https://pf-ai-${PROJECT_NUMBER}.asia-southeast1.run.app/mcp/   # harus 404
```

---

## Langkah 8. Deploy API

`deploy/cloudrun/api.env.yaml`:

```yaml
ASPNETCORE_ENVIRONMENT: Production
OTEL_ENABLED: "false"                      # Langkah 1b
Supabase__Url: https://<ref>.supabase.co
Supabase__AnonKey: <anon-key>
Supabase__JwtValidationMode: Jwks          # atau LegacySecret, lihat Langkah 3d
Supabase__JwtIssuer: https://<ref>.supabase.co/auth/v1
Supabase__JwtAudience: authenticated
AiService__BaseUrl: https://pf-ai-<PROJECT_NUMBER>.asia-southeast1.run.app
CashflowPilot__Enabled: "true"
CashflowPilot__CheckedMutationsEnabled: "true"
AiChat__Enabled: "true"
AiChat__AgentsEnabled: "false"
Cors__AllowedOrigins__0: http://localhost:8080   # diganti di Langkah 10
```

```bash
gcloud run deploy pf-api \
  --image="$REG/api:$TAG" \
  --port=7208 --cpu=1 --memory=512Mi \
  --min-instances=0 --max-instances=1 --concurrency=40 \
  --cpu-boost \
  --service-account=pf-run@<project-id>.iam.gserviceaccount.com \
  --allow-unauthenticated \
  --env-vars-file=deploy/cloudrun/api.env.yaml \
  --set-secrets=Supabase__ServiceRoleKey=pf-supabase-service-role:latest,AiService__InternalApiKey=pf-internal-api-key:latest,AiChat__OwnerSigningSecret=pf-owner-signing-secret:latest,ConnectionStrings__Default=pf-db-npgsql:latest
```

Catatan:

- Port 7208 sudah di-set lewat `ASPNETCORE_URLS` di [apps/api/Dockerfile](../../apps/api/Dockerfile), jadi `--port=7208` cukup.
- Mode `Production` membuat JwtBearer mewajibkan metadata HTTPS. Supabase Cloud sudah HTTPS, jadi aman.
- `CashflowPilot__Enabled=true` wajib. Tanpa flag ini, middleware di Program.cs mengembalikan 404 untuk `/api/transactions`, `/api/accounts`, `/api/categoryrules`, dan route cashflow lainnya.
- API langsung crash saat start kalau `CashflowPilot__Enabled=true` tapi `AiService__InternalApiKey` kosong, atau kalau chat nyala tapi `AiChat__OwnerSigningSecret` kosong. Kalau deploy gagal, cek dua secret ini dulu di log Cloud Run.
- Naikkan ke `--memory=1Gi` kalau log menunjukkan OOM. API .NET biasanya cukup dengan 512 MiB ⚠ (belum diukur).

Cek cepat:

```bash
curl -s https://pf-api-${PROJECT_NUMBER}.asia-southeast1.run.app/health/live
curl -s https://pf-api-${PROJECT_NUMBER}.asia-southeast1.run.app/health   # Database dan AI Service harus Healthy
```

---

## Langkah 9. Frontend di Vercel

### 9a. SPA fallback

Buat `apps/frontend/vercel.json` lalu commit:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

Vercel menyajikan file statis lebih dulu sebelum menerapkan rewrite, jadi asset di `dist/assets/` tetap tersaji normal.

### 9b. Import project

Di dashboard Vercel, pilih **Add New > Project**, lalu pilih repo ini:

| Setting | Nilai |
|---|---|
| Root Directory | `apps/frontend` |
| Framework Preset | Vite |
| Install Command | `npm ci` (ada `bun.lockb` dan `package-lock.json` sekaligus, jadi set eksplisit) |
| Build Command | `npm run build` |
| Output Directory | `dist` |

Environment variables (scope Production):

| Variable | Nilai |
|---|---|
| `VITE_API_URL` | `https://pf-api-<PROJECT_NUMBER>.asia-southeast1.run.app` |
| `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Anon key |
| `VITE_AI_CHAT_ENABLED` | `true` |

`VITE_AI_SERVICE_URL` tidak perlu diisi. Variable ini hanya dipakai untuk link `/docs` di halaman status ([statusApi.ts:2](../../apps/frontend/src/api/statusApi.ts#L2)).

Semua `VITE_*` ditanam saat build. Setiap kali nilainya berubah, jalankan **Redeploy** di Vercel.

Preview deploy per PR akan gagal memanggil API karena CORS hanya mengizinkan domain production. Untuk demo itu cukup.

---

## Langkah 10. Tutup lingkaran: CORS dan URL Auth

Setelah domain production Vercel diketahui (misalnya `https://pf-demo.vercel.app`):

1. **CORS API:**

   ```bash
   gcloud run services update pf-api \
     --update-env-vars=Cors__AllowedOrigins__0=https://pf-demo.vercel.app
   ```

2. **Supabase Auth > URL Configuration:** Site URL `https://pf-demo.vercel.app`, Redirect URLs `https://pf-demo.vercel.app/**`.

---

## Langkah 11. Akun demo dan data sintetis

Jangan pernah mengunggah mutasi bank asli ke deployment ini. Gemini free tier boleh memakai input untuk training (lihat PF-149).

1. Di **Authentication > Users > Add user > Create new user**, buat akun demo dengan email dan password kuat, lalu centang auto-confirm.
2. Login ke app di Vercel.
3. Di Settings, muat category rules untuk owner ini, lalu pastikan daftar rules tidak kosong. Category rules disediakan per owner (lihat komentar di `supabase/seed.sql`), jadi akun baru belum punya rules.
4. Upload CSV sintetis. Contohnya ada di `apps/frontend/e2e/fixtures/` (`bca-sample.csv` dan `transaction-template-sample.csv`). Buat dua atau tiga bulan transaksi supaya savings rate dan spending ratio punya angka.
5. Tambah asset, rekening tabungan, liability, dan beberapa investasi sampai L1 sampai L3 di pyramid terlihat menarik dan minimal satu quest selesai.
6. Kalau AI chat nyala, coba satu pertanyaan supaya embedding transaksi terisi.

Kalau interviewer akan diberi akses sendiri, buat akun kedua yang terpisah dan jangan bagikan akun owner.

---

## Langkah 12. Smoke test dan pengukuran

| Cek | Cara | Lulus kalau |
|---|---|---|
| Liveness | `curl .../health/live` di API | 200 |
| Readiness | `curl .../health` di API | Database dan AI Service Healthy |
| `/mcp` tertutup | `curl .../mcp/` di AI service | 404 |
| Signup mati | Coba daftar dari halaman sign-in, atau `POST https://<ref>.supabase.co/auth/v1/signup` dengan anon key | Ditolak |
| Login | Browser | Masuk ke `/journey` |
| Import CSV | Upload `bca-sample.csv` | Transaksi tersimpan, pyramid dihitung ulang |
| Upload PDF | Upload satu PDF sintetis | Hasil ekstraksi muncul |
| Chat | Tanya satu pertanyaan | Jawaban streaming muncul |
| Refresh di route dalam | Buka `/cashflow` lalu tekan F5 | Halaman tetap muncul (SPA fallback jalan) |
| Cold start | Diamkan 20 menit, lalu ukur request pertama ke `/health/live` | Catat angkanya. Target di bawah 10 detik. |
| RAM | Cloud Run > pf-ai > Metrics > Memory utilization | Puncak di bawah 80% dari `--memory` |

Tulis angka cold start dan RAM ke bagian 3 di [deployment-hosting-comparison.md](deployment-hosting-comparison.md) untuk menggantikan tanda ⚠.

---

## Langkah 13. Pagar pengaman

1. `--max-instances=1` di kedua service. Pastikan dengan `gcloud run services describe pf-api --format='value(spec.template.metadata.annotations)'`.
2. Budget alert $2 sudah aktif (Langkah 4).
3. Gemini key berasal dari project AI Studio **tanpa billing**, sehingga pemakaian berlebih kena rate limit, bukan tagihan. Di Google Cloud Console, batasi key itu ke Generative Language API saja.
4. Signup Supabase mati, dan password akun demo kuat.
5. Secret baru dibuat khusus untuk cloud, tidak ada yang sama dengan `.env` lokal.
6. Item yang bisa memunculkan biaya beberapa sen per bulan ⚠: storage Artifact Registry di atas 0.5 GB (image AI service kemungkinan lebih dari 1 GB), secret aktif di atas enam, dan menit Cloud Build di atas jatah gratis. Cek halaman Billing setelah satu minggu pertama.

**Mematikan semuanya** kalau demo sudah selesai atau ada pemakaian aneh:

```bash
gcloud run services delete pf-api pf-ai --region=asia-southeast1
```

Supabase bisa di-pause dari dashboard. Data tetap ada.

---

## Langkah 14. Ritual sebelum interview

| Kapan | Aksi |
|---|---|
| H-1 | Buka dashboard Supabase. Kalau project ter-pause (setelah 7 hari tanpa aktivitas), klik Resume dan tunggu sampai statusnya hijau. |
| H-1 | Login ke app, lalu cek journey, satu import, dan satu chat. |
| 10 menit sebelum | Buka app sekali dan panggil `/health` supaya API dan AI service hangat. |
| Saat demo | Pakai akun demo, bukan akun owner. |

---

## Langkah 15. Auto deploy setiap merge ke `main`

Workflow-nya sudah ada di [.github/workflows/deploy.yml](../../.github/workflows/deploy.yml). Workflow ini aman di-merge sebelum GCP siap, karena tidak berjalan sampai variable repo `DEPLOY_ENABLED` bernilai `true`.

### 15a. Cara kerjanya

Setiap push ke `main` (termasuk merge PR) menjalankan CI. Kalau CI hijau, workflow `Deploy` berjalan dengan urutan berikut:

| Job | Isi | Kapan jalan |
|---|---|---|
| `plan` | Membaca tag image yang sedang berjalan di `pf-ai` dan `pf-api`, lalu membandingkan folder service dengan commit tersebut | Selalu |
| `migrate` | `supabase db push` ke project cloud | Selalu. Tidak melakukan apa-apa kalau tidak ada migration baru. |
| `deploy-ai` | Build image, push ke Artifact Registry, deploy ke Cloud Run, lalu cek `/health` dan pastikan `/mcp/` 404 | Hanya kalau `services/ai-service/` berubah |
| `deploy-api` | Sama untuk API, lalu cek `/health/live` | Hanya kalau `apps/api/` berubah. Menunggu `deploy-ai` selesai. |
| `deploy-frontend` | `vercel pull`, `vercel build`, `vercel deploy --prod` | Selalu, setelah backend selesai |

Beberapa sifat yang perlu diketahui:

- **CI merah berarti tidak ada deploy.** Workflow hanya jalan kalau CI di `main` sukses.
- **Hanya image yang diganti.** `gcloud run deploy --image` menyalin env var dan secret dari revisi sebelumnya. Perubahan config tetap dilakukan manual dengan `gcloud run services update`.
- **Perbandingan memakai commit yang sedang berjalan, bukan push terakhir.** Kalau beberapa push berdekatan dan salah satu run terlewat, perubahan di run itu tetap ikut terdeploy di run berikutnya.
- **Satu deploy dalam satu waktu.** Deploy yang sedang berjalan tidak pernah dibatalkan di tengah migration.
- **Migration berjalan sebelum kode baru.** Migration harus kompatibel dengan kode lama yang masih berjalan. Untuk perubahan destruktif seperti drop atau rename kolom, pecah jadi dua PR: tambah dulu, lalu hapus setelah kode baru live.
- **Supabase yang ter-pause membuat `migrate` gagal.** Resume project dari dashboard, lalu re-run workflow.
- **Deploy manual tetap bisa.** Pakai Actions > Deploy > Run workflow. Centang `force` untuk rebuild semua service.

### 15b. Workload Identity Federation (GitHub ke GCP tanpa key JSON)

```bash
PROJECT_ID=<project-id>
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
REPO=rikky-hermanto/personal-finance

# Service account khusus deploy
gcloud iam service-accounts create pf-deployer --display-name="pf GitHub deployer"
DEPLOYER=pf-deployer@$PROJECT_ID.iam.gserviceaccount.com

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$DEPLOYER" --role=roles/run.developer
gcloud artifacts repositories add-iam-policy-binding pf --location=asia-southeast1 \
  --member="serviceAccount:$DEPLOYER" --role=roles/artifactregistry.writer
# Boleh membuat revisi yang berjalan sebagai pf-run
gcloud iam service-accounts add-iam-policy-binding pf-run@$PROJECT_ID.iam.gserviceaccount.com \
  --member="serviceAccount:$DEPLOYER" --role=roles/iam.serviceAccountUser

# Pool dan provider OIDC, hanya untuk repo ini dan branch main
gcloud iam workload-identity-pools create github --location=global --display-name="GitHub"
gcloud iam workload-identity-pools providers create-oidc github-repo \
  --location=global --workload-identity-pool=github \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
  --attribute-condition="assertion.repository=='$REPO' && assertion.ref=='refs/heads/main'"

gcloud iam service-accounts add-iam-policy-binding $DEPLOYER \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/$REPO"

echo "GCP_WIF_PROVIDER=projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/github-repo"
```

Attribute condition `refs/heads/main` membuat workflow dari branch lain atau dari fork tidak bisa memakai identitas ini.

### 15c. Vercel: matikan auto deploy bawaan untuk `main`

Tanpa langkah ini, Vercel mendeploy frontend langsung saat push, sebelum CI selesai dan sebelum backend baru live. Tambahkan blok `git` ke `apps/frontend/vercel.json`. Preview deploy per PR tetap jalan.

```json
{
  "git": { "deploymentEnabled": { "main": false } },
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

Ambil ID dan token:

1. Jalankan `npx vercel link` di root repo, lalu baca `orgId` dan `projectId` dari `.vercel/project.json`. Folder `.vercel/` jangan di-commit.
2. Buat token di Vercel > Account Settings > Tokens, dengan scope ke team atau akun yang memegang project.

### 15d. Isi variable dan secret di GitHub

Buat environment `production` di Settings > Environments, tanpa required reviewer supaya deploy tetap otomatis. Lalu:

```bash
# Environment variables (bukan rahasia)
gh variable set GCP_PROJECT_ID    --env production --body "<project-id>"
gh variable set GCP_REGION        --env production --body "asia-southeast1"
gh variable set GCP_WIF_PROVIDER  --env production --body "projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/github/providers/github-repo"
gh variable set GCP_DEPLOY_SA     --env production --body "pf-deployer@<project-id>.iam.gserviceaccount.com"
gh variable set VERCEL_ORG_ID     --env production --body "<orgId>"
gh variable set VERCEL_PROJECT_ID --env production --body "<projectId>"

# Environment secrets (gh akan meminta nilainya, sehingga tidak masuk history shell)
gh secret set SUPABASE_DB_URL --env production   # session pooler URL format postgresql://, password di-URL-encode
gh secret set VERCEL_TOKEN    --env production

# Saklar utama, di level repo, dinyalakan paling akhir
gh variable set DEPLOY_ENABLED --body "true"
```

### 15e. Uji pertama

1. Jalankan Actions > Deploy > Run workflow dengan `force` dicentang. Ini menguji semua job sekaligus.
2. Setelah hijau, buat PR kecil yang hanya mengubah `apps/frontend/`, lalu merge. Ringkasan job `plan` harus menulis `ai-service=false, api=false, frontend=true`.
3. Cek Vercel bahwa push ke `main` tidak lagi membuat deployment dari integrasi git, dan hanya ada deployment dari CLI.

**Rollback** kalau revisi baru bermasalah:

```bash
gcloud run revisions list --service=pf-api --region=asia-southeast1
gcloud run services update-traffic pf-api --region=asia-southeast1 --to-revisions=<revisi-lama>=100
```

Untuk frontend, pakai "Promote to Production" di deployment lama dari dashboard Vercel. Migration tidak di-rollback otomatis. Perbaiki dengan migration baru.

---

## Langkah 16. Fase 2 (opsional)

1. **Grafana Cloud.** Buat stack Free, ambil OTLP endpoint dan token. Ubah exporter .NET ke `OtlpExportProtocol.HttpProtobuf` dan exporter Python ke `opentelemetry.exporter.otlp.proto.http`, keduanya membaca `OTEL_EXPORTER_OTLP_ENDPOINT` dan `OTEL_EXPORTER_OTLP_HEADERS` dari env. Simpan header auth sebagai secret ketujuh.
2. **Langfuse.** Isi `LANGFUSE_PUBLIC_KEY` di env file AI service, lalu tambah secret `LANGFUSE_SECRET_KEY`.
3. **IAM invoker untuk AI service.** Ganti `--allow-unauthenticated` dengan `--no-allow-unauthenticated`, beri `pf-run` role `roles/run.invoker`, lalu buat API mengirim ID token Google ke AI service.
4. **Custom domain.** Pasang di Vercel untuk frontend. API bisa memakai domain mapping Cloud Run ⚠ (belum tersedia di semua region) atau tetap memakai `*.run.app`.
