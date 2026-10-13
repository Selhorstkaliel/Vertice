import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { seo } from "./seo.config.ts";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");

  // Sem VITE_SITE_URL, na Vercel o endereço de produção do projeto serve de endereço público.
  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const siteUrl = env.VITE_SITE_URL || (vercelUrl ? `https://${vercelUrl}` : undefined);

  return {
    plugins: [react(), tailwindcss(), seo(siteUrl)],
    define: { "import.meta.env.VITE_SITE_URL": JSON.stringify(siteUrl) },
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    build: {
      // Bibliotecas em um pedaço próprio: elas mudam pouco e continuam em cache entre publicações.
      rollupOptions: {
        output: {
          manualChunks: (id: string) => {
            if (!id.includes("node_modules")) return undefined;
            const isMotion = ["framer-motion", "motion-dom", "motion-utils"].some((pkg) => id.includes(pkg));
            return isMotion ? "motion" : "vendor";
          },
        },
      },
    },
    server: { port: 5173 },
  };
});
