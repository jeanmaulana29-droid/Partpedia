/**
 * Artikel dari file .txt di src/data/articles/
 *
 * Format teks:
 *   Baris 1 = judul
 *   Baris 2 = ringkasan kartu
 *   Baris 3 = tanggal YYYY-MM-DD
 *   Baris 4 kosong
 *   Sisanya = isi
 *
 * Gambar (opsional, seperti produk):
 *   site/public/articles/{slug}.jpg     → gambar utama (hero + kartu beranda)
 *   site/public/articles/{slug}-2.jpg   → gambar tengah artikel
 *   Jika belum diupload → pakai default-1..4 otomatis
 */
function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function defaultHero(slug) {
  const n = (hash(slug) % 4) + 1;
  return `/articles/default-${n}.jpg`;
}

function defaultMid(slug) {
  const n = ((hash(slug) + 2) % 4) + 1;
  return `/articles/default-${n}.jpg`;
}

export function parseArticleText(raw, slug) {
  const lines = String(raw || "").replace(/^\uFEFF/, "").split(/\r?\n/);
  const title = (lines[0] || slug).trim();
  const excerpt = (lines[1] || "").trim();
  let date = (lines[2] || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) date = "2026-01-01";
  let start = 3;
  while (start < lines.length && lines[start].trim() === "") start++;
  const body = lines.slice(start).join("\n").trim();
  return {
    slug,
    title,
    excerpt: excerpt || title,
    date,
    body,
    // path yang dicoba dulu (upload user)
    image: `/articles/${slug}.jpg`,
    imageMid: `/articles/${slug}-2.jpg`,
    // cadangan di server sendiri
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
    list.push(parseArticleText(typeof raw === "string" ? raw : String(raw), slug));
  }
  list.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return list;
}
