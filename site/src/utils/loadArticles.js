/**
 * Urutan artikel: TERBARU index 0 = kiri carousel / atas knowledge.
 *
 * Sumber sort (prioritas):
 *   1) site/src/data/articles-order.json — slug terbaru→terlama (STABIL di Vercel)
 *   2) tanggal di isi.txt
 *   3) git / mtime (cadangan)
 *
 * Artikel baru (slug belum di order.json) otomatis di posisi paling depan.
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

let _gitFirstMap = null;
function getGitFirstMap() {
  if (_gitFirstMap) return _gitFirstMap;
  _gitFirstMap = new Map();
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
    if (slug && !_gitFirstMap.has(slug)) _gitFirstMap.set(slug, currentTs);
  }
  return _gitFirstMap;
}

function gitTimestampForSlug(slug) {
  const first = getGitFirstMap().get(slug) || 0;
  if (first > 0) return first;
  for (const rel of [
    `site/src/data/articles/${slug}/isi.txt`,
    `site/src/data/articles/${slug}.txt`,
  ]) {
    const d = runGit(`git log -1 --format=%ct -- "${rel}"`).trim();
    const n = Number(d);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function mtimeForSlug(slug) {
  let best = 0;
  for (const p of [
    path.join(articlesRoot, slug, "isi.txt"),
    path.join(articlesRoot, `${slug}.txt`),
  ]) {
    try {
      const st = fs.statSync(p);
      if (st.mtimeMs > best) best = st.mtimeMs;
    } catch {}
  }
  return best;
}

function mtimesAreClustered(mtimes) {
  const vals = mtimes.filter((x) => x > 0);
  if (vals.length < 3) return false;
  return Math.max(...vals) - Math.min(...vals) < 3 * 60 * 1000;
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
    if (Array.isArray(data))
      return data.map(String).filter((s) => s && !String(s).startsWith("//"));
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
      dateMs =
        Date.parse(
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

  return { slug, title, excerpt, body, date: date || "", _dateMs: dateMs };
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

  const bySlug = new Map();
  const manualOrder = loadManualOrder();
  const orderIndex = new Map(manualOrder.map((s, i) => [s, i]));
  const hasOrder = orderIndex.size > 0;

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

  const mtimeProbe = [];
  const slugFromFolder = (p) => p.replace(/\\/g, "/").split("/").slice(-2, -1)[0];
  const slugFromFlat = (p) =>
    (p.replace(/\\/g, "/").split("/").pop() || "").replace(/\.txt$/i, "");

  for (const p in folderTexts) {
    const slug = slugFromFolder(p);
    if (slug) mtimeProbe.push(mtimeForSlug(slug));
  }
  const ignoreMtime = mtimesAreClustered(mtimeProbe);

  function attachSortKey(art) {
    const gitTs = gitTimestampForSlug(art.slug);
    const mt = ignoreMtime ? 0 : mtimeForSlug(art.slug);
    const gitMs = gitTs > 0 ? gitTs * 1000 : 0;

    if (art._dateMs > 0) {
      art._sort = art._dateMs;
      if (!art.date) art.date = toDateStr(Math.floor(art._dateMs / 1000));
      return art;
    }
    if (art.date && /^\d{4}-\d{2}-\d{2}$/.test(art.date)) {
      art._sort = Date.parse(art.date + "T12:00:00Z") || 0;
      return art;
    }
    art._sort = Math.max(gitMs, mt) || 0;
    if (!art.date && art._sort) art.date = toDateStr(Math.floor(art._sort / 1000));
    if (!art.date) art.date = "1970-01-01";
    return art;
  }

  for (const p in folderTexts) {
    const slug = slugFromFolder(p);
    if (!slug || slug === "articles") continue;
    bySlug.set(slug, attachSortKey(attachImages(parseArticleText(folderTexts[p], slug))));
  }
  for (const p in flatTexts) {
    const slug = slugFromFlat(p);
    if (!slug || bySlug.has(slug)) continue;
    bySlug.set(slug, attachSortKey(attachImages(parseArticleText(flatTexts[p], slug))));
  }

  const list = [...bySlug.values()];
  list.sort((a, b) => {
    if (hasOrder) {
      const ia = orderIndex.has(a.slug) ? orderIndex.get(a.slug) : -1;
      const ib = orderIndex.has(b.slug) ? orderIndex.get(b.slug) : -1;
      if (ia < 0 && ib < 0) {
        const d = (b._sort || 0) - (a._sort || 0);
        if (d !== 0) return d;
        return String(b.slug).localeCompare(String(a.slug));
      }
      if (ia < 0) return -1; // baru → depan
      if (ib < 0) return 1;
      return ia - ib;
    }
    const d = (b._sort || 0) - (a._sort || 0);
    if (d !== 0) return d;
    return String(b.slug).localeCompare(String(a.slug));
  });
  return list;
}
