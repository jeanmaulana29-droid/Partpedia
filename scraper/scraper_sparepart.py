"""
scraper_sparepart.py (v2 — Enriched Pipeline)
Pipeline scraping + ENRICHMENT + ekspor data untuk niche "Database Harga &
Spesifikasi Sparepart Mesin Industri". Penyimpanan: file JSON di repo GitHub.

APA YANG BERUBAH DARI v1:
  1. RENDER_MODE dua pilihan: "static" (requests+BeautifulSoup, cepat & ringan)
     atau "dynamic" (Playwright, untuk situs yang datanya dimuat via JavaScript).
  2. Header HTTP realistis (User-Agent, Accept-Language, dll.) di mode static —
     ini praktik standar yang legal, BUKAN alat untuk menembus proteksi anti-bot
     aktif. robots.txt tetap dicek dan tetap DIHORMATI di kedua mode; jika
     dilarang, pipeline berhenti — titik, tidak ada mode "paksa".
  3. Lapisan ENRICHMENT otomatis: generate_equivalent_codes() (cross-reference
     kode part antar-brand) dan generate_search_intent_text() (teks kaya
     kata kunci untuk pSEO, beberapa sudut pencarian sekaligus).
  4. Skema data jauh lebih kaya: part_number, brand, specs_table, price_range,
     equivalent_codes, vendor_type, iso_standard, search_intent.

CATATAN JUJUR SOAL SUMBER HARGA REAL:
  Kandidat terkuat yang saya temukan & verifikasi adalah v5.inaproc.id
  (Katalog Elektronik Pemerintah versi baru) — robots.txt TIDAK memblokir
  (dua kali fetch berhasil dari sisi saya), dan platform ini secara desain
  menampilkan harga vendor untuk publik (tujuannya transparansi pengadaan).
  TAPI datanya dimuat lewat JavaScript, dan saya TIDAK PUNYA akses internet
  dari sandbox ini untuk menjalankan Playwright sungguhan dan memverifikasi
  selector persis + apakah tabel harga butuh login. Anggap TARGET_URL &
  PLAYWRIGHT_WAIT_SELECTOR di bawah sebagai titik awal yang sudah diriset,
  BUKAN yang sudah terbukti 100% jalan — uji & sesuaikan sebelum produksi.

DUA MODE DATA:
  - DEMO_MODE = True (default): scraping SUNGGUHAN dengan BeautifulSoup ke
    SAMPLE_HTML bawaan (offline, tanpa internet) — supaya seluruh pipeline
    (termasuk enrichment) bisa langsung dicoba & dilihat hasilnya.
  - DEMO_MODE = False: scraping ke TARGET_URL sungguhan sesuai RENDER_MODE.

Jalankan: python scraper_sparepart.py
"""

import json
import logging
import os
import re
import time
from pathlib import Path
from urllib.parse import urljoin
from urllib.robotparser import RobotFileParser

import pandas as pd
import requests
from bs4 import BeautifulSoup

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("scraper_sparepart")

# ============================================================
# KONFIGURASI — GANTI BAGIAN INI SESUAI SUMBER DATA ANDA
# ============================================================

DEMO_MODE = True  # GANTI ke False setelah TARGET_URL & selector sudah diverifikasi

# "static"  = requests + BeautifulSoup (cepat, cukup untuk HTML biasa)
# "dynamic" = Playwright (WAJIB untuk situs yang tabelnya dimuat via JavaScript,
#             mis. kandidat v5.inaproc.id di bawah)
RENDER_MODE = "static"  # GANTI ke "dynamic" jika TARGET_URL butuh JS rendering

# GANTI: URL halaman katalog/listing sparepart sumber data publik.
# Kandidat yang sudah diriset (lihat catatan jujur di docstring atas):
#   https://v5.inaproc.id/publikctr/popularcommoditylist?jenis=Nasional
#   -> perlu RENDER_MODE="dynamic" + verifikasi selector & status login-wall.
TARGET_URL = "https://contoh-sumber-katalog-sparepart.com/daftar-produk"
BASE_URL = "https://contoh-sumber-katalog-sparepart.com"

# Header realistis mode static — ini standar praktik baik (bukan penyamaran
# untuk menembus proteksi anti-bot aktif). Jika situs target punya sistem
# anti-bot aktif (Cloudflare challenge, captcha, dll.), itu sinyal kuat mereka
# tidak mengizinkan scraping — cari sumber lain, jangan coba dilawan.
REALISTIC_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; SparepartBot/1.0; +https://situs-anda.vercel.app/tentang)",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8",
}

MAX_PAGES = 1  # GANTI jika sumber data punya paginasi
PAGE_PARAM = "page"

# GANTI: CSS selector baris data pada halaman target (mode static).
ROW_SELECTOR = "table.product-table tbody tr"
FIELD_SELECTORS = {
    "part_name": "td:nth-child(1)",
    "part_number": "td:nth-child(2)",
    "category": "td:nth-child(3)",
    "brand": "td:nth-child(4)",
    "specification": "td:nth-child(5)",
    "compatible_equipment": "td:nth-child(6)",
    "price_range": "td:nth-child(7)",
    "alternative_parts": "td:nth-child(8)",
}

# Khusus RENDER_MODE="dynamic": selector yang DITUNGGU sebelum HTML diambil
# (Playwright menunggu elemen ini muncul, tanda halaman sudah selesai render JS).
PLAYWRIGHT_WAIT_SELECTOR = "table.product-table"  # GANTI sesuai target
PLAYWRIGHT_TIMEOUT_MS = 20000

OUTPUT_JSON_PATHS = [
    Path(__file__).parent / "data" / "data.json",
    Path(__file__).parent.parent / "site" / "src" / "data" / "data.json",
]

REQUEST_DELAY_SECONDS = 1.5
REQUEST_TIMEOUT = 15
PRICE_DISCLAIMER = "Estimasi pasar, bukan harga real-time — verifikasi ke vendor sebelum membeli"

# --- Enrichment AI (opsional, butuh API key sendiri — nonaktif secara default) ---
ENABLE_AI_ENRICHMENT = False  # GANTI ke True jika ingin deskripsi unik per part via Claude API
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
AI_MODEL = "claude-sonnet-5"

# --- Basis pengetahuan enrichment (standar teknik publik, BUKAN data brand rahasia) ---
# Referensi standar per kategori. Diisi hanya untuk kategori yang benar-benar
# punya standar dimensi/desain universal yang saya yakin akurat — selebihnya
# dibiarkan None (lebih baik kosong daripada mengarang).
CATEGORY_STANDARDS = {
    "Bearing": "ISO 15:2019 (dimensi bantalan bola & rol metrik seri 60/62/63)",
    "V-Belt": "ISO 4184 (profil sabuk-V klasik A/B/C/D)",
    "Sprocket": "ASME/ANSI B29.1 (rantai rol & sprocket)",
    "Motor Listrik": "IEC 60034 (dimensi & rating motor listrik industri)",
    "Selang Hidrolik": "SAE 100R2 / ISO 1436 (selang hidrolik tekanan tinggi)",
}

# Konvensi akhiran kode tipe seal/shield bantalan bola metrik standar — konvensi
# UMUM INDUSTRI (dipakai luas di katalog & panduan interchange), BUKAN data resmi
# dari brand-brand ini. Selalu verifikasi ke katalog resmi sebelum pembelian.
BRAND_SEAL_SUFFIX = {
    "SKF": "-2RS1",
    "NSK": "DDU",
    "NTN": "LLB",
    "NACHI": "2NSE",
    "KOYO": "2RS",
}
# ============================================================

# Contoh halaman katalog sparepart, dipakai HANYA saat DEMO_MODE = True.
SAMPLE_HTML = """
<table class="product-table">
  <tbody>
    <tr><td>Bearing Pillow Block</td><td>UCP205</td><td>Bearing</td><td>Generic/OEM</td><td>Bore 25mm, OD 52mm</td><td>Conveyor, mesin pertanian</td><td>150.000 - 250.000</td><td>UCP205-16, P205</td></tr>
    <tr><td>Deep Groove Ball Bearing</td><td>6205-2RS</td><td>Bearing</td><td>Generic/OEM</td><td>Bore 25mm, OD 52mm, Tebal 15mm</td><td>Motor listrik, pompa air</td><td>35.000 - 65.000</td><td>6205ZZ, 6205LLU</td></tr>
    <tr><td>V-Belt Industri</td><td>A-58</td><td>V-Belt</td><td>Generic</td><td>Profil A, panjang 1473mm</td><td>Mesin jahit industri, blower</td><td>45.000 - 75.000</td><td>A58, Z-58</td></tr>
    <tr><td>Filter Oli Hidrolik</td><td>HF6177</td><td>Filter</td><td>Generic/Aftermarket</td><td>Thread 1-1/2in, tinggi 145mm</td><td>Excavator, forklift</td><td>85.000 - 140.000</td><td>P550388, HF35062</td></tr>
    <tr><td>Seal Oli Poros</td><td>NBR-40x62x8</td><td>Seal</td><td>Generic</td><td>ID 40mm, OD 62mm, Tebal 8mm</td><td>Gearbox, pompa hidrolik</td><td>18.000 - 32.000</td><td>TC40628, SC40628</td></tr>
    <tr><td>Motor Listrik 3 Phase</td><td>MEZ-1.5KW-4P</td><td>Motor Listrik</td><td>Generic</td><td>1.5kW, 4 pole, 1400rpm</td><td>Pompa air, blower industri</td><td>1.850.000 - 2.400.000</td><td>Y90L-4, MEZ90L-4</td></tr>
    <tr><td>Gear Reducer Cacing</td><td>NMRV-050-1:30</td><td>Gear Reducer</td><td>Generic</td><td>Rasio 1:30, poros 19mm</td><td>Conveyor, mixer industri</td><td>650.000 - 950.000</td><td>NMRV050, WPA-050</td></tr>
    <tr><td>Sprocket Rantai Rol</td><td>428H-15T</td><td>Sprocket</td><td>Generic</td><td>15 gigi, pitch 12.7mm</td><td>Konveyor rantai, mesin cetak</td><td>55.000 - 90.000</td><td>428-15T, 08B-15T</td></tr>
    <tr><td>Selang Hidrolik SAE 100R2</td><td>HYD-R2-1/2</td><td>Selang Hidrolik</td><td>Generic</td><td>ID 1/2in, tekanan kerja 275 bar</td><td>Excavator, dump truck</td><td>65.000 - 95.000 /meter</td><td>R2AT-08, 2SN-08</td></tr>
    <tr><td>Kopling Fleksibel</td><td>L-095</td><td>Kopling</td><td>Generic</td><td>Bore 5/8in - 1in, torsi 12Nm</td><td>Pompa ke gearbox</td><td>95.000 - 160.000</td><td>L095, L100</td></tr>
  </tbody>
</table>
"""


# ---------------------------------------------------------------------------
# LAPISAN 1: AKSES DATA (robots.txt, fetch static/dynamic)
# ---------------------------------------------------------------------------

def check_robots_txt(url: str, user_agent: str) -> bool:
    """Selalu cek & hormati robots.txt — berlaku di KEDUA render mode."""
    try:
        parser = RobotFileParser()
        parser.set_url(urljoin(url, "/robots.txt"))
        parser.read()
        allowed = parser.can_fetch(user_agent, url)
        if not allowed:
            log.warning("robots.txt melarang scraping URL ini: %s", url)
        return allowed
    except Exception as e:
        log.warning("Tidak bisa membaca robots.txt (%s) — lanjut dengan hati-hati.", e)
        return True


def fetch_html_static(url: str) -> str:
    resp = requests.get(url, headers=REALISTIC_HEADERS, timeout=REQUEST_TIMEOUT)
    resp.raise_for_status()
    return resp.text


def fetch_html_dynamic(url: str) -> str:
    """
    Render halaman JS-heavy pakai Playwright. Butuh:
        pip install playwright
        playwright install chromium
    Tidak diaktifkan default (RENDER_MODE="static") supaya setup tetap ringan
    untuk kebanyakan sumber data.
    """
    from playwright.sync_api import sync_playwright  # import lokal, opsional

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent=REALISTIC_HEADERS["User-Agent"],
            locale="id-ID",
        )
        page = context.new_page()
        page.goto(url, timeout=PLAYWRIGHT_TIMEOUT_MS, wait_until="networkidle")
        try:
            page.wait_for_selector(PLAYWRIGHT_WAIT_SELECTOR, timeout=PLAYWRIGHT_TIMEOUT_MS)
        except Exception:
            log.warning(
                "Selector '%s' tidak muncul dalam %dms — halaman mungkin butuh "
                "login, atau selector-nya perlu disesuaikan. Mengambil HTML apa adanya.",
                PLAYWRIGHT_WAIT_SELECTOR, PLAYWRIGHT_TIMEOUT_MS,
            )
        html = page.content()
        browser.close()
        return html


def build_page_url(base: str, page: int) -> str:
    if page <= 1:
        return base
    sep = "&" if "?" in base else "?"
    return f"{base}{sep}{PAGE_PARAM}={page}"


def get_source_html(page: int = 1) -> str:
    if DEMO_MODE:
        log.info("DEMO_MODE aktif — memproses SAMPLE_HTML bawaan (tidak mengakses internet).")
        return SAMPLE_HTML
    url = build_page_url(TARGET_URL, page)
    log.info("Mengambil halaman %d [%s]: %s", page, RENDER_MODE, url)
    if RENDER_MODE == "dynamic":
        return fetch_html_dynamic(url)
    return fetch_html_static(url)


# ---------------------------------------------------------------------------
# LAPISAN 2: EKSTRAKSI & PEMBERSIHAN
# ---------------------------------------------------------------------------

def slugify(*parts: str) -> str:
    text = "-".join(str(p) for p in parts if p)
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return re.sub(r"-+", "-", text).strip("-")


def format_price_idr(raw: str) -> str:
    if not raw:
        return ""
    raw = re.sub(r"\s+", " ", raw.strip())
    return f"Rp {raw}"


def parse_specs_table(spec_text: str) -> dict:
    """Ubah string bebas 'Bore 25mm, OD 52mm' -> dict {'Bore': '25mm', 'OD': '52mm'}."""
    result = {}
    if not spec_text:
        return result
    for chunk in [c.strip() for c in spec_text.split(",") if c.strip()]:
        m = re.match(r"^(.*?)([\d].*)$", chunk)
        if m:
            label = m.group(1).strip() or "Nilai"
            value = m.group(2).strip()
        else:
            label, value = chunk, ""
        result[label] = value
    return result


def extract_rows(html: str) -> list:
    soup = BeautifulSoup(html, "html.parser")
    rows = soup.select(ROW_SELECTOR)
    log.info("Ditemukan %d baris data mentah.", len(rows))

    records = []
    for row in rows:
        record = {}
        for field, selector in FIELD_SELECTORS.items():
            el = row.select_one(selector)
            record[field] = el.get_text(strip=True) if el else ""
        records.append(record)
    return records


def fetch_all_pages() -> list:
    pages = 1 if DEMO_MODE else MAX_PAGES
    all_records = []
    for page in range(1, pages + 1):
        html = get_source_html(page)
        all_records.extend(extract_rows(html))
        if not DEMO_MODE:
            time.sleep(REQUEST_DELAY_SECONDS)
    return all_records


# ---------------------------------------------------------------------------
# LAPISAN 3: ENRICHMENT — cross-reference & teks kaya search-intent
# ---------------------------------------------------------------------------

def extract_base_bearing_code(part_number: str) -> str:
    """Lepas akhiran tipe seal/shield untuk dapat kode dasar ISO (mis. '6205-2RS' -> '6205')."""
    known_suffixes = ["-2RS1", "-2RS", "2RS1", "2RS", "-2Z", "ZZ", "DDU", "LLU", "LLB", "2NSE", "-RS", "RS"]
    base = part_number.upper()
    for suf in sorted(known_suffixes, key=len, reverse=True):
        if base.endswith(suf):
            base = base[: -len(suf)]
            break
    return base.strip("-")


def generate_equivalent_codes(category: str, part_number: str) -> list:
    """
    Cross-reference kode part antar-brand — HANYA untuk kategori & format yang
    benar-benar mengikuti standar ISO metrik terbuka (bantalan bola/rol seri
    60/62/63). Kategori lain dikembalikan kosong daripada mengarang kode.
    """
    if category != "Bearing":
        return []

    base = extract_base_bearing_code(part_number)
    if not base or not base[0].isdigit():
        # Format non-standar (mis. pillow block UCP-series) -> jangan dipaksakan
        return []

    equivalents = []
    for brand, suffix in BRAND_SEAL_SUFFIX.items():
        # Sisipkan "-" jika akhiran dimulai angka, supaya tidak ambigu (mis. 6205-2NSE, bukan 62052NSE)
        sep = "-" if suffix and suffix[0].isdigit() and not suffix.startswith("-") else ""
        equivalents.append({"brand": brand, "code": f"{base}{sep}{suffix}"})
    return equivalents


def generate_vendor_type(category: str, brand: str) -> str:
    if brand and "generic" not in brand.lower():
        return "Brand spesifik / OEM"
    if category == "Bearing":
        return "Generic — sesuai standar ISO, tersedia dari berbagai vendor (SKF, NSK, NTN, dll.)"
    return "Generic — sesuai standar industri, tersedia dari berbagai distributor"


def generate_search_intent_text(record: dict) -> dict:
    """Beberapa varian teks pendek, tiap satu menyasar niat pencarian berbeda."""
    part_name = record.get("part_name", "")
    part_number = record.get("part_number", "")
    category = record.get("category", "")
    application = record.get("compatible_equipment", "")
    iso_standard = record.get("iso_standard", "")
    equivalents = record.get("equivalent_codes", [])
    eq_text = ", ".join(f"{e['brand']} {e['code']}" for e in equivalents)

    intents = {
        "harga": f"Kisaran harga {part_name} ({part_number}) dan cara cek ketersediaan stok {category.lower()} ini.",
        "spesifikasi": f"Spesifikasi teknis lengkap {part_number}: {record.get('specification', '')}.",
        "aplikasi": (
            f"{part_name} {part_number} umum dipakai untuk {application}." if application else ""
        ),
        "pengganti": (
            f"Kode pengganti/setara antar-brand: {eq_text}." if eq_text
            else "Belum ada data kode pengganti terverifikasi untuk part ini."
        ),
        "standar": (
            f"Mengacu standar {iso_standard}." if iso_standard
            else "Tidak ada standar dimensi universal yang berlaku umum untuk kategori ini."
        ),
    }
    return {k: v for k, v in intents.items() if v}


def generate_ai_description(record: dict) -> str:
    """
    Opsional: deskripsi unik per halaman via Claude API (menghindari duplicate
    content saat data sudah ribuan baris). Nonaktif default — aktifkan lewat
    ENABLE_AI_ENRICHMENT=True dan isi ANTHROPIC_API_KEY (GitHub Secrets).
    """
    if not ENABLE_AI_ENRICHMENT or not ANTHROPIC_API_KEY:
        return ""

    prompt = (
        f"Tulis 1 paragraf pendek (maks 40 kata) berbahasa Indonesia yang natural "
        f"untuk halaman produk sparepart industri berikut, tanpa mengulang kalimat "
        f"template. Nama: {record.get('part_name')}, Kode: {record.get('part_number')}, "
        f"Kategori: {record.get('category')}, Spesifikasi: {record.get('specification')}, "
        f"Aplikasi: {record.get('compatible_equipment')}."
    )
    try:
        resp = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": AI_MODEL,
                "max_tokens": 200,
                "messages": [{"role": "user", "content": prompt}],
            },
            timeout=30,
        )
        resp.raise_for_status()
        content = resp.json().get("content", [])
        return content[0]["text"].strip() if content else ""
    except Exception as e:
        log.warning("AI enrichment gagal untuk %s: %s — pakai deskripsi template.", record.get("part_number"), e)
        return ""


# ---------------------------------------------------------------------------
# LAPISAN 4: RANGKAI SKEMA AKHIR
# ---------------------------------------------------------------------------

def clean_records(records: list) -> list:
    if not records:
        return []

    df = pd.DataFrame(records)
    df = df.replace("", pd.NA).dropna(how="all")
    df = df.drop_duplicates()

    text_cols = ["part_name", "part_number", "category", "brand", "specification", "compatible_equipment", "alternative_parts"]
    for col in text_cols:
        if col in df.columns:
            df[col] = df[col].fillna("").astype(str).str.strip()

    if "part_number" in df.columns:
        df = df[df["part_number"].str.len() > 0]

    raw_records = df.to_dict(orient="records")
    enriched = []

    for r in raw_records:
        r["slug"] = slugify(r.get("category", ""), r.get("part_number", ""))
        r["price_range"] = format_price_idr(r.get("price_range", ""))
        r["price_note"] = PRICE_DISCLAIMER
        r["specs_table"] = parse_specs_table(r.get("specification", ""))
        r["iso_standard"] = CATEGORY_STANDARDS.get(r.get("category", ""), "")
        r["equivalent_codes"] = generate_equivalent_codes(r.get("category", ""), r.get("part_number", ""))
        r["vendor_type"] = generate_vendor_type(r.get("category", ""), r.get("brand", ""))
        r["search_intent"] = generate_search_intent_text(r)

        ai_desc = generate_ai_description(r)
        r["description"] = ai_desc or (
            f"{r.get('part_name','')} ({r.get('part_number','')}) — {r.get('category','')} "
            f"untuk {r.get('compatible_equipment','')}."
        )

        r["source_url"] = TARGET_URL if not DEMO_MODE else "contoh-data-demo"
        r["last_updated"] = time.strftime("%Y-%m-%d")
        enriched.append(r)

    return enriched


def save_json(records: list) -> None:
    for path in OUTPUT_JSON_PATHS:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(records, f, ensure_ascii=False, indent=2)
        log.info("Tersimpan %d baris ke %s", len(records), path)


def main():
    log.info(
        "Mode: %s | Render: %s",
        "DEMO (offline, data sampel)" if DEMO_MODE else f"LIVE ({TARGET_URL})",
        RENDER_MODE,
    )

    if not DEMO_MODE and not check_robots_txt(TARGET_URL, REALISTIC_HEADERS["User-Agent"]):
        log.error(
            "Dihentikan: robots.txt sumber melarang akses otomatis untuk URL ini. "
            "Ganti TARGET_URL ke sumber lain atau cari data terbuka resmi."
        )
        return

    raw_records = fetch_all_pages()
    enriched = clean_records(raw_records)

    if not enriched:
        log.warning(
            "0 baris berhasil diekstrak. Kemungkinan ROW_SELECTOR / FIELD_SELECTORS "
            "tidak cocok dengan struktur HTML target, atau (mode dynamic) halaman "
            "butuh login — cek ulang."
        )
        return

    save_json(enriched)
    log.info("Selesai. Total data akhir: %d baris.", len(enriched))


if __name__ == "__main__":
    main()
