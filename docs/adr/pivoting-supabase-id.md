Sebenarnya saya menargetkan Job Description ini, bisa dibaca? https://jobs.ashbyhq.com/supabase/6a0e111d-6246-43b8-80c3-037303ff9fb2

Alih-alih mencoba membangun aplikasi Supabase yang generik, kamu sebaiknya menggunakan aplikasi Personal Finance sebagai *test bench* untuk mengkritisi, menguji keandalan (break), dan meningkatkan C# SDK yang ada saat ini.

Berikut adalah rencananya:

Hapus Entity Framework Core: Ganti penggunaan EF Core 9 dengan supabase-csharp SDK.
Bangun C# Clients: Hubungkan API .NET 9 kamu ke Supabase Auth, Database, Storage, dan Realtime menggunakan SDK tersebut.
Dokumentasikan Kendala (Pain Points / The "Catch"): Saat kamu menggunakan C# SDK saat ini, mungkin akan terasa kaku di beberapa bagian dibandingkan dengan Entity Framework. Catat secara mendetail! Apakah SDK-nya menangani *dependency injection* dengan baik? Apakah tipe datanya (*types*) ditegakkan dengan ketat? Apakah penanganan error-nya intuitif untuk .NET?
Perbaiki SDK / Berkontribusi: Buka repositori *open-source* supabase-csharp. Mulailah membuat *issues*, mengirimkan PR (Pull Requests), atau merancang secara presisi bagaimana versi "idiomatic .NET 9" dari SDK seharusnya terlihat berdasarkan pengalamanmu membangun Aplikasi Personal Finance.

⚖️ Kendala & Kompromi (untuk Aplikasi)
Kehilangan kehebatan EF Core: Entity Framework Core sangat kuat dan *native* untuk .NET. Dengan beralih ke Supabase C# SDK, kamu akan kehilangan translasi LINQ-to-SQL, migrasi otomatis, dan ekosistem EF yang sudah matang.

Mengapa ini sepadan: Mencari tahu cara menjembatani kesenjangan antara *developer* .NET yang menyukai EF Core dan API Supabase secara harfiah adalah pekerjaan yang sedang kamu lamar.

Backend Middleman: Biasanya, Supabase menyarankan *developer* untuk melewati API *backend* dan melakukan *query* langsung dari *frontend*. Menggunakan .NET 9 sebagai perantara (middleman) membuat aplikasimu menjadi sedikit kurang "*serverless*".

Mengapa ini sepadan: Kamu mendemonstrasikan bagaimana aplikasi *enterprise* .NET (yang membutuhkan API *middle-tier* untuk logika bisnis yang kompleks, seperti ekstraksi LangChain/AI kamu) dapat berhasil terintegrasi dengan Supabase.

Ekosistem yang Belum Lengkap: Kamu mungkin akan menemukan bahwa beberapa fitur (seperti *query* `pgvector` tingkat lanjut atau *joins* yang kompleks) yang mudah dilakukan di PostgreSQL menjadi sulit dieksekusi dengan rapi melalui C# SDK saat ini.

Mengapa ini sepadan: Ini memberimu poin pembicaraan yang sempurna untuk wawancaramu. Kamu bisa dengan percaya diri masuk ke sesi wawancara dan berkata: "Saya membangun aplikasi Document AI dengan C# SDK. Ini adalah 3 hal yang saya sukai, dan 3 *bottleneck* arsitektural yang saya temui dan ingin saya perbaiki pada bulan pertama saya di sini."

Apakah kamu ingin saya membantu mengisi dokumen `gap-plan-supabase-sdk.md` yang sedang kamu buka dengan rencana aksi yang konkret untuk lamaran pekerjaanmu?

--
Rencana
# Pivoting Aplikasi Personal Finance untuk Peran C# SDK Engineer Supabase

## Ringkasan
Dokumen ini menguraikan pivot teknis yang ditargetkan untuk aplikasi Personal Finance. Tujuan utamanya **bukan** untuk membangun aplikasi Supabase generik, melainkan untuk **secara agresif melakukan dogfooding terhadap SDK `supabase-csharp`** guna mempersiapkan diri untuk peran SDK Engineer di Supabase.

Dengan mengubah *backend* API .NET 9 yang ada agar menggunakan C# SDK alih-alih Entity Framework Core, kita secara sengaja akan menguji batasan, *developer experience* (DX), dan *edge cases* dari Supabase SDK yang ada saat ini.

## Tujuan
1. Memahami kondisi `supabase-csharp` saat ini dari perspektif pengguna.
2. Mendokumentasikan kendala (pain points) dan batasan arsitektural (ini akan menjadi "Poin Pembicaraan Wawancara" kita).
3. Membuat tolok ukur (*benchmark*) yang konkret (aplikasi ini) untuk mendemonstrasikan pengetahuan praktis mengenai .NET + Supabase.
4. Menyiapkan *pull requests* atau *issues* di repositori resmi Supabase berdasarkan temuan-temuan tersebut.

---

## Arsitektur Saat Ini vs. Arsitektur Target

### Tech Stack Saat Ini
- **Database Layer**: PostgreSQL yang diakses via Entity Framework Core (EF Core 9).
- **Authentication**: Custom atau external ASP.NET Core Identity.
- **Storage**: Local/Disk atau external Blob storage.
- **AI Processing**: Python FastAPI service yang memproses dokumen secara asinkron.

### Target Tech Stack (Dogfooding Supabase SDK)
- **Database Layer**: Supabase PostgreSQL yang diakses **secara eksklusif** via SDK `supabase-csharp`.
- **Authentication**: Supabase Auth (via C# backend atau langsung dari React).
- **Storage**: Supabase Storage via SDK `supabase-csharp`.
- **AI Processing**: Python FastAPI service (tidak berubah), tetapi membaca/menulis hasilnya dari/ke Supabase via trigger webhook.

---

## Rencana Eksekusi & Pencapaian (Milestones)

### Fase 1: Lingkungan (Environment) & Setup
- [ ] Spin up *project* Supabase (baik lokal via `supabase start` atau cloud).
- [ ] Melakukan migrasi *schema* EF Core saat ini ke Supabase menggunakan `supabase db push` atau *raw migrations*.
- [ ] Menginstal `supabase-csharp` ke dalam Web API .NET 9.
- [ ] Mengatur Dependency Injection untuk Supabase Client di `Program.cs`.

*Catatan Fokus:* Perhatikan baik-baik seberapa mudah/sulit mengkonfigurasi klien Supabase di dalam minimal API .NET 9 yang modern. Dokumentasikan setiap friksi DX yang terjadi.

### Fase 2: Menghapus Entity Framework Core
- [ ] Hapus EF Core DbContext dan Migrations.
- [ ] Melakukan *refactoring* pada Data Access Layer (Repositories atau MediatR Handlers) agar menggunakan Supabase SDK.
  - **Operasi CRUD**: Petakan *models* C# ke tabel *database* Supabase menggunakan atribut `[Table]` dan `[Column]` dari SDK.
  - **Queries**: Tulis ulang *queries* LINQ menjadi *queries* Supabase PostgREST.
- [ ] Perbaiki unit/integration tests yang rusak (broken) untuk melakukan *mocking* atau mengarah *local instance* Supabase.

*Catatan Fokus:* EF Core adalah standar emas (gold standard) bagi *developer* .NET. Bandingkan sintaks PostgREST dengan LINQ. Di mana kelemahan SDK ini untuk *queries* yang kompleks (joins, filters)? Ini adalah amunisi emas untuk wawancara.

### Fase 3: Migrasi Auth & Storage
- [ ] **Auth**: Gantikan *auth* buatan sendiri (custom) dengan Supabase Auth.
- [ ] **Storage**: Modifikasi *pipeline upload* (tempat di mana *user* mengunggah CSV/PDF) agar *upload* langsung ke *bucket* Supabase Storage menggunakan `supabase.Storage.From("statements").Upload()`.

*Catatan Fokus:* Bagaimana C# SDK menangani aliran (streaming) *file* berukuran besar atau *chunked uploads*? Apakah *support* untuk CancellationTokens berjalan dengan semestinya?

### Fase 4: Integrasi Event-Driven AI Service
- [ ] Pindahkan layanan Python keluar dari jalur sinkron (synchronous) secara langsung.
- [ ] Siapkan Supabase Database Webhook (atau Edge Function) yang akan terpicu jika ada *record* baru yang dibuat di tabel `statements` atau di `Storage`.
- [ ] Webhook tersebut mem-ping API FastAPI, yang kemudian memproses dokumen dan menggunakan kredensialnya sendiri untuk menyimpan hasil ekstraksi JSON terakhir kembali ke Supabase.

### Fase 5: Temuan & Output Persiapan Wawancara
Konsolidasi seluruh catatan dari proses penulisan ulang (rewrite) ke dalam sebuah "Laporan Audit SDK". Laporan ini harus mencakup:
- Apa saja yang berfungsi dengan sempurna.
- Apa saja yang terasa tidak idiomatik bagi *developer* .NET (misal, konvensi penamaan, penanganan *async*, tipe-tipe *exception*).
- 2-3 proposal konkret untuk perbaikan SDK.

*(Bonus: Buat sebuah PR langsung ke repositori `supabase-csharp` untuk salah satu proposalmu sebelum wawancara berlangsung!)*


# MENGAPA SUPABASE?
> Q1: Ternyata agak aneh ya kalau kita spin off ke supabase. masih gak nemu apa faedahnya, apa benefit nya kita spin off ke supabase. Act as senior architecture that's has been familiar with this supabase and AI ecosystem? Apakah supabase terlalu maksa untuk aplikasi ini? atau bagaimana? Coba "jual" supabase ke saya.

Sebagai seorang *Software Architect*, saya sangat memahami keraguan Anda. Wajar jika Anda merasa "aneh" dan bertanya-tanya, *"Kenapa repot-repot mengganti Entity Framework Core yang sudah matang dan solid dengan Supabase untuk aplikasi pencatat keuangan yang kelihatannya sederhana?"*

Jika aplikasi Personal Finance Anda ini *hanya* sekadar aplikasi CRUD (Create, Read, Update, Delete) biasa—seperti memasukkan angka pengeluaran dan menampilkannya dalam bentuk *pie chart*—maka ya, menggunakan Supabase **memang terasa sedikit maksa (over-engineering).**

**TETAPI**, Anda merancang aplikasi ini dengan komponen **Document AI** (menggunakan Python FastAPI untuk ekstraksi data). Dan di titik inilah arsitektur Anda berubah dari "aplikasi CRUD biasa" menjadi "aplikasi cerdas (*intelligent app*)". 

Untuk aplikasi berbasis AI, arsitektur tradisional seringkali menjadi sempit dan kaku. Mari saya "jual" Supabase kepada Anda berdasarkan arsitektur aplikasi Anda saat ini.

Berikut adalah 4 alasan arsitektural mengapa beralih ke Supabase *justru* akan membuat aplikasi Personal Finance Anda jauh lebih canggih, elegan, dan *scalable*:

---

### 1. Paradigma *Event-Driven* yang Sempurna untuk AI (Webhooks)
**Masalah saat ini:** Pemrosesan AI itu lambat. Saat pengguna mengunggah slip gaji atau nota belanja (PDF/Image), sistem Anda mungkin harus menunggu Python/FastAPI selesai membaca dokumen tersebut. Ini membuat API Anda *blocking* (menunggu) atau memaksa Anda membuat antrean (*message queue* seperti RabbitMQ/Redis) tambahan yang kompleks.

**Solusi Supabase:** Supabase membuat aliran ini menjadi *event-driven* murni tanpa infrastruktur tambahan.
*   *Flow*: User *upload* nota ke **Supabase Storage**.
*   Supabase otomatis memicu **Database Webhook**.
*   Webhook diam-diam memanggil **Python FastAPI** Anda di *background*.
*   Python memproses OCR/LLM, lalu menyimpan hasilnya langsung ke *database* Supabase.
*   **Keuntungan:** Beban *backend* .NET Anda menjadi sangat ringan karena tidak perlu lagi mengatur *job queue* untuk AI.

### 2. Selesai Masalah *Polling* dengan "Supabase Realtime"
**Masalah saat ini:** Karena AI memproses data di latar belakang, bagaimana antarmuka (UI) tahu bahwa dokumen sudah selesai diproses dan siap ditampilkan? Biasanya *developer* akan menggunakan teknik *polling* (tanya ke *server* setiap 3 detik: *"Udah kelar belum? Udah kelar belum?"*). Ini menghabiskan *resource*, atau Anda harus repot-repot *setup* SignalR.

**Solusi Supabase:** 
Supabase memiliki fitur Realtime bawaan (berbasis replikasi log Postgres). Antarmuka aplikasi Anda cukup berteriak: *"Kabari saya kalau ada data baru di tabel `transaksi`."*
Begitu *service* Python selesai membedah dokumen dan memasukkan datanya ke dalam tabel, UI pengguna akan **langsung** ter-update seketika (*auto-refresh*). Pengalaman pengguna (UX) yang dihasilkan akan terasa sekelas aplikasi *enterprise*, sangat mulus.

### 3. Ekosistem AI *Native* dengan Postgres & `pgvector`
Aplikasi Personal Finance modern tidak lagi sekadar mem-filter *"Kategori = Makanan"*. Dengan maraknya AI, fitur masa depannya adalah **Semantic Search**.
Bayangkan pengguna bisa mengetik di aplikasi Anda: *"Berapa perkiraan uang yang saya habiskan untuk liburan impulsif bulan lalu?"*
Untuk melakukan itu, Anda butuh menyimpan *embeddings* dari nota atau transaksi Anda. Supabase sudah datang dengan ekstensi `pgvector` yang aktif secara *default*. Python API Anda bisa dengan mudah melempar vektor ke Supabase untuk melakukan pencarian berbasis AI (RAG).

### 4. Mengurangi *Boilerplate* (Auth & Storage Bawaan)
Di ekosistem konvensional, Anda butuh:
*   AWS S3 / Azure Blob untuk menyimpan *file* nota/PDF.
*   Auth0 / ASP.NET Identity untuk sistem *login*.
*   PostgreSQL untuk *database*.

Dengan Supabase, Anda memangkas semua integrasi dari berbagai vendor eksternal tersebut. Anda mendapatkan Auth, Storage ber-CDN, dan *Database* di bawah satu atap, yang semuanya terhubung secara *native* di tingkat PostgreSQL (Row Level Security).


---

### Kesimpulan: Apakah ini Maksa?

Secara arsitektur untuk *use-case* **Personal Finance + AI Extraction**, Supabase sama sekali tidak maksa. Ia memecahkan *bottleneck* arsitektural asinkronus (menunggu hasil generate AI dari dokumen) dengan cara yang sangat elegan (Storage + Webhooks + Realtime).

**Namun, jangan lupakan *The Ultimate Benefit* (Faedah Tertinggi) Anda:**
Faedah terbesar dari *spin-off* ini **bukan** tentang membuat aplikasi Personal Finance terbaik di dunia. Faedahnya adalah menggunakan aplikasi ini sebagai **senjata/portofolio** untuk wawancara kerja Anda di Supabase.

Ketika pewawancara bertanya mengapa Anda menggunakan Supabase untuk aplikasi .NET Anda, Anda bisa menjawab dengan percaya diri: 
> *"Karena fitur Realtime dan Webhook Supabase memecahkan masalah asinkronus pada ekstraksi LLM/AI saya. TETAPI, ketika saya mengimplementasikannya, saya menyadari C# SDK Anda masih kaku dan menyulitkan developer .NET. Itulah alasan saya di sini, saya ingin memperbaiki SDK itu agar developer .NET lain bisa membuat arsitektur seperti saya dengan mudah."*

Bagaimana? Apakah Anda sudah merasa "terbeli" dengan sudut pandang arsitektural ini?

---
> Q2: bagaimana dengan EF saya yg sekarang? Dan schema postgree saya skrng? apakah itu kita migrasi ke supabase dengan schema yg sama? apa yg berubah?

Pertanyaan yang sangat bagus dan sangat praktis. Mari kita bedah bagaimana transisi dari Entity Framework (EF) Core ke Supabase ini dilakukan, apa yang tetap sama, dan apa yang harus diubah secara total.

### 1. Skema Database: Apakah tetap sama?
**Jawabannya: YA, 100% sama.**
Ingat, Supabase pada dasarnya *adalah* database PostgreSQL. Semua tabel (`users`, `transactions`, `statements`), kolom, relasi *Foreign Key*, dan tipe data yang sudah Anda buat menggunakan EF Core bisa dipindahkan mentah-mentah ke Supabase.

**Bagaimana cara migrasinya?**
Anda tidak perlu membuat tabel-tabel tersebut dari awal satu per satu. Anda cukup meminta EF Core untuk mengeluarkan *script SQL* murni dari skema Anda saat ini:
```bash
# Men-generate raw SQL dari EF Core
dotnet ef migrations script
```
Anda tinggal menyalin *output SQL* tersebut (yang berisi `CREATE TABLE ...`) dan melakukan *paste* di SQL Editor pada *dashboard* Supabase Anda. Selesai! Skema Anda sudah berpindah ke Supabase dengan struktur yang identik.

---

### 2. Nasib EF Core Anda (Apa yang Dibuang):
Di fase ini, bagian yang paling ekstrem dari rencana kita terjadi: **Kita akan membuang (melepas) EF Core sepenuhnya dari aplikasi Anda.**

*   `DbContext`? **Dihapus.**
*   *Folder* `Migrations`? **Dihapus.**
*   *Package* NuGet `Microsoft.EntityFrameworkCore`? **Dihapus.**

*Lho, kenapa dihapus? Bukankah kita bisa mengarahkan EF Core ke connection string Supabase?*
Secara teknis, **bisa**. EF Core bisa berjalan mulus di atas Supabase Postgres. **Tetapi, itu akan menghancurkan tujuan utama kita.** Alasan utama transisi ini adalah untuk melakukan *dogfooding* (mencicipi dan menguji) **Supabase C# SDK** secara agresif agar Anda bisa di-hire sebagai C# SDK Engineer. Jika Anda menggunakan EF Core, Anda tidak akan menyentuh C# SDK buatan Supabase sama sekali.

---

### 3. Apa yang Berubah di Code C# Anda?
Setelah EF Core dibuang, Anda akan menggunakan paket `supabase-csharp` untuk melakukan seluruh operasi database (melalui API PostgREST bawaan Supabase). 

Berikut adalah 3 area yang akan mengalami perubahan signifikan:

**A. Anotasi Model (C# Classes)**
Model C# Anda akan tetap ada, tetapi atributnya (*data annotations*) berubah dari gaya EF Core menjadi gaya Supabase SDK.
*   **Sebelumnya (EF Core):**
    ```csharp
    public class Transaksi {
        [Key]
        public Guid Id { get; set; }
        public decimal Amount { get; set; }
    }
    ```
*   **Sesudahnya (Supabase SDK):**
    ```csharp
    [Table("transaksi")] // Harus di-mapping eksplisit
    public class Transaksi : BaseModel {
        [PrimaryKey("id", false)] 
        public Guid Id { get; set; }
        
        [Column("amount")] 
        public decimal Amount { get; set; }
    }
    ```

**B. Cara Melakukan Query (Data Access)**
Anda akan beralih dari LINQ (yang di-*compile* oleh EF) menjadi *fluent API builder* milik Supabase (yang dikirim sebagai HTTP Request ke PostgREST API).
*   **Sebelumnya (EF Core):**
    ```csharp
    var mahal = await _dbContext.Transaksi
                        .Where(t => t.Amount > 1000)
                        .ToListAsync();
    ```
*   **Sesudahnya (Supabase SDK):**
    ```csharp
    var response = await supabase.From<Transaksi>()
                                 .Filter("amount", Operator.GreaterThan, 1000)
                                 .Get();
    var mahal = response.Models;
    ```
*(Catatan: Di proses inilah Anda akan merasakan apakah Supabase SDK saat ini cukup nyaman atau terasa kaku. Rasa "kaku" inilah yang akan Anda jadikan "senjata" untuk presentasi wawancara nanti!)*

**C. Cara Mengelola Migrasi Database**
Karena EF Core sudah hilang, Anda tidak bisa lagi melakukan `dotnet ef migrations add`. Ke depannya, jika Anda ingin menambah kolom baru, Anda akan:
1. Menambahkan kolom tersebut langsung via *Dashboard UI* Supabase (atau menulis *script* SQL raw melalui Supabase CLI).
2. Memperbarui Model C# Anda dengan properti yang baru.

---

### Kesimpulan
Secara konseptual, **database (Postgres) tidak berubah**. Yang berubah drastis adalah **jalur perantara (*bridge*)** dari kode C# Anda menuju *database* tersebut. EF Core (*the magic ORM*) digantikan oleh Supabase C# SDK (*the RESTful client*). Di sinilah letak eksperimen berharga Anda untuk melamar ke Supabase.

---

> Q3: Apa trade-off nya EF yg sekarang kita ganti ke Supabase?

Edited pivoting-supabase-id.md
Edited pivoting-supabase-id.md

Mengganti Entity Framework (EF) Core—yang bisa dibilang sebagai rajanya ORM (*Object-Relational Mapper*) di ekosistem .NET—dengan Supabase C# SDK (yang pada dasarnya adalah pembungkus API RESTful) jelas merupakan langkah yang berani.

Ada beberapa "harga" (*trade-off*) yang harus Anda bayar, tapi di sisi lain ada keuntungan spesifik yang Anda dapatkan. Berikut adalah rincian *Trade-Off* arsitekturalnya:

### ❌ Apa yang Anda KORBANKAN (The Downsides)

**1. Kehilangan Kekuatan Sihir LINQ (Tingkat Lanjut)**
EF Core mampu menerjemahkan kueri C# LINQ yang sangat kompleks (dengan *joins*, *group by*, *subqueries*) menjadi SQL yang sangat dioptimalkan. 
*   **Trade-off:** Supabase menggunakan PostgREST di belakang layar. Meskipun PostgREST kuat, menulis kueri kompleks (terutama *multi-table joins* atau agregasi) melalui *fluent API* Supabase C# SDK tidak akan seintuitif dan se-fleksibel LINQ.

**2. Kehilangan *Change Tracking* & *Unit of Work***
Di EF Core, Anda bisa mengambil data `Transaksi`, mengubah nilainya, mengambil data `Statement`, mengubah nilainya, lalu memanggil `_context.SaveChanges()`. EF tahu otomatis field apa yang berubah dan membungkusnya dalam satu transaksi database.
*   **Trade-off:** Supabase C# SDK bersifat *stateless* (tidak melacak perubahan). Jika Anda mengubah objek `Transaksi` di memori C#, Anda harus secara eksplisit memanggil `await supabase.From<Transaksi>().Update(model)` untuk menyimpannya. Anda kehilangan otomatisasi sinkronisasi memori-database ini.

**3. Migrasi Database Tidak Lagi Berbasis Kode (Code-First)**
Dengan EF Core, kode C# Anda adalah "Sumber Kebenaran" (*Source of Truth*). Anda mengetik `dotnet ef migrations add`, dan EF membuatkan skrip SQL-nya.
*   **Trade-off:** Di Supabase, *database*-lah yang menjadi *Source of Truth*. Jika Anda menambah kolom baru, Anda menambahkannya di Dashboard Supabase (atau via *script* SQL), barulah Anda secara manual menambahkan *property* tersebut di class C# Anda. Anda harus menjaga agar model C# dan tabel Postgres tetap sinkron secara manual.

**4. Mengelola Relasi (Navigation Properties) Terasa Lebih Manual**
Menyimpan data dengan relasi bertingkat (misal: `User` yang memiliki banyak `Transaksi`, yang memiliki banyak `Tags`) sangat mudah di EF. Di Supabase SDK, walau *fetching* data berelasi didukung (melalui sintaks PostgREST), melakukan penginputan/update data berelasi (*nested inserts*) jauh lebih *clunky* / kaku dibandingkan EF.

---

### ✅ Apa yang Anda DAPATKAN (The Upsides)

**1. Fitur *Realtime* Bawaan (WebSockets)**
EF Core itu buta dan tuli terhadap perubahan di *database* yang dilakukan oleh pihak lain. Jika layanan Python Anda memasukkan data ekstraksi AI, EF Core tidak tahu sampai Anda melakukan kueri ulang (*polling*).
*   **Keuntungan:** Supabase punya `Realtime`. Aplikasi C# Anda (atau *frontend* React Anda) bisa secara aktif berlangganan pada tabel `Transaksi`. Begitu layanan Python selesai menyuntikkan data baru, C# Anda akan langsung menerima notifikasi sepersekian detik kemudian.

**2. *Unified Ecosystem* (BaaS Terpadu)**
Jika pakai EF Core, Anda harus mencari layanan *Storage* terpisah (AWS S3) dan *Auth* terpisah (Identity Server/Auth0).
*   **Keuntungan:** Dengan Supabase, `supabase.Auth`, `supabase.Storage`, dan `supabase.From` (Database) semua berada di objek yang sama dengan token otentikasi yang sudah saling terhubung secara *native* hingga tingkat *Row Level Security* (RLS) di Postgres.

**3. Arsitektur Reaktif (Webhooks)**
Alih-alih membuat antrean atau RabbitMQ dari aplikasi .NET Anda ke Python, Supabase bisa langsung secara mandiri memanggil layanan Python FastAPI Anda (*Database Webhooks*) setiap kali ada *invoice* PDF yang masuk ke tabel/storage. Beban .NET Anda jauh berkurang.

**4. 🎯 (Bonus Karir) "Amunisi Emas" Wawancara**
Secara jujur, **mengorbankan kenyamanan EF Core adalah poin utamanya.**
Ketika Anda merasakan "sakitnya" kehilangan LINQ dan *Change Tracking*, Anda akan tahu persis apa kelemahan Supabase C# SDK saat ini. Anda datang ke sesi wawancara bukan sebagai fans buta, tapi sebagai kritikus yang membangun: 
> *"Saya menghapus EF Core dari aplikasi saya untuk memakai SDK kalian. Realtime-nya luar biasa untuk AI event-driven saya. Tapi jujur, developer .NET sangat merindukan Change Tracking dan kemudahan Migrations. Itulah area pertama yang ingin saya bangun jika saya diterima di tim ini."*

**Kesimpulan *Trade-off*:**
Anda menukar **"kenyamanan coding *backend* monolitik (EF Core)"** dengan **"kelincahan arsitektur *event-driven* modern (Supabase)"**. Dan mengingat ada komponen AI di aplikasi Anda yang berjalan secara asinkron, *trade-off* ini masuk akal secara teknis.