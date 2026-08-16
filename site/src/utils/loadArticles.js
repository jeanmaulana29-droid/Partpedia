/**
 * Artikel dari file .txt di src/data/articles/
 *
 * Format teks (TANPA wajib tanggal):
 *   Baris 1 = judul
 *   Baris 2 = ringkasan kartu
 *   Baris 3 kosong (atau boleh tanggal lama, opsional)
 *   Sisanya = isi
 *
 * Urutan otomatis: waktu commit/upload terakhir di GitHub (terbaru di depan).
 * Gambar:
 *   /articles/{slug}.jpg dan /articles/{slug}-2.jpg
 *   fallback: /articles/default-1..4.jpg
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

/** Tanggal dari git (kapan file terakhir di-commit / di-upload) */
function gitDateForSlug(slug) {
  const candidates = [
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
    } catch {
      /* try next */
    }
  }
  return "1970-01-01";
}

export function parseArticleText(raw, slug) {
  const lines = String(raw || "").replace(/^\uFEFF/, "").split(/\r?\n/);
  const title = (lines[0] || slug).trim();
  const excerpt = (lines[1] || "").trim();

  // Baris 3: tanggal opsional (format lama). Jika bukan tanggal → termasuk isi.
  let date = "";
  let start = 2;
  const maybeDate = (lines[2] || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(maybeDate)) {
    date = maybeDate;
    start = 3;
  }

  while (start < lines.length && lines[start].trim() === "") start++;
  const body = lines.slice(start).join("\n").trim();

  return {
    slug,
    title,
    excerpt: excerpt || title,
    date, // boleh kosong → diisi git di loadAllArticles
    body,
    image: `/articles/${slug}.jpg`,
    imageMid: `/articles/${slug}-2.jpg`,
    imageFallback: defaultHero(slug),
    imageMidFallback: defaultMid(slug),
  };
}

export function loadAllArticles() {
  const modules = import.meta.glob("../data/articles/*.txt", {
    eager: true,
    query: "?raw",
    import: "default",
  });
  const list = [];
  for (const path in modules) {
    const base = path.split("/").pop() || "";
    const slug = base.replace(/\.txt$/i, "");
    if (!slug) continue;
    const raw = modules[path];
    const art = parseArticleText(typeof raw === "string" ? raw : String(raw), slug);
    if (!art.date) art.date = gitDateForSlug(slug);
    list.push(art);
  }
  // Terbaru dulu (tanggal commit / opsional di file)
  list.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return list;
}
