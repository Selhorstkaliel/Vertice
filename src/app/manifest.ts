import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Vértice",
    short_name: "Vértice",
    description: "Plano de estudos adaptativo para concursos públicos e militares.",
    lang: "pt-BR",
    start_url: "/painel",
    scope: "/",
    display: "standalone",
    background_color: "#090B0F",
    theme_color: "#090B0F",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Missão do dia", url: "/missao" },
      { name: "Revisão offline", url: "/revisao-offline" },
    ],
  };
}
