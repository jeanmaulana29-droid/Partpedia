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

/** Map slug → unix seconds (commit terakhir yang menyentuh file artikel). Dibangun 1x. */
let _gitTimeMap = null;
function getGitTimeMap() {
  if (_gitTimeMap) return _gitTimeMap;
  _gitTimeMap = new Map();
  try {
    const out = execSync(
      "git log --format='---%ct' --name-only -- site/src/data/articles src/data/articles",
      {
        encoding: "utf8",
        maxBuffer: 20 * 1024 * 1024,
        stdio: ["ignore", "pipe", "ignore"],
      }
    );
    let currentTs = 0;
    for (const line of out.split("\n")) {
      const L = line.trim();
      if (!L) continue;
      if (L.startsWith("---")) {
        currentTs = Number(L.slice(3)) || 0;
        continue;
      }
      if (!currentTs) continue;
      const p = L.replace(/\\/g, "/");
      let slug = "";
      const m1 = p.match(/articles\/([^/]+)\/(?:isi\.txt|1\.(?:jpe?g|png))$/i);
      const m2 = p.match(/articles\/([^/]+)\.txt$/i);
      if (m1) slug = m1[1];
      else if (m2) slug = m2[1];
      if (!slug) continue;
      if (!_gitTimeMap.has(slug)) _gitTimeMap.set(slug, currentTs);
    }
  } catch {
    /* shallow clone / no git */
  }
  return _gitTimeMap;
}

/** Unix seconds — semakin besar = semakin baru */
function gitTimestampForSlug(slug) {
  const map = getGitTimeMap();
  if (map.has(slug)) return map.get(slug);
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
  let i = 1;
  // lewati baris kosong setelah judul
  while (i < lines.length && lines[i].trim() === "") i++;

  let date = "";
  if (i < lines.length) {
    const rawDate = lines[i].trim();
    // "2026-09-03" atau "date: 2026-09-03" / "2026-09-03 14:30"
    const mDate =
      rawDate.match(/^(\d{4}-\d{2}-\d{2})(?:[T\s]\d{2}:\d{2}(?::\d{2})?)?$/) ||
      rawDate.match(/^date\s*:\s*(\d{4}-\d{2}-\d{2})/i);
    if (mDate) {
      date = mDate[1];
      i++;
      while (i < lines.length && lines[i].trim() === "") i++;
    }
  }

  // Excerpt eksplisit HANYA jika baris pendek + diikuti baris kosong + ada isi setelahnya
  // (supaya paste teks bebas tidak menyalin judul ke bawah)
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

  let body = lines.slice(i).join("\n").trim();

  // Buang judul yang tidak sengaja ikut di awal body
  if (body === title) body = "";
  else if (body.startsWith(title + "\n")) body = body.slice(title.length).replace(/^\n+/, "").trim();
  const parts = body.split(/\n\n+/);
  if (parts.length && parts[0].trim() === title) {
    body = parts.slice(1).join("\n\n").trim();
  }

  // Untuk kartu/meta: ringkas dari body jika tidak ada excerpt eksplisit — JANGAN pakai ulang judul
  let cardExcerpt = excerpt;
  if (!cardExcerpt) {
    const plain = body.replace(/\s+/g, " ").trim();
    cardExcerpt = plain.length > 160 ? plain.slice(0, 157) + "…" : plain;
  }

  return {
    slug,
    title,
    excerpt: cardExcerpt,
    // true hanya jika penulis memang memberi ringkasan terpisah
    showDeck: Boolean(excerpt && excerpt !== title),
    date,
    body,
  };
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
    const gitTs = gitTimestampForSlug(art.slug); // detik
    const mt = mtimeForSlug(art.slug); // ms
    const gitMs = gitTs > 0 ? gitTs * 1000 : 0;

    // 1) tanggal eksplisit di file — pakai akhir hari + offset git/mtime di hari yang sama
    //    supaya dua artikel tanggal sama tetap terurut upload terbaru di atas
    if (art.date && /^\d{4}-\d{2}-\d{2}$/.test(art.date)) {
      const dayMs = Date.parse(art.date + "T00:00:00Z") || 0;
      const intra = Math.max(gitMs, mt);
      // jika git/mtime di hari yang sama, pakai itu; else tengah hari
      if (intra >= dayMs && intra < dayMs + 86400000) {
        art._sort = intra;
      } else {
        art._sort = dayMs + 12 * 3600 * 1000;
      }
      return art;
    }

    // 2) git commit (paling akurat untuk urutan upload di GitHub)
    // 3) mtime — ambil yang lebih baru dari keduanya
    art._sort = Math.max(gitMs, mt) || 0;
    if (!art.date && art._sort) art.date = toDateStr(Math.floor(art._sort / 1000));
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
