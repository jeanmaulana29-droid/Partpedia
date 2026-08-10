CARA GANTI GAMBAR PRODUK (tanpa coding)

1. Siapkan foto JPG (disarankan lebar 600–1200 px).
2. Rename file menjadi sama dengan slug produk.
   Contoh: bearing 6205-2RS → slug biasanya "bearing-6205-2rs"
   Nama file: bearing-6205-2rs.jpg
3. Upload ke folder ini di GitHub:
   site/public/products/
4. Commit. Setelah Vercel Ready, gambar muncul di katalog.

Cara cek slug:
- Buka halaman produk di website
- Lihat URL, contoh: /sparepart/bearing-6205-2rs/
- Bagian terakhir = nama file (tambah .jpg)

Urutan prioritas gambar:
1. Field image_url di data.json (jika diisi URL penuh)
2. File /products/{slug}.jpg (upload kamu)
3. Gambar default per kategori
