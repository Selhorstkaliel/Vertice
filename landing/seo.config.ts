import type { Plugin } from "vite";
import { indexablePaths } from "./src/lib/pages.ts";

/**
 * Injeta as tags que precisam de URL absoluta e gera robots.txt e sitemap.xml no build.
 * Sem VITE_SITE_URL, nada absoluto é inventado: canonical e sitemap ficam de fora.
 * O canonical de cada rota é escrito depois, pela pré-renderização (prerender.mjs).
 */
export function seo(siteUrl: string | undefined): Plugin {
  const base = siteUrl?.replace(/\/+$/, "");

  return {
    name: "vertice-seo",
    transformIndexHtml(_html, ctx) {
      const tags = [];

      // A fonte do texto visível acima da dobra é baixada em paralelo com o CSS.
      const font = ctx.bundle && Object.keys(ctx.bundle).find((file) => /geist-latin-wght-normal.*\.woff2$/.test(file));
      if (font) {
        tags.push({
          tag: "link",
          attrs: { rel: "preload", as: "font", type: "font/woff2", href: `/${font}`, crossorigin: "" },
          injectTo: "head-prepend" as const,
        });
      }

      if (!base) return tags;
      return [
        ...tags,
        { tag: "link", attrs: { rel: "canonical", href: `${base}/` }, injectTo: "head" },
        { tag: "meta", attrs: { property: "og:url", content: `${base}/` }, injectTo: "head" },
        { tag: "meta", attrs: { property: "og:image", content: `${base}/og-image.png` }, injectTo: "head" },
        { tag: "meta", attrs: { name: "twitter:image", content: `${base}/og-image.png` }, injectTo: "head" },
      ];
    },
    generateBundle() {
      const robots = ["User-agent: *", "Allow: /", "Disallow: /dashboard", ...(base ? ["", `Sitemap: ${base}/sitemap.xml`] : [])];
      this.emitFile({ type: "asset", fileName: "robots.txt", source: `${robots.join("\n")}\n` });

      if (!base) {
        this.warn("VITE_SITE_URL não definido: canonical, og:url e sitemap.xml não foram gerados.");
        return;
      }
      const urls = indexablePaths.map((path) => `  <url><loc>${base}${path}</loc></url>`);
      this.emitFile({
        type: "asset",
        fileName: "sitemap.xml",
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`,
      });
    },
  };
}
