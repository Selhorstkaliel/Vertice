import { useEffect } from "react";
import { pageMeta } from "@/lib/pages";
import { SITE } from "@/lib/site";

function upsert(selector: string, create: () => HTMLElement, apply: (el: HTMLElement) => void) {
  let el = document.head.querySelector<HTMLElement>(selector);
  if (!el) {
    el = create();
    document.head.appendChild(el);
  }
  apply(el);
}

/**
 * Mantém título, descrição e canonical em sincronia ao navegar.
 * O HTML inicial de cada rota já vem pré-renderizado com esses mesmos valores (src/lib/pages.ts).
 */
export function usePageMeta(path: string) {
  useEffect(() => {
    const meta = pageMeta(path);
    const title = meta?.title ? `${meta.title} | ${SITE.name}` : SITE.title;
    const description = meta?.description ?? SITE.description;

    document.title = title;
    upsert('meta[name="description"]', () => Object.assign(document.createElement("meta"), { name: "description" }), (el) =>
      el.setAttribute("content", description),
    );
    upsert(
      'meta[property="og:title"]',
      () => {
        const m = document.createElement("meta");
        m.setAttribute("property", "og:title");
        return m;
      },
      (el) => el.setAttribute("content", title),
    );

    if (SITE.url) {
      upsert('link[rel="canonical"]', () => Object.assign(document.createElement("link"), { rel: "canonical" }), (el) =>
        el.setAttribute("href", `${SITE.url}${path === "/" ? "/" : path}`),
      );
    }
  }, [path]);
}
