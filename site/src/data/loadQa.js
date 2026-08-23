/**
 * Q&A Insight loader
 * - site/src/data/qa.json  (utama)
 * - opsional: site/src/data/qa/{slug}/isi.txt
 */
import qaData from "./qa.json";

function parseFolderText(raw, slug) {
  const lines = String(raw || "").replace(/^\uFEFF/, "").split(/\r?\n/);
  const question = (lines[0] || slug).trim();
  let i = 1;
  while (i < lines.length && lines[i].trim() === "") i++;
  const bodyLines = lines.slice(i);
  const joined = bodyLines.join("\n");
  const sm = joined.match(/\n\s*Sumber:\s*(.+)$/is);
  let answer = joined.trim();
  let source = "";
  if (sm) {
    source = sm[1].trim();
    answer = joined.slice(0, sm.index).trim();
  }
  return { slug, question, answer, source };
}

export function loadAllQa() {
  const bySlug = new Map();

  // 1) JSON utama — di-bundle Vite (andal di Vercel)
  const arr = Array.isArray(qaData) ? qaData : [];
  for (const it of arr) {
    if (!it?.slug || !it?.question) continue;
    bySlug.set(it.slug, {
      id: Number(it.id) || 0,
      slug: String(it.slug),
      question: String(it.question).trim(),
      answer: String(it.answer || "").trim(),
      source: String(it.source || "").trim(),
    });
  }

  // 2) Folder tambahan (opsional)
  try {
    const folderTexts = import.meta.glob("./qa/*/isi.txt", {
      eager: true,
      query: "?raw",
      import: "default",
    });
    for (const p in folderTexts) {
      const parts = p.replace(/\\/g, "/").split("/");
      const slug = parts[parts.length - 2];
      if (!slug || slug === "qa") continue;
      const parsed = parseFolderText(folderTexts[p], slug);
      const prev = bySlug.get(slug);
      bySlug.set(slug, {
        id: prev?.id || 0,
        slug,
        question: parsed.question,
        answer: parsed.answer,
        source: parsed.source || prev?.source || "",
      });
    }
  } catch (_) {
    /* folder opsional */
  }

  const list = [...bySlug.values()];
  list.sort((a, b) => {
    if (a.id && b.id && a.id !== b.id) return a.id - b.id;
    if (a.id && !b.id) return -1;
    if (!a.id && b.id) return 1;
    return String(a.slug).localeCompare(String(b.slug));
  });
  return list;
}

export function getQa(slug) {
  return loadAllQa().find((x) => x.slug === slug) || null;
}
