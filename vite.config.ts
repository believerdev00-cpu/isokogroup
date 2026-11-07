import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import fs from "fs";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { SEO_PAGES, seoFileSlug } from "./src/lib/seoPages";
import { renderAppShell, renderNotFound, renderSeoPage } from "./src/lib/seoHtml";

/**
 * After the build, writes one real HTML file per public page (src/lib/seoPages.ts),
 * so search engines and link previews see each page's own title, description,
 * canonical address and heading without running JavaScript:
 *   index.html        the home page
 *   seo/<page>.html   the other public pages (vercel.json rewrites each address to its file)
 *   app.html          the plain app, for every other route of the app
 *   404.html          served by Vercel with status 404 for addresses the site doesn't have
 */
function seoPages(): Plugin {
  let outDir = "dist";
  return {
    name: "isoko-seo-pages",
    apply: "build",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const shell = fs.readFileSync(path.join(outDir, "index.html"), "utf8");
      fs.writeFileSync(path.join(outDir, "app.html"), renderAppShell(shell));
      fs.writeFileSync(path.join(outDir, "404.html"), renderNotFound(shell));
      fs.mkdirSync(path.join(outDir, "seo"), { recursive: true });
      for (const page of SEO_PAGES) {
        const file = page.path === "/" ? "index.html" : path.join("seo", `${seoFileSlug(page.path)}.html`);
        fs.writeFileSync(path.join(outDir, file), renderSeoPage(shell, page));
      }
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger(), seoPages()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
