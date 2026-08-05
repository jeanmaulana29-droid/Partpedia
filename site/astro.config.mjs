import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://partpedia.vercel.app",
  integrations: [sitemap()],
});
