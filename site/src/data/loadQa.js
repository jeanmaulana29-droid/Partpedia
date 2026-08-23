/**
 * Q&A Insight loader
 * - site/src/data/qa.json  (utama, 24+ item)
 * - opsional: site/src/data/qa/{slug}/isi.txt
 *   baris1 = pertanyaan
 *   baris2 = (opsional) Sumber: ...
 *   sisanya = jawaban
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function parseFolderText(raw, slug) {
  const lines = String(raw || "").replace(/^\uFEFF/, "").split(/\r?\n/);
  const question = (lines[0] || slug).trim();
  let i = 1;
  while (i < lines.length && lines[i].trim() === "") i++;
  let source = "";
  let bodyLines = lines.slice(i);
  // sumber bisa di baris terakhir "Sumber: ..."
  const joined = bodyLines.join("\n");
  const sm = joined.match(/\n\s*Sumber:\s*(.+)$/is);
  let answer = joined.trim();
  if (sm) {
    source = sm[1].trim();
    answer = joined.slice(0, sm.index).trim();
  }
  return { slug, question, answer, source, id: 0 };
}

export function loadAllQa() {
  const bySlug = new Map();

  // 1) JSON utama
  try {
    const jp = path.join(__dirname, "qa.json");
    if (fs.existsSync(jp)) {
      const arr = JSON.parse(fs.readFileSync(jp, "utf8"));
      for (const it of arr) {
        if (!it?.slug || !it?.question) continue;
        bySlug.set(it.slug, {
          id: Number(it.id) || 0,
          slug: it.slug,
          question: String(it.question).trim(),
          answer: String(it.answer || "").trim(),
          source: String(it.source || "").trim(),
        });
      }
    }
  } catch (e) {
    console.warn("qa.json load failed", e);
  }

  // 2) Folder tambahan site/src/data/qa/*/isi.txt
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
      // folder override / tambah
      const prev = bySlug.get(slug);
      bySlug.set(slug, {
        id: prev?.id || 0,
        slug,
        question: parsed.question,
        answer: parsed.answer,
        source: parsed.source || prev?.source || "",
      });
    }
  } catch (e) {
    console.warn("qa folder load", e);
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
