/**
 * Urutan artikel STABIL — tanpa git, tanpa mtime, tanpa baca file saat build.
 *
 * Kunci: ORDER_NEWEST_FIRST (array di file ini).
 * Index 0 = terbaru = kiri carousel / atas knowledge.
 *
 * Artikel baru (slug belum ada di ORDER): otomatis di depan.
 * Saat upload artikel baru: tambahkan slug di baris pertama array ORDER_NEWEST_FIRST.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const articlesRoot = path.resolve(__dirname, "../data/articles");

/** TERBARU → TERLAMA. Jangan diacak. Prepend slug baru di index 0. */
const ORDER_NEWEST_FIRST = [
  "industri-kecil-vs-industri-besar",
  "mesin-vs-manusia",
  "surface-defect-coil",
  "surface-defect",
  "produksi-tolling",
  "cross-reference-tools-industri",
  "compare-sensor",
  "compare-inverter-industri",
  "compare-pressure-tools",
  "compare-van-belt",
  "compare-filter-oli",
  "equivalent-bearing",
  "cara-membaca-bearing",
  "klasifikasi-generasi-jenis",
  "engineer-departemen",
  "karakter-industri",
  "klasifikasi-jenis-produksi",
  "marketing-handal",
  "membangun-workshop-kecil",
  "mesin-tll",
  "packing-machine",
  "pensiun-kerja",
  "perbedaan-rolling-mill",
  "produk-impor",
  "robot-humanoid-pekerja",
  "stick-machine",
  "tim-marketing",
  "upah-minimum",
  "hubungan-bos-karyawan",
  "industri-umkm",
  "aktuator",
  "ai-industri",
  "operator-handal",
  "qa-qc",
  "mesin-annealing",
  "alat-ukur",
  "kapal-evergreen",
  "industri-micro",
  "sparepart-palsu",
  "industri-indonesia",
  "mesin-rusak",
  "menjadi-manager",
  "predictive-maintenance",
  "coupling",
  "gear-reducer",
  "dinamo-motor",
  "part-hidrolik",
  "hot-rolling",
  "pickling-line",
  "rolling-mill",
  "roll-forming",
  "jenis-atap",
  "problem-solving-dua",
  "problem-solving-galv",
  "menguasai-tools",
  "rahasia-management",
  "standar-manufaktur",
  "sejarah-perindustrian",
  "kenapa-bearing-kuat"
];

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
function defaultHero(slug) {
  return `/articles/default-${(hash(slug) % 4) + 1}.jpg`;
}
function defaultMid(slug) {
  return `/articles/default-${((hash(slug) + 2) % 4) + 1}.jpg`;
}

export function parseArticleText(raw, slug) {
  const lines = String(raw || "").replace(/^\uFEFF/, "").split(/\r?\n/);
  const title = (lines[0] || slug).trim();
  let i = 1;
  while (i < lines.length && lines[i].trim() === "") i++;

  let date = "";
  if (i < lines.length) {
    const rawDate = lines[i].trim();
    const mFull =
      rawDate.match(/^(\d{4}-\d{2}-\d{2})(?:[T\s]\d{2}:\d{2}(?::\d{2})?)?$/) ||
      rawDate.match(/^date\s*:\s*(\d{4}-\d{2}-\d{2})/i);
    if (mFull) {
      date = mFull[1];
      i++;
      while (i < lines.length && lines[i].trim() === "") i++;
    }
  }

  let excerpt = "";
  if (i < lines.length) {
    const cand = lines[i].trim();
    const followedByBlank = i + 1 < lines.length && lines[i + 1].trim() === "";
    const restAfter = lines.slice(i + 2).join("\n").trim();
    if (
      cand &&
      cand !== title &&
      cand.length <= 200 &&
      followedByBlank &&
      restAfter.length > 40
    ) {
      excerpt = cand;
      i += 2;
      while (i < lines.length && lines[i].trim() === "") i++;
    }
  }

  const body = lines.slice(i).join("\n").trim();
  if (!excerpt) {
    const plain = body.replace(/\s+/g, " ").trim();
    excerpt = plain.slice(0, 160) + (plain.length > 160 ? "…" : "");
  }

  return { slug, title, excerpt, body, date: date || "1970-01-01" };
}

function resolveImg(slug, n, imgUrls) {
  for (const k of Object.keys(imgUrls || {})) {
    const norm = k.replace(/\\/g, "/");
    if (
      norm.includes(`/articles/${slug}/`) &&
      new RegExp(`/${n}\\.(jpe?g|png)$`, "i").test(norm)
    ) {
      return imgUrls[k];
    }
  }
  return "";
}

export function loadAllArticles() {
  const folderTexts = import.meta.glob("../data/articles/*/isi.txt", {
    eager: true,
    query: "?raw",
    import: "default",
  });
  const flatTexts = import.meta.glob("../data/articles/*.txt", {
    eager: true,
    query: "?raw",
    import: "default",
  });
  const imgUrls = import.meta.glob(
    "../data/articles/*/*.{jpg,jpeg,png,JPG,JPEG,PNG}",
    { eager: true, query: "?url", import: "default" }
  );

  const orderIndex = new Map(
    ORDER_NEWEST_FIRST.map((s, i) => [String(s), i])
  );

  const bySlug = new Map();

  function attachImages(art) {
    const hero = resolveImg(art.slug, "1", imgUrls);
    const mid = resolveImg(art.slug, "2", imgUrls);
    art.imageFallback = defaultHero(art.slug);
    art.imageMidFallback = defaultMid(art.slug);
    art.image = hero || `/articles/${art.slug}.jpg`;
    art.imageMid = mid || `/articles/${art.slug}-2.jpg`;
    if (hero) art.image = hero;
    if (mid) art.imageMid = mid;
    return art;
  }

  const slugFromFolder = (p) =>
    p.replace(/\\/g, "/").split("/").slice(-2, -1)[0];
  const slugFromFlat = (p) =>
    (p.replace(/\\/g, "/").split("/").pop() || "").replace(/\.txt$/i, "");

  for (const p in folderTexts) {
    const slug = slugFromFolder(p);
    if (!slug || slug === "articles") continue;
    bySlug.set(slug, attachImages(parseArticleText(folderTexts[p], slug)));
  }
  for (const p in flatTexts) {
    const slug = slugFromFlat(p);
    if (!slug || bySlug.has(slug)) continue;
    bySlug.set(slug, attachImages(parseArticleText(flatTexts[p], slug)));
  }

  const list = [...bySlug.values()];

  // Sort murni dari ORDER — tidak pakai git/mtime (sumber acak di Vercel)
  list.sort((a, b) => {
    const ia = orderIndex.has(a.slug) ? orderIndex.get(a.slug) : -1;
    const ib = orderIndex.has(b.slug) ? orderIndex.get(b.slug) : -1;
    // belum di ORDER = artikel baru → paling depan (kiri/atas)
    if (ia < 0 && ib < 0) return String(b.slug).localeCompare(String(a.slug));
    if (ia < 0) return -1;
    if (ib < 0) return 1;
    return ia - ib;
  });

  return list;
}
