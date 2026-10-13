import { renderToString } from "react-dom/server";
import { createStaticHandler, createStaticRouter, StaticRouterProvider } from "react-router";
import { routes } from "./routes";
import { pageMeta } from "./lib/pages";
import { SITE } from "./lib/site";

export { indexablePaths } from "./lib/pages";

/** Renderiza uma rota para HTML no build. Consumido por prerender.mjs. */
export async function render(path: string) {
  const handler = createStaticHandler(routes);
  const context = await handler.query(new Request(`http://localhost${path}`));
  if (context instanceof Response) throw new Error(`A rota ${path} respondeu com um redirecionamento.`);

  const router = createStaticRouter(handler.dataRoutes, context);
  const html = renderToString(<StaticRouterProvider router={router} context={context} />);
  const meta = pageMeta(path);

  return {
    html,
    title: meta?.title ? `${meta.title} | ${SITE.name}` : SITE.title,
    description: meta?.description ?? SITE.description,
    // Páginas fora do sitemap (acesso e 404) não recebem canonical.
    canonical: SITE.url && meta?.indexable ? `${SITE.url}${path}` : undefined,
  };
}
