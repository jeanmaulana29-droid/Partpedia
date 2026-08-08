"""
partmatch_sync.py — Sinkron data dari Partmatch Public API → data.json (skema v3)

Syarat:
  - API key gratis dari https://partmatch.io/developers
  - Environment: PARTMATCH_API_KEY=pm_live_...

Cara jalan:
  python partmatch_sync.py

GitHub Actions:
  Secret name: PARTMATCH_API_KEY
  Workflow: partmatch-sync.yml

Batas free: ~100 request/hari. Script memakai daftar seed terbatas + delay.
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
OUTPUT_PATHS = [
    ROOT / "data" / "data.json",
    ROOT.parent / "site" / "src" / "data" / "data.json",
]
SEED_PATH = ROOT / "partmatch_seeds.json"

API_BASE = "https://api.partmatch.io/api/v1/public"
PRICE_NOTE = (
    "Estimasi pasar, bukan harga real-time dari Partmatch — "
    "verifikasi ke vendor sebelum membeli"
)

# Seed default jika file seeds belum ada (hemat kuota free tier)
DEFAULT_SEEDS = {
    "bearings": [
        "6200-2RS", "6201-2RS", "6202-2RS", "6203-2RS", "6204-2RS", "6205-2RS",
        "6206-2RS", "6207-2RS", "6208-2RS", "6209-2RS", "6210-2RS",
        "6000-2RS", "6001-2RS", "6002-2RS", "6003-2RS", "6004-2RS", "6005-2RS",
        "6300-2RS", "6301-2RS", "6302-2RS", "6303-2RS", "6304-2RS", "6305-2RS",
        "6205-ZZ", "6204-ZZ", "6206-ZZ", "6305-ZZ",
        "UCP205", "UCP204", "UCP206", "UCF205",
        "30205", "30206", "32205", "32206",
    ],
    "belts": [
        "A-38", "A-42", "A-48", "A-52", "A-58", "A-60", "A-65", "A-70",
        "B-48", "B-52", "B-60", "B-65", "B-70", "B-75",
        "3V-560", "3V-630", "5V-750",
    ],
    "chain": [
        "40-1", "50-1", "60-1", "08B-1", "10B-1", "12B-1",
    ],
}


def log(msg: str) -> None:
    print(msg, flush=True)


def slugify(*parts: str) -> str:
    text = "-".join(str(p) for p in parts if p)
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return re.sub(r"-+", "-", text).strip("-")


def api_get(path: str, api_key: str) -> dict[str, Any]:
    url = f"{API_BASE}{path}"
    req = Request(
        url,
        headers={
            "X-API-Key": api_key,
            "Accept": "application/json",
            "User-Agent": "PartpediaSync/1.0 (+https://github.com/jeanmaulana29-droid/Partpedia)",
        },
    )
    with urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def load_seeds() -> dict[str, list[str]]:
    if SEED_PATH.exists():
        data = json.loads(SEED_PATH.read_text(encoding="utf-8"))
        return {
            "bearings": data.get("bearings") or DEFAULT_SEEDS["bearings"],
            "belts": data.get("belts") or DEFAULT_SEEDS["belts"],
            "chain": data.get("chain") or DEFAULT_SEEDS["chain"],
        }
    SEED_PATH.write_text(json.dumps(DEFAULT_SEEDS, indent=2) + "\n", encoding="utf-8")
    return DEFAULT_SEEDS


def bearing_to_record(query: str, hit: dict[str, Any]) -> dict[str, Any]:
    brand = str(hit.get("brand") or "Generic")
    pn = str(hit.get("part_number") or query)
    bore = hit.get("bore_mm")
    od = hit.get("od_mm")
    width = hit.get("width_mm")
    size_parts = []
    specs: dict[str, str] = {}
    if bore is not None:
        specs["Bore"] = f"{bore} mm"
        size_parts.append(f"Bore {bore}mm")
    if od is not None:
        specs["OD"] = f"{od} mm"
        size_parts.append(f"OD {od}mm")
    if width is not None:
        specs["Width"] = f"{width} mm"
        size_parts.append(f"Width {width}mm")
    if hit.get("seal_type"):
        specs["Seal"] = str(hit["seal_type"])
    if hit.get("dynamic_load_kn") is not None:
        specs["Dynamic load"] = f"{hit['dynamic_load_kn']} kN"
    if hit.get("static_load_kn") is not None:
        specs["Static load"] = f"{hit['static_load_kn']} kN"
    if hit.get("max_speed_grease_rpm") is not None:
        specs["Max speed (grease)"] = f"{hit['max_speed_grease_rpm']} rpm"
    if hit.get("weight_g") is not None:
        specs["Weight"] = f"{hit['weight_g']} g"

    size = " · ".join(size_parts)
    spec_text = ", ".join(f"{k} {v}" for k, v in specs.items())
    state = hit.get("equivalence_state") or ""

    return {
        "part_name": f"Bearing {pn}",
        "part_number": pn,
        "category": "Bearing",
        "subcategory": "Rolling bearing",
        "brand": brand,
        "specification": spec_text,
        "size": size,
        "material": "Chrome steel (typical)",
        "fungsi": "Menopang poros berputar dan menahan beban radial/aksial sesuai rating.",
        "kegunaan": "Motor listrik, pompa, gearbox, conveyor, mesin industri umum.",
        "durability": "Umur pakai bergantung beban, pelumasan, alignment, dan kontaminasi.",
        "compatible_equipment": "Motor, pompa, gearbox, conveyor",
        "price_range": "",
        "unit": "pcs",
        "alternative_parts": query if query != pn else "",
        "slug": slugify("bearing", brand, pn),
        "price_note": PRICE_NOTE,
        "specs_table": specs,
        "iso_standard": "ISO 15 (dimensi bantalan bola metrik — acuan umum)",
        "equivalent_codes": [],
        "vendor_type": f"{brand} — data cross-reference via Partmatch",
        "search_intent": {
            "harga": f"Referensi spek {pn} ({brand}); cek harga ke vendor lokal.",
            "spesifikasi": f"Spesifikasi {pn}: {spec_text}.",
            "aplikasi": f"Bearing {pn} umum untuk motor, pompa, gearbox, conveyor.",
            "pengganti": f"Status ekuivalen Partmatch: {state}." if state else "",
            "keawetan": "Umur pakai bergantung beban, pelumasan, dan alignment.",
        },
        "description": f"Bearing {pn} ({brand}) — {size}. Data spek & ekuivalen dari Partmatch.",
        "source_url": "https://partmatch.io",
        "last_updated": time.strftime("%Y-%m-%d"),
        "_query": query,
        "_kind": "bearing",
    }


def belt_to_record(query: str, hit: dict[str, Any]) -> dict[str, Any]:
    brand = str(hit.get("brand") or "Generic")
    pn = str(hit.get("part_number") or query)
    specs: dict[str, str] = {}
    for k, label in [
        ("profile", "Profil"),
        ("length_mm", "Panjang"),
        ("length_in", "Panjang (in)"),
        ("top_width_mm", "Lebar atas"),
        ("height_mm", "Tinggi"),
    ]:
        if hit.get(k) is not None:
            specs[label] = str(hit[k])
    size = " · ".join(f"{k} {v}" for k, v in specs.items()) or pn
    spec_text = ", ".join(f"{k} {v}" for k, v in specs.items())

    return {
        "part_name": f"V-Belt {pn}",
        "part_number": pn,
        "category": "V-Belt",
        "subcategory": "Industrial V-Belt",
        "brand": brand,
        "specification": spec_text,
        "size": size,
        "material": "Rubber compound / cord (typical)",
        "fungsi": "Mentransmisikan daya antara puli dengan rasio tetap.",
        "kegunaan": "Blower, kompresor, conveyor, mesin industri ringan-menengah.",
        "durability": "Ganti saat retak, aus, atau slip berlebih; jaga tegangan & alignment.",
        "compatible_equipment": "Puli V-belt, blower, kompresor",
        "price_range": "",
        "unit": "pcs",
        "alternative_parts": query if query != pn else "",
        "slug": slugify("v-belt", brand, pn),
        "price_note": PRICE_NOTE,
        "specs_table": specs,
        "iso_standard": "ISO 4184 (profil sabuk-V klasik — acuan umum)",
        "equivalent_codes": [],
        "vendor_type": f"{brand} — data via Partmatch",
        "search_intent": {
            "harga": f"Referensi spek V-belt {pn}; cek harga ke vendor.",
            "spesifikasi": f"Spesifikasi {pn}: {spec_text}.",
            "aplikasi": f"V-belt {pn} untuk transmisi industri umum.",
        },
        "description": f"V-Belt {pn} ({brand}). Data dari Partmatch.",
        "source_url": "https://partmatch.io",
        "last_updated": time.strftime("%Y-%m-%d"),
        "_query": query,
        "_kind": "belt",
    }


def chain_to_record(query: str, obj: dict[str, Any]) -> dict[str, Any]:
    """Nested response: base + brand_skus."""
    pn = str(obj.get("canonical_part_number") or query)
    brand_skus = obj.get("brand_skus") or []
    brand = "Generic"
    if brand_skus:
        brand = str(brand_skus[0].get("brand") or "Generic")
        pn = str(brand_skus[0].get("part_number") or pn)

    specs: dict[str, str] = {}
    for k, label in [
        ("pitch_mm", "Pitch"),
        ("pitch_in", "Pitch (in)"),
        ("roller_diameter_mm", "Roller dia"),
        ("width_mm", "Width"),
        ("standard", "Standard"),
    ]:
        if obj.get(k) is not None:
            specs[label] = str(obj[k])

    eq = [
        {"brand": str(s.get("brand")), "code": str(s.get("part_number"))}
        for s in brand_skus
        if s.get("brand") and s.get("part_number")
    ]
    size = " · ".join(f"{k} {v}" for k, v in specs.items()) or pn
    spec_text = ", ".join(f"{k} {v}" for k, v in specs.items())

    return {
        "part_name": f"Roller Chain {pn}",
        "part_number": pn,
        "category": "Sprocket",
        "subcategory": "Roller chain",
        "brand": brand,
        "specification": spec_text,
        "size": size,
        "material": "Carbon steel (typical)",
        "fungsi": "Mentransmisikan daya melalui rantai rol.",
        "kegunaan": "Conveyor, mesin transfer material, power transmission.",
        "durability": "Keausan dipercepat jika rantai kendor atau tidak sejajar.",
        "compatible_equipment": "Sprocket, conveyor rantai",
        "price_range": "",
        "unit": "pcs",
        "alternative_parts": ", ".join(f"{e['brand']} {e['code']}" for e in eq[:6]),
        "slug": slugify("chain", brand, pn),
        "price_note": PRICE_NOTE,
        "specs_table": specs,
        "iso_standard": "ASME/ANSI B29.1 / ISO roller chain (acuan umum)",
        "equivalent_codes": eq[:12],
        "vendor_type": f"{brand} — data via Partmatch",
        "search_intent": {
            "harga": f"Referensi rantai {pn}; cek harga ke vendor.",
            "spesifikasi": f"Spesifikasi {pn}: {spec_text}.",
            "pengganti": f"SKU brand: {', '.join(e['code'] for e in eq[:5])}." if eq else "",
        },
        "description": f"Roller chain {pn} ({brand}). Data dari Partmatch.",
        "source_url": "https://partmatch.io",
        "last_updated": time.strftime("%Y-%m-%d"),
        "_query": query,
        "_kind": "chain",
    }


def fetch_bearings(api_key: str, queries: list[str], delay: float) -> list[dict]:
    out: list[dict] = []
    for q in queries:
        try:
            data = api_get(f"/bearings/search?q={q}", api_key)
            results = data.get("results") or []
            if not results:
                log(f"  bearing {q}: kosong")
            # Ambil max 3 brand per query agar hemat & tidak banjir duplikat
            for hit in results[:3]:
                rec = bearing_to_record(q, hit)
                # isi equivalent dari results lain
                eq = [
                    {"brand": str(r.get("brand")), "code": str(r.get("part_number"))}
                    for r in results
                    if r.get("brand") and r.get("part_number")
                ]
                rec["equivalent_codes"] = eq[:10]
                out.append(rec)
            log(f"  bearing {q}: {len(results)} hasil")
        except HTTPError as e:
            log(f"  bearing {q}: HTTP {e.code}")
            if e.code in (401, 403):
                raise
        except Exception as e:
            log(f"  bearing {q}: error {e}")
        time.sleep(delay)
    return out


def fetch_belts(api_key: str, queries: list[str], delay: float) -> list[dict]:
    out: list[dict] = []
    for q in queries:
        try:
            data = api_get(f"/belts/search?q={q}", api_key)
            results = data.get("results") or []
            for hit in results[:3]:
                out.append(belt_to_record(q, hit))
            log(f"  belt {q}: {len(results)} hasil")
        except HTTPError as e:
            log(f"  belt {q}: HTTP {e.code}")
            if e.code in (401, 403):
                raise
        except Exception as e:
            log(f"  belt {q}: error {e}")
        time.sleep(delay)
    return out


def fetch_chain(api_key: str, queries: list[str], delay: float) -> list[dict]:
    out: list[dict] = []
    for q in queries:
        try:
            data = api_get(f"/chain/search?q={q}", api_key)
            results = data.get("results") or []
            # nested list
            if isinstance(results, list):
                for obj in results[:2]:
                    out.append(chain_to_record(q, obj))
            elif isinstance(data, dict) and data.get("canonical_part_number"):
                out.append(chain_to_record(q, data))
            log(f"  chain {q}: ok")
        except HTTPError as e:
            log(f"  chain {q}: HTTP {e.code}")
            if e.code in (401, 403):
                raise
        except Exception as e:
            log(f"  chain {q}: error {e}")
        time.sleep(delay)
    return out


def load_existing() -> list[dict]:
    path = OUTPUT_PATHS[0]
    if not path.exists():
        alt = OUTPUT_PATHS[1]
        path = alt if alt.exists() else path
    if not path.exists():
        return []
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return []


def merge_records(existing: list[dict], new_recs: list[dict]) -> list[dict]:
    """Partmatch menimpa slug yang sama; data non-Partmatch tetap dipertahankan."""
    by_slug: dict[str, dict] = {}
    for r in existing:
        slug = r.get("slug")
        if slug:
            by_slug[slug] = r
    for r in new_recs:
        clean = {k: v for k, v in r.items() if not k.startswith("_")}
        # bersihkan search_intent kosong
        si = clean.get("search_intent") or {}
        clean["search_intent"] = {k: v for k, v in si.items() if v}
        by_slug[clean["slug"]] = clean
    return list(by_slug.values())


def save(records: list[dict]) -> None:
    text = json.dumps(records, ensure_ascii=False, indent=2) + "\n"
    for path in OUTPUT_PATHS:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
        log(f"Tulis {path} ({len(records)} item)")


def main() -> None:
    api_key = os.environ.get("PARTMATCH_API_KEY", "").strip()
    if not api_key:
        log("ERROR: set environment PARTMATCH_API_KEY dulu.")
        log("Daftar gratis: https://partmatch.io/developers")
        sys.exit(1)

    seeds = load_seeds()
    # Batasi total request agar aman di free tier 100/hari
    max_req = int(os.environ.get("PARTMATCH_MAX_REQUESTS", "80"))
    delay = float(os.environ.get("PARTMATCH_DELAY", "0.4"))

    bearings = seeds["bearings"][: max(0, max_req)]
    used = len(bearings)
    belts = seeds["belts"][: max(0, max_req - used)]
    used += len(belts)
    chain = seeds["chain"][: max(0, max_req - used)]

    log(f"Partmatch sync · bearings={len(bearings)} belts={len(belts)} chain={len(chain)}")

    new_recs: list[dict] = []
    new_recs.extend(fetch_bearings(api_key, bearings, delay))
    new_recs.extend(fetch_belts(api_key, belts, delay))
    new_recs.extend(fetch_chain(api_key, chain, delay))

    if not new_recs:
        log("Tidak ada data baru dari API — data.json tidak diubah.")
        sys.exit(0)

    existing = load_existing()
    merged = merge_records(existing, new_recs)
    save(merged)
    log(f"Selesai. Baru dari API: {len(new_recs)} · total gabungan: {len(merged)}")


if __name__ == "__main__":
    main()
