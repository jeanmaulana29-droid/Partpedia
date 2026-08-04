// Pemetaan warna kategori yang konsisten di seluruh situs (kartu, badge, plate).
// Dihitung dari hash nama kategori supaya otomatis bekerja untuk kategori baru
// tanpa perlu didaftarkan manual satu-satu.
const PALETTE = [
  { name: "amber", bg: "#fdf1de", fg: "#8a5a13", accent: "#e8a33d" },
  { name: "teal", bg: "#e8f0ee", fg: "#2f5148", accent: "#4c7a6b" },
  { name: "steel", bg: "#eceff0", fg: "#3d4a52", accent: "#6b7a82" },
];

export function getCategoryTheme(category = "") {
  let hash = 0;
  for (let i = 0; i < category.length; i++) {
    hash = (hash * 31 + category.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}
