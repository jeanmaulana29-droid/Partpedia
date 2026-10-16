import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://www.klikpartpedia.com",
  trailingSlash: "always",
  integrations: [
    sitemap({
      filter: (page) => {
        const u = page.replace(/\/$/, "");
        if (u.endsWith("/convert/convert-index")) return false;
        if (u.endsWith("/tools/tools-index")) return false;
        if (u.includes("/tools/word-search/result")) return false;
        return true;
      },
    }),
  ],
});
