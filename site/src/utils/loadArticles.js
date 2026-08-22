/**
 * Satu folder = satu artikel (ideal):
 *   site/src/data/articles/{slug}/isi.txt + 1.jpg|jpeg + 2.jpg|jpeg
 *
 * Masih support file lama:
 *   site/src/data/articles/{slug}.txt
 *   + gambar di folder {slug}/1.jpeg jika ada
 *
 * Urutan: TERBARU di index 0 (kiri carousel).
 * Prioritas tanggal:
 *   1) baris tanggal YYYY-MM-DD di isi.txt (opsional)
 *   2) waktu commit git file tersebut (%ct) — akurat per-upload
 *   3) mtime file di disk saat build
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const articlesRoot = path.resolve(__dirname, "../data/articles");

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

/** Unix seconds — semakin besar = semakin baru */
function gitTimestampForSlug(slug) {
  const candidates = [
    `site/src/data/articles/${slug}/isi.txt`,
    `src/data/articles/${slug}/isi.txt`,
    `site/src/data/articles/${slug}/1.jpeg`,
    `site/src/data/articles/${slug}/1.jpg`,
    `site/src/data/articles/${slug}/1.png`,
    `site/src/data/articles/${slug}.txt`,
    `src/data/articles/${slug}.txt`,
  ];
  for (const rel of candidates) {
    try {
      const d = execSync(`git log -1 --format=%ct -- "${rel}"`, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      const n = Number(d);
      if (Number.isFinite(n) && n > 0) return n;
    } catch {}
  }
  return 0;
}

function mtimeForSlug(slug) {
  const candidates = [
    path.join(articlesRoot, slug, "isi.txt"),
    path.join(articlesRoot, `${slug}.txt`),
    path.join(articlesRoot, slug, "1.jpg"),
    path.join(articlesRoot, slug, "1.jpeg"),
    path.join(articlesRoot, slug, "1.png"),
  ];
  let best = 0;
  for (const p of candidates) {
    try {
      const st = fs.statSync(p);
      if (st.mtimeMs > best) best = st.mtimeMs;
    } catch {}
  }
  return best;
}

function toDateStr(tsSec) {
  if (!tsSec) return "1970-01-01";
  const d = new Date(tsSec * 1000);
  if (Number.isNaN(d.getTime())) return "1970-01-01";
  return d.toISOString().slice(0, 10);
}

export function parseArticleText(raw, slug) {
  const lines = String(raw || "").replace(/^\uFEFF/, "").split(/\r?\n/);
  const title = (lines[0] || slug).trim();
  const excerpt = (lines[1] || "").trim();
  let date = "";
  let start = 2;
  const maybeDate = (lines[2] || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(maybeDate)) {
    date = maybeDate;
    start = 3;
  }
  while (start < lines.length && lines[start].trim() === "") start++;
  const body = lines.slice(start).join("\n").trim();
  return { slug, title, excerpt: excerpt || title, date, body };
}

function resolveImg(slug, kind, urlMap) {
  const keys = Object.keys(urlMap);
  const hit = keys.find((k) => {
    const n = k.replace(/\\/g, "/");
    if (!n.includes(`/articles/${slug}/`)) return false;
    const base = n.split("/").pop() || "";
    const lower = base.toLowerCase();
    return (
      lower === `${kind}.jpg` ||
      lower === `${kind}.jpeg` ||
      lower === `${kind}.png`
    );
  });
  return hit ? urlMap[hit] : null;
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
  const imgUrls = import.meta.glob("../data/articles/*/*.{jpg,jpeg,png,JPG,JPEG,PNG}", {
    eager: true,
    query: "?url",
    import: "default",
  });

  const bySlug = new Map();

  function attachImages(art) {
    const hero = resolveImg(art.slug, "1", imgUrls);
    const mid = resolveImg(art.slug, "2", imgUrls);
    art.image = hero || `/articles/${art.slug}.jpg`;
    art.imageMid = mid || `/articles/${art.slug}-2.jpg`;
    art.imageFallback = defaultHero(art.slug);
    art.imageMidFallback = defaultMid(art.slug);
    if (hero) art.image = hero;
    if (mid) art.imageMid = mid;
    return art;
  }

  function attachSortKey(art) {
    // 1) tanggal eksplisit di file → tengah hari UTC hari itu
    if (art.date && /^\d{4}-\d{2}-\d{2}$/.test(art.date)) {
      art._sort = Date.parse(art.date + "T12:00:00Z") || 0;
      return art;
    }
    // 2) waktu commit git (detik) — bedakan upload di hari yang sama
    const gitTs = gitTimestampForSlug(art.slug);
    if (gitTs > 0) {
      art._sort = gitTs * 1000;
      art.date = art.date || toDateStr(gitTs);
      return art;
    }
    // 3) mtime file saat build
    const mt = mtimeForSlug(art.slug);
    art._sort = mt || 0;
    if (!art.date && mt) art.date = toDateStr(Math.floor(mt / 1000));
    if (!art.date) art.date = "1970-01-01";
    return art;
  }

  for (const p in folderTexts) {
    const parts = p.replace(/\\/g, "/").split("/");
    const slug = parts[parts.length - 2];
    if (!slug || slug === "articles") continue;
    let art = parseArticleText(folderTexts[p], slug);
    art = attachSortKey(attachImages(art));
    bySlug.set(slug, art);
  }

  for (const p in flatTexts) {
    const base = p.split("/").pop() || "";
    const slug = base.replace(/\.txt$/i, "");
    if (!slug || bySlug.has(slug)) continue;
    let art = parseArticleText(flatTexts[p], slug);
    art = attachSortKey(attachImages(art));
    bySlug.set(slug, art);
  }

  const list = [...bySlug.values()];
  // Terbaru dulu (kiri carousel). Seri: slug agar stabil.
  list.sort((a, b) => {
    const d = (b._sort || 0) - (a._sort || 0);
    if (d !== 0) return d;
    return String(a.slug).localeCompare(String(b.slug));
  });
  return list;
}
