/**
 * Satu folder = satu artikel (ideal):
 *   site/src/data/articles/{slug}/isi.txt + 1.jpg|jpeg + 2.jpg|jpeg
 *
 * Masih support file lama:
 *   site/src/data/articles/{slug}.txt
 *   + gambar di folder {slug}/1.jpeg jika ada
 */
import { execSync } from "node:child_process";

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

function gitDateForSlug(slug) {
  const candidates = [
    `site/src/data/articles/${slug}/isi.txt`,
    `src/data/articles/${slug}/isi.txt`,
    `site/src/data/articles/${slug}/1.jpeg`,
    `site/src/data/articles/${slug}/1.jpg`,
    `site/src/data/articles/${slug}.txt`,
    `src/data/articles/${slug}.txt`,
  ];
  for (const rel of candidates) {
    try {
      const d = execSync(`git log -1 --format=%cs -- "${rel}"`, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    } catch {}
  }
  return "1970-01-01";
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
    // jika ada file folder, prioritaskan (hero/mid sudah di-set di atas)
    if (hero) art.image = hero;
    if (mid) art.imageMid = mid;
    return art;
  }

  for (const path in folderTexts) {
    const parts = path.replace(/\\/g, "/").split("/");
    const slug = parts[parts.length - 2];
    if (!slug || slug === "articles") continue;
    const art = parseArticleText(folderTexts[path], slug);
    if (!art.date) art.date = gitDateForSlug(slug);
    bySlug.set(slug, attachImages(art));
  }

  for (const path in flatTexts) {
    const base = path.split("/").pop() || "";
    const slug = base.replace(/\.txt$/i, "");
    if (!slug || bySlug.has(slug)) continue;
    const art = parseArticleText(flatTexts[path], slug);
    if (!art.date) art.date = gitDateForSlug(slug);
    bySlug.set(slug, attachImages(art));
  }

  const list = [...bySlug.values()];
  list.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return list;
}
