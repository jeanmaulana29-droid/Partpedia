/**
 * Satu folder = satu artikel:
 *   site/src/data/articles/{slug}/isi.txt + 1.jpg|jpeg + 2.jpg|jpeg
 *
 * Urutan: TERBARU di index 0 (kiri carousel / atas knowledge).
 *
 * Prioritas sort (stabil antar-deploy Vercel):
 *   1) baris tanggal di isi.txt: YYYY-MM-DD atau YYYY-MM-DD HH:mm[:ss]
 *   2) git: waktu COMMIT PERTAMA yang menambah isi.txt (tidak berubah saat file lain di-edit)
 *   3) git: commit terakhir (cadangan)
 *   4) mtime — HANYA jika tidak "semua file sama" (ciri checkout Vercel)
 *   5) articles-order.json (opsional): daftar slug terbaru→terlama
 *
 * Catatan: mtime di Vercel sering identik untuk semua file → dulu membuat urutan
 * "acak" (fallback alfabet slug). Itu yang diperbaiki di sini.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const articlesRoot = path.resolve(__dirname, "../data/articles");
const orderFile = path.resolve(__dirname, "../data/articles-order.json");

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

function runGit(cmd) {
  try {
    return execSync(cmd, {
      encoding: "utf8",
      maxBuffer: 40 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return "";
  }
}

/** Map slug → unix seconds (commit PERTAMA yang menambah artikel). */
let _gitFirstMap = null;
function getGitFirstMap() {
  if (_gitFirstMap) return _gitFirstMap;
  _gitFirstMap = new Map();
  // --diff-filter=A = hanya penambahan file → waktu "lahir" artikel stabil
  const out = runGit(
    "git log --diff-filter=A --format='---%ct' --name-only -- site/src/data/articles src/data/articles"
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
    // log dari baru→lama: set HANYA jika belum ada → nilai = commit pertama (paling lama)
    // Kita ingin commit pertama = waktu lahir. Karena log baru→lama, jangan overwrite:
    // commit terakhir di log untuk file yang ditambahkan = yang paling lama = first.
    // Actually git log default is newest first. First time we SEE a slug is the NEWEST addition commit.
    // For --diff-filter=A there's usually only one addition commit. First seen = the only one.
    if (!_gitFirstMap.has(slug)) _gitFirstMap.set(slug, currentTs);
  }
  return _gitFirstMap;
}

/** Map slug → unix seconds (commit TERAKHIR menyentuh artikel). */
let _gitLastMap = null;
function getGitLastMap() {
  if (_gitLastMap) return _gitLastMap;
  _gitLastMap = new Map();
  const out = runGit(
    "git log --format='---%ct' --name-only -- site/src/data/articles src/data/articles"
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
    if (!_gitLastMap.has(slug)) _gitLastMap.set(slug, currentTs);
  }
  return _gitLastMap;
}

function gitTimestampForSlug(slug) {
  const first = getGitFirstMap().get(slug) || 0;
  const last = getGitLastMap().get(slug) || 0;
  // Utamakan first (stabil). Jika first kosong, pakai last.
  if (first > 0) return first;
  if (last > 0) return last;
  // Cadangan: satu file
  const candidates = [
    `site/src/data/articles/${slug}/isi.txt`,
    `src/data/articles/${slug}/isi.txt`,
    `site/src/data/articles/${slug}.txt`,
    `src/data/articles/${slug}.txt`,
  ];
  for (const rel of candidates) {
    const d = runGit(`git log -1 --diff-filter=A --format=%ct -- "${rel}"`).trim();
    const n = Number(d);
    if (Number.isFinite(n) && n > 0) return n;
    const d2 = runGit(`git log -1 --format=%ct -- "${rel}"`).trim();
    const n2 = Number(d2);
    if (Number.isFinite(n2) && n2 > 0) return n2;
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

/** true jika hampir semua mtime sama (ciri clone Vercel) → mtime tidak boleh dipakai sort */
function mtimesAreClustered(mtimes) {
  const vals = mtimes.filter((x) => x > 0);
  if (vals.length < 3) return false;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  // semua dalam rentang 3 menit → cluster
  return max - min < 3 * 60 * 1000;
}

function toDateStr(tsSec) {
  if (!tsSec) return "1970-01-01";
  const d = new Date(tsSec * 1000);
  if (Number.isNaN(d.getTime())) return "1970-01-01";
  return d.toISOString().slice(0, 10);
}

function loadManualOrder() {
  try {
    const raw = fs.readFileSync(orderFile, "utf8");
    const data = JSON.parse(raw);
    if (Array.isArray(data)) return data.map(String);
    if (Array.isArray(data?.order)) return data.order.map(String);
  } catch {}
  return [];
}

export function parseArticleText(raw, slug) {
  const lines = String(raw || "").replace(/^\uFEFF/, "").split(/\r?\n/);
  const title = (lines[0] || slug).trim();
  let i = 1;
  while (i < lines.length && lines[i].trim() === "") i++;

  let date = "";
  let dateMs = 0;
  if (i < lines.length) {
    const rawDate = lines[i].trim();
    // YYYY-MM-DD HH:mm[:ss] atau date: ...
    const mFull =
      rawDate.match(
        /^(\d{4}-\d{2}-\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?$/
      ) ||
      rawDate.match(
        /^date\s*:\s*(\d{4}-\d{2}-\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/i
      );
    if (mFull) {
      date = mFull[1];
      const hh = mFull[2] != null ? Number(mFull[2]) : 12;
      const mm = mFull[3] != null ? Number(mFull[3]) : 0;
      const ss = mFull[4] != null ? Number(mFull[4]) : 0;
      dateMs = Date.parse(
        `${date}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}Z`
      ) || 0;
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

  return {
    slug,
    title,
    excerpt,
    body,
    date: date || "",
    _dateMs: dateMs,
  };
}

function resolveImg(slug, n, imgUrls) {
  const keys = Object.keys(imgUrls || {});
  const re = new RegExp(
    `/articles/${slug}/${n}\\.(jpe?g|png)$`.replace(/\//g, "/"),
    "i"
  );
  for (const k of keys) {
    const norm = k.replace(/\\/g, "/");
    if (re.test(norm) || norm.endsWith(`/articles/${slug}/${n}.jpg`) || norm.endsWith(`/articles/${slug}/${n}.jpeg`) || norm.endsWith(`/articles/${slug}/${n}.png`)) {
      return imgUrls[k];
    }
  }
  // vite keys sometimes relative
  for (const k of keys) {
    const norm = k.replace(/\\/g, "/");
    if (norm.includes(`/articles/${slug}/`) && new RegExp(`/${n}\\.(jpe?g|png)$`, "i").test(norm)) {
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
  const imgUrls = import.meta.glob("../data/articles/*/*.{jpg,jpeg,png,JPG,JPEG,PNG}", {
    eager: true,
    query: "?url",
    import: "default",
  });

  const bySlug = new Map();
  const manualOrder = loadManualOrder();
  const orderIndex = new Map(manualOrder.map((s, i) => [s, i]));

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

  // Kumpulkan mtime dulu untuk deteksi cluster
  const mtimeProbe = [];
  function collectSlugFromPath(p, isFolder) {
    const parts = p.replace(/\\/g, "/").split("/");
    if (isFolder) return parts[parts.length - 2];
    const base = parts[parts.length - 1] || "";
    return base.replace(/\.txt$/i, "");
  }
  for (const p in folderTexts) {
    const slug = collectSlugFromPath(p, true);
    if (slug) mtimeProbe.push(mtimeForSlug(slug));
  }
  const ignoreMtime = mtimesAreClustered(mtimeProbe);

  function attachSortKey(art) {
    const gitTs = gitTimestampForSlug(art.slug); // detik
    const mt = ignoreMtime ? 0 : mtimeForSlug(art.slug); // ms
    const gitMs = gitTs > 0 ? gitTs * 1000 : 0;

    // 1) tanggal eksplisit di file (dengan jam jika ada)
    if (art._dateMs > 0) {
      art._sort = art._dateMs;
      if (!art.date) art.date = toDateStr(Math.floor(art._dateMs / 1000));
      return art;
    }
    if (art.date && /^\d{4}-\d{2}-\d{2}$/.test(art.date)) {
      const dayMs = Date.parse(art.date + "T12:00:00Z") || 0;
      // gabung dengan git di hari yang sama agar urutan upload sama-hari stabil
      if (gitMs >= dayMs - 12 * 3600 * 1000 && gitMs <= dayMs + 36 * 3600 * 1000) {
        art._sort = gitMs;
      } else {
        art._sort = dayMs;
      }
      return art;
    }

    // 2) git (waktu lahir / commit) — stabil di Vercel jika history cukup dalam
    // 3) mtime hanya jika tidak cluster
    art._sort = Math.max(gitMs, mt) || 0;
    if (!art.date && art._sort) art.date = toDateStr(Math.floor(art._sort / 1000));
    if (!art.date) art.date = "1970-01-01";
    return art;
  }

  for (const p in folderTexts) {
    const slug = collectSlugFromPath(p, true);
    if (!slug || slug === "articles") continue;
    let art = parseArticleText(folderTexts[p], slug);
    art = attachSortKey(attachImages(art));
    bySlug.set(slug, art);
  }

  for (const p in flatTexts) {
    const slug = collectSlugFromPath(p, false);
    if (!slug || bySlug.has(slug)) continue;
    let art = parseArticleText(flatTexts[p], slug);
    art = attachSortKey(attachImages(art));
    bySlug.set(slug, art);
  }

  const list = [...bySlug.values()];
  list.sort((a, b) => {
    // Manual order file: index kecil = lebih baru
    const ia = orderIndex.has(a.slug) ? orderIndex.get(a.slug) : null;
    const ib = orderIndex.has(b.slug) ? orderIndex.get(b.slug) : null;
    if (ia != null && ib != null && ia !== ib) return ia - ib;
    // slug baru (belum di order file) di atas yang sudah di-order jika _sort lebih besar
    if (ia == null && ib != null) {
      // bandingkan _sort vs "anggap order item lebih tua"
      return -1; // tanpa entry di order → anggap kandidat lebih baru (upload baru)
    }
    if (ia != null && ib == null) return 1;

    const d = (b._sort || 0) - (a._sort || 0);
    if (d !== 0) return d;
    // stabil: slug terbalik biar tidak terasa "acak abjad A→Z"
    return String(b.slug).localeCompare(String(a.slug));
  });
  return list;
}
