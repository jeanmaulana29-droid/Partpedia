# SparepartBase — Database Harga & Spesifikasi Sparepart Mesin Industri

**v2 — Enriched Pipeline.** Proyek ini sudah teruji: scraper v2 sudah dijalankan
dan berhasil menghasilkan 10 baris data sampel dengan skema yang jauh lebih kaya
(cross-reference antar-brand, spec table dinamis, teks pSEO multi-intent) di
`scraper/data/data.json` & `site/src/data/data.json`. Tampilan situs juga sudah
dirombak untuk menampilkan data baru ini.

## Apa yang baru di v2

| Area | v1 | v2 |
|---|---|---|
| Akses situs JS-heavy | Tidak bisa | `RENDER_MODE="dynamic"` via Playwright |
| Header HTTP | Default `requests` | Header browser realistis (praktik standar, bukan evasion) |
| Cross-reference part | Tidak ada | `generate_equivalent_codes()` — kode setara SKF/NSK/NTN/dst. untuk bearing standar ISO |
| Teks pSEO | 1 deskripsi generik | `generate_search_intent_text()` — 5 sudut pencarian (harga, spek, aplikasi, pengganti, standar) |
| Deskripsi unik | Template statis | Opsional AI enrichment via Claude API (`ENABLE_AI_ENRICHMENT`) |
| Skema data | 8 field flat | +`specs_table`, `equivalent_codes`, `vendor_type`, `iso_standard`, `search_intent` |
| Tampilan | Kartu polos | Badge kategori berwarna, cross-reference grid, stats bar, filter kategori, layout 2 kolom di halaman detail |

## Struktur folder

```
sparepart-project/
├── scraper/
│   ├── scraper_sparepart.py   # pipeline v2: akses -> ekstraksi -> ENRICHMENT -> simpan
│   ├── requirements.txt
│   └── data/data.json         # arsip data hasil scraping (skema kaya)
├── .github/workflows/
│   └── scraper.yml            # cron job GitHub Actions (gratis)
├── site/                      # situs Astro (Programmatic SEO engine)
│   ├── astro.config.mjs
│   ├── package.json
│   ├── public/robots.txt
│   └── src/
│       ├── layouts/Layout.astro
│       ├── components/{AdSlot,PartPlate,Badge,EquivalentCodes,SpecsTable}.astro
│       ├── utils/theme.js             # pemetaan warna kategori konsisten
│       ├── data/data.json             # dibaca langsung oleh situs
│       └── pages/
│           ├── index.astro            # homepage + pencarian + filter kategori
│           └── sparepart/[slug].astro # template -> jadi ribuan halaman
└── README.md
```

## Tahap 2 — Cara kerja scraper v2 (sudah teruji jalan)

`scraper/scraper_sparepart.py` punya dua sumbu konfigurasi:

**DEMO_MODE** — sudah dijalankan, hasilkan 10 baris:
- **`True`** (default): scraping SUNGGUHAN dengan BeautifulSoup ke `SAMPLE_HTML`
  bawaan (offline, tanpa internet) — supaya seluruh pipeline TERMASUK lapisan
  enrichment bisa langsung dicoba.
- **`False`**: scraping ke `TARGET_URL` sungguhan.

**RENDER_MODE** — cara mengambil HTML saat `DEMO_MODE=False`:
- **`"static"`** (default): `requests` + header browser realistis. Cukup untuk
  kebanyakan situs HTML biasa.
- **`"dynamic"`**: Playwright — WAJIB dipakai jika situs target memuat tabelnya
  lewat JavaScript (`pip install playwright && playwright install chromium`).

Langkah pindah ke data sungguhan:
1. Buka DevTools browser di situs sumber pilihan Anda → Inspect Element pada tabelnya.
2. Ganti `TARGET_URL`, `ROW_SELECTOR`, `FIELD_SELECTORS` (semua ditandai `# GANTI`).
3. Jika tabelnya baru muncul setelah JS jalan (coba lihat: klik kanan → View
   Page Source, kalau tabelnya tidak ada di situ berarti butuh JS), set
   `RENDER_MODE = "dynamic"` dan sesuaikan `PLAYWRIGHT_WAIT_SELECTOR`.
4. Set `DEMO_MODE = False`, lalu uji lokal:
   ```bash
   cd scraper
   pip install -r requirements.txt
   python scraper_sparepart.py
   ```
5. Script otomatis cek `robots.txt` situs sumber dulu, di KEDUA render mode —
   kalau dilarang, scraping dihentikan otomatis.

### Lapisan enrichment (yang membuat data "powerful", bukan cuma tabel mentah)

- **`generate_equivalent_codes()`** — untuk kategori Bearing dengan kode ISO
  metrik standar (mis. `6205-2RS`), fungsi ini menghasilkan kode setara di
  SKF/NSK/NTN/NACHI/KOYO berdasarkan konvensi akhiran seal/shield yang berlaku
  umum di industri (ISO 15:2019). Untuk kategori/format lain (pillow block,
  filter, dst.) fungsi ini sengaja mengembalikan kosong — lebih baik kosong
  daripada mengarang kode yang belum tentu benar.
- **`generate_search_intent_text()`** — merangkai 5 potongan teks per part,
  masing-masing menyasar niat pencarian berbeda (harga, spesifikasi, aplikasi,
  kode pengganti, standar acuan) — dipakai di halaman detail supaya kontennya
  benar-benar berguna untuk pengunjung dengan kebutuhan berbeda-beda, bukan
  sekadar tabel kosong.
- **`generate_ai_description()`** *(opsional, nonaktif default)* — set
  `ENABLE_AI_ENRICHMENT = True` dan isi secret `ANTHROPIC_API_KEY` untuk
  deskripsi unik per halaman via Claude API — menghindari duplicate/thin
  content saat data sudah ribuan baris.

Penyimpanan data tetap paling sederhana: file `data.json` di repo GitHub, tanpa
database eksternal.

## Sumber data publik yang sudah diverifikasi (untuk `TARGET_URL`)

Saya cek langsung `robots.txt` dan struktur HTML tiap kandidat — bukan tebakan,
dan saya tidak akan mengarang sumber "harga real-time" yang sebenarnya tidak
ada. Faktanya: **tidak ada katalog B2B publik yang sekaligus (a) benar-benar
punya data harga live dan (b) legal/etis untuk di-scraping otomatis.** Yang
mendekati:

| # | URL | Render Mode | Cocok untuk | Status |
|---|-----|-------------|-------------|--------|
| 1 | `v5.inaproc.id` (Katalog Elektronik Pemerintah v5) | `dynamic` | Sparepart + **harga vendor real** | robots.txt tidak memblokir (terverifikasi), tapi konten dimuat via JS — **perlu Anda uji sendiri** dengan Playwright untuk pastikan tabel harga tidak di balik login |
| 2 | `en.wikipedia.org/wiki/Roller_chain` | `static` | Spesifikasi rantai/sprocket | Aman, terverifikasi, TANPA harga |
| 3 | `en.wikipedia.org/wiki/ISO_metric_screw_thread` | `static` | Spesifikasi baut/mur metrik | Aman, terverifikasi, TANPA harga |

**Kenapa saya tidak menyulap sumber "sempurna"**: saya cek langsung dan
laporkan apa adanya, termasuk yang TIDAK direkomendasikan supaya Anda tidak
buang waktu:
- **e-katalog.lkpp.go.id** — robots.txt secara eksplisit melarang akses otomatis.
- **Indotrading / Indonetwork** (marketplace B2B) — direktori supplier, bukan
  tabel spek konsisten, dan datanya aset komersial mereka.

Jika situs target punya proteksi anti-bot AKTIF (Cloudflare challenge, captcha)
walau robots.txt-nya diam, itu sinyal kuat mereka tidak mau di-scraping — kode
di repo ini sengaja TIDAK menyertakan cara menembus proteksi semacam itu.

## Tahap 3 — Mengaktifkan cron job gratis (GitHub Actions)

1. Push proyek ini ke repository GitHub baru (lihat Tahap 5 untuk caranya).
2. **Settings → Actions → General** → set "Workflow permissions" ke
   **Read and write permissions** (agar bot bisa commit data terbaru).
3. Jadwal default: setiap hari jam 03:00 WIB — ubah nilai `cron` di
   `.github/workflows/scraper.yml` sesuai kebutuhan.
4. Uji manual: tab **Actions** → workflow "Scraper Pipeline - Sparepart" →
   **Run workflow**.

> Catatan: selama `DEMO_MODE = True`, workflow ini akan menghasilkan data
> sampel yang sama setiap kali jalan — itu normal untuk tahap uji coba.
> Begitu Anda pindah ke `DEMO_MODE = False` dengan `TARGET_URL` sungguhan,
> cron harian ini mulai benar-benar memperbarui harga & data terbaru.

## Tahap 4 — Menjalankan & menyesuaikan situs

```bash
cd site
npm install
npm run dev      # pratinjau lokal di localhost:4321
npm run build    # build produksi ke folder dist/
```

**Yang baru di tampilan v2:**
- Stats bar di homepage (total part, kategori, jumlah kode cross-reference).
- Kategori jadi badge berwarna (konsisten lewat `src/utils/theme.js`) dan bisa
  diklik untuk filter grid — tidak perlu library search tambahan.
- Halaman detail sekarang 2 kolom (konten utama + sidebar plate part yang sticky
  saat discroll), dengan seksi khusus Cross-Reference antar-brand dan blok
  harga bergaya "label peringatan" (jelas menandai ini estimasi).
- Aksen garis diagonal amber/graphite di atas header — motif hazard-stripe,
  konsisten dengan identitas industrial situs ini.

Yang perlu Anda ganti:
- `astro.config.mjs` → `site:` diisi domain final Anda (wajib benar untuk sitemap).
- `public/robots.txt` → domain sitemap disamakan dengan `astro.config.mjs`.
- `src/layouts/Layout.astro` → nama brand, warna/font, dan baris
  `<script ... adsbygoogle.js?client=ca-pub-XXXX>` (aktifkan setelah disetujui AdSense).
- `src/components/AdSlot.astro` → uncomment blok `<ins class="adsbygoogle">` dan isi
  `ca-pub-XXXX` + `data-ad-slot` sesuai unit iklan di dashboard AdSense Anda.
- `src/utils/theme.js` → ubah `PALETTE` jika ingin skema warna kategori berbeda.

Sitemap dibuat otomatis oleh integrasi `@astrojs/sitemap` setiap `npm run build`
dijalankan → `sitemap-index.xml` & `sitemap-0.xml`, memuat seluruh halaman
`/sparepart/[slug]/` yang di-generate dari `data.json`. Tidak perlu kode tambahan.

**Catatan AdSense**: situs baru biasanya disetujui setelah ada cukup konten asli
dan sedikit traffic organik (beberapa minggu setelah live & terindeks).
Placeholder di `AdSlot.astro` menjaga layout tetap rapi sebelum iklan aktif.

## Tahap 5 — Upload ke GitHub & deploy ke Vercel (online hari ini)

### A. Upload ke GitHub

**Opsi tercepat (tanpa install apa pun) — lewat browser:**
1. Ekstrak/unzip `sparepart-project.zip` di komputer Anda.
2. Buka github.com → login/daftar (gratis) → klik **New repository**.
3. Beri nama, misal `sparepart-base` → pilih **Public** → **Create repository**
   (jangan centang "Add README", supaya repo benar-benar kosong).
4. Di halaman repo kosong itu, klik link **uploading an existing file**.
5. Buka folder hasil ekstrak di File Explorer/Finder Anda, **drag seluruh isi
   folder** `sparepart-project` (bukan folder itu sendiri, tapi isinya:
   `scraper`, `site`, `.github`, `README.md`, `.gitignore`) ke area upload
   GitHub. Browser modern (Chrome/Edge) akan mempertahankan struktur folder.
6. Scroll bawah → **Commit changes**. File Anda sudah online di GitHub.

**Opsi git command line (lebih andal untuk struktur folder banyak):**
```bash
cd sparepart-project
git init
git add .
git commit -m "Initial commit: SparepartBase"
git branch -M main
git remote add origin https://github.com/USERNAME/sparepart-base.git
git push -u origin main
```
(Ganti `USERNAME` dan nama repo sesuai punya Anda; buat repo kosong di GitHub
dulu seperti langkah 2–3 di atas sebelum menjalankan `git push`.)

### B. Deploy ke Vercel

1. Buka vercel.com → **Sign Up** → pilih **Continue with GitHub** (satu klik,
   otomatis terhubung ke repo Anda).
2. Di dashboard Vercel, klik **Add New → Project**.
3. Pilih repository `sparepart-base` yang barusan Anda upload → **Import**.
4. Pada bagian **Root Directory**, klik **Edit** → ketik/pilih `site`
   (wajib — karena proyek Astro ada di subfolder `site`, bukan di root repo).
5. Framework Preset akan otomatis terbaca **Astro**; Build Command
   `npm run build` dan Output Directory `dist` biasanya sudah terisi sendiri.
6. Klik **Deploy** dan tunggu ±1–2 menit.
7. Selesai — Anda dapat URL gratis seperti `sparepart-base.vercel.app`.
   **Situs Anda sudah ONLINE saat ini juga.**

### C. Sambungkan domain ke sitemap (2 menit, penting untuk SEO)

1. Salin URL Vercel Anda (mis. `https://sparepart-base.vercel.app`).
2. Di GitHub, edit `site/astro.config.mjs` → ganti nilai `site:` dengan URL itu.
3. Edit `site/public/robots.txt` → ganti domain di baris `Sitemap:` dengan URL yang sama.
4. Commit langsung di GitHub (tombol pensil ✏️ di setiap file, edit, lalu
   **Commit changes**) — Vercel otomatis rebuild dalam ±1 menit.

### D. Auto-update selamanya

Setiap kali GitHub Actions (Tahap 3) commit `data.json` baru, Vercel otomatis
mendeteksi push tersebut dan me-redeploy situs — dari scraping sampai online
berjalan tanpa Anda sentuh lagi.

### E. Daftarkan ke Google Search Console

1. Buka search.google.com/search-console → **Add property** → masukkan URL Vercel Anda.
2. Verifikasi kepemilikan (metode "HTML tag" paling mudah — tempel tag yang
   diberikan Google ke `<head>` di `site/src/layouts/Layout.astro`, commit, deploy ulang).
3. Menu **Sitemaps** → kirim `sitemap-index.xml` (mis.
   `https://sparepart-base.vercel.app/sitemap-index.xml`).

Netlify adalah alternatif dengan alur hampir identik (Base directory: `site`,
Build command: `npm run build`, Publish directory: `site/dist`).

## Jalur skala berikutnya (opsional)

- **Deskripsi unik per halaman**: sudah bisa lewat `ENABLE_AI_ENRICHMENT=True`
  (panggilan Claude API per part). Kalau volume data sudah ribuan baris,
  pertimbangkan cache hasil AI supaya tidak generate ulang tiap run cron.
- **Harga real-time sungguhan**: `price_range` saat ini indikatif untuk data
  demo. Kandidat paling realistis adalah `v5.inaproc.id` dengan
  `RENDER_MODE="dynamic"` — tapi WAJIB Anda uji & verifikasi sendiri dulu
  (lihat tabel sumber data di atas) sebelum dipakai produksi.
- **Puluhan ribu halaman**: JSON di repo tetap aman sampai skala menengah,
  tapi waktu build Astro akan makin lama. Di titik itu, database seperti
  Supabase (free tier) bisa jadi langkah berikutnya.

## Etika & keberlanjutan scraping

- Selalu hormati `robots.txt` dan Terms of Service situs sumber — script ini
  otomatis berhenti jika dilarang (saat `DEMO_MODE = False`).
- Prioritaskan sumber data resmi/terbuka (distributor yang mempublikasikan
  katalog, data pemerintah) di atas menyalin situs kompetitor komersial.
- Jaga jeda antar-request (`REQUEST_DELAY_SECONDS`) agar tidak membebani server
  sumber — ini juga melindungi IP GitHub Actions Anda dari pemblokiran.
