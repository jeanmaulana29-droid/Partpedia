/**
 * Satu folder = satu artikel
 * site/src/data/articles/{slug}/
 *   isi.txt   = teks (baris1 judul, baris2 ringkasan, kosong, isi)
 *   1.jpg     = gambar utama (+ kartu beranda)
 *   2.jpg     = gambar tengah
 *
 * Upload 3 file sekaligus ke:
 *   github.com/.../upload/main/site/src/data/articles/{slug}
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
    // legacy flat file
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
  // kind: "1" or "2"
  const keys = Object.keys(urlMap);
  const hit = keys.find((k) => {
    const n = k.replace(/\\/g, "/");
    return (
      n.includes(`/articles/${slug}/`) &&
      (n.endsWith(`/${kind}.jpg`) ||
        n.endsWith(`/${kind}.jpeg`) ||
        n.endsWith(`/${kind}.png`) ||
        n.endsWith(`/${kind}.JPG`) ||
        n.endsWith(`/${kind}.JPEG`) ||
        n.endsWith(`/${kind}.PNG`))
    );
  });
  return hit ? urlMap[hit] : null;
}

export function loadAllArticles() {
  // Folder baru: .../articles/{slug}/isi.txt
  const folderTexts = import.meta.glob("../data/articles/*/isi.txt", {
    eager: true,
    query: "?raw",
    import: "default",
  });
  // Legacy: .../articles/{slug}.txt
  const flatTexts = import.meta.glob("../data/articles/*.txt", {
    eager: true,
    query: "?raw",
    import: "default",
  });
  // Gambar di folder artikel (di-bundle Vite → URL stabil)
  const imgUrls = import.meta.glob("../data/articles/*/*.{jpg,jpeg,png,JPG,JPEG,PNG}", {
    eager: true,
    query: "?url",
    import: "default",
  });

  const bySlug = new Map();

  for (const path in folderTexts) {
    const parts = path.replace(/\\/g, "/").split("/");
    const slug = parts[parts.length - 2];
    if (!slug || slug === "articles") continue;
    const art = parseArticleText(folderTexts[path], slug);
    art.image = resolveImg(slug, "1", imgUrls) || defaultHero(slug);
    art.imageMid = resolveImg(slug, "2", imgUrls) || defaultMid(slug);
    art.imageFallback = defaultHero(slug);
    art.imageMidFallback = defaultMid(slug);
    if (!art.date) art.date = gitDateForSlug(slug);
    bySlug.set(slug, art);
  }

  for (const path in flatTexts) {
    const base = path.split("/").pop() || "";
    const slug = base.replace(/\.txt$/i, "");
    if (!slug || bySlug.has(slug)) continue; // folder version menang
    const art = parseArticleText(flatTexts[path], slug);
    // legacy public paths
    art.image = `/articles/${slug}.jpg`;
    art.imageMid = `/articles/${slug}-2.jpg`;
    art.imageFallback = defaultHero(slug);
    art.imageMidFallback = defaultMid(slug);
    if (!art.date) art.date = gitDateForSlug(slug);
    bySlug.set(slug, art);
  }

  const list = [...bySlug.values()];
  list.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return list;
}
