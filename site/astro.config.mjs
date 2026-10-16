import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://www.klikpartpedia.com",
  // Satu bentuk URL saja — hindari /page dan /page/ sama-sama 200 (penyebab canonical GSC)
  trailingSlash: "always",
  integrations: [sitemap()],
});
