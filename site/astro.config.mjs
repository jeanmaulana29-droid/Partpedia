import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  // GANTI: isi dengan domain final situs Anda (domain Vercel gratis atau custom domain).
  // Wajib diisi dengan benar — dipakai untuk generate sitemap.xml & canonical URL.
  site: "https://ganti-domain-anda.vercel.app",
  integrations: [sitemap()],
});
