/**
 * Baca semua file .txt di src/data/articles/
 * Format file (sangat sederhana):
 *   Baris 1 = judul
 *   Baris 2 = ringkasan (excerpt)
 *   Baris 3 = tanggal YYYY-MM-DD
 *   Baris 4 kosong
 *   Sisanya = isi artikel (paragraf dipisah baris kosong)
 *
 * Gambar opsional: site/public/articles/{slug}.jpg|jpeg|png
 * Nama file teks = slug, contoh: cara-baca-kode-bearing.txt
 */
const STOCK = [
  "https://images.unsplash.com/photo-1590959651373-a3db0f38a961?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1565043589221-1a6fd9ae45c7?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1565793298595-6a901bc2a8ae?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=1200&q=80",
];

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function stockImage(slug) {
  return STOCK[hash(slug) % STOCK.length];
}

/** @param {string} raw @param {string} slug */
export function parseArticleText(raw, slug) {
  const lines = String(raw || "").replace(/^\uFEFF/, "").split(/\r?\n/);
  const title = (lines[0] || slug).trim();
  const excerpt = (lines[1] || "").trim();
  let date = (lines[2] || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) date = "2026-01-01";
  // body: skip first 3 lines, then optional blank
  let start = 3;
  while (start < lines.length && lines[start].trim() === "") start++;
  const body = lines.slice(start).join("\n").trim();
  const stock = stockImage(slug);
  return {
    slug,
    title,
    excerpt: excerpt || title,
    date,
    body,
    // Gambar otomatis (stok industri unik per slug).
    // Opsional: upload /public/articles/{slug}.jpg untuk mengganti.
    image: stock,
    imageLocal: `/articles/${slug}.jpg`,
    imageFallback: stock,
  };
}

export function loadAllArticles() {
  // Vite/Astro raw glob
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
