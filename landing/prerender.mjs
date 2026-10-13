import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Gera o HTML de cada rota indexável a partir do build de servidor, para que buscadores e prévias
 * de link recebam a página pronta. No navegador, o JavaScript hidrata esse mesmo HTML.
 */
const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, "dist");
const ssrDir = join(root, "dist-ssr");

const { render, indexablePaths } = await import(new URL("dist-ssr/entry-server.js", import.meta.url).href);
const template = readFileSync(join(dist, "index.html"), "utf8");

const escapeAttr = (value) => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
const replaceContent = (html, pattern, value) => html.replace(pattern, (m) => m.replace(/content="[^"]*"/, `content="${escapeAttr(value)}"`));

// A 404 entra junto: é o arquivo que hospedagens estáticas servem para endereços desconhecidos.
for (const path of [...indexablePaths, "/404"]) {
  const { html, title, description, canonical } = await render(path);

  let page = template
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeAttr(title)}</title>`)
    .replace('<div id="root"></div>', `<div id="root">${html}</div>`);

  page = replaceContent(page, /<meta\s+name="description"[^>]*>/, description);
  page = replaceContent(page, /<meta\s+property="og:title"[^>]*>/, title);
  page = replaceContent(page, /<meta\s+name="twitter:title"[^>]*>/, title);
  page = replaceContent(page, /<meta\s+property="og:description"[^>]*>/, description);
  page = replaceContent(page, /<meta\s+name="twitter:description"[^>]*>/, description);

  if (canonical) {
    page = page
      .replace(/<link\s+rel="canonical"[^>]*>/, `<link rel="canonical" href="${escapeAttr(canonical)}">`)
      .replace(/<meta\s+property="og:url"[^>]*>/, `<meta property="og:url" content="${escapeAttr(canonical)}">`);
  } else {
    // Páginas fora do sitemap não apontam canonical para a home.
    page = page.replace(/<link\s+rel="canonical"[^>]*>\s*/, "").replace(/<meta\s+property="og:url"[^>]*>\s*/, "");
  }

  // Dois arquivos por rota: `/recursos.html` e `/recursos/index.html`, porque
  // hospedagens estáticas resolvem o endereço sem barra final de um jeito ou de outro.
  let files;
  if (path === "/") files = [join(dist, "index.html")];
  else if (path === "/404") files = [join(dist, "404.html")];
  else files = [join(dist, `${path.slice(1)}.html`), join(dist, path.slice(1), "index.html")];
  for (const file of files) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, page);
  }
  console.log(`pré-renderizado ${path}`);
}

rmSync(ssrDir, { recursive: true, force: true });
