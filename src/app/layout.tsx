import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Providers } from "@/components/providers";
import { ServiceWorkerRegistration } from "@/components/service-worker";
import "katex/dist/katex.min.css";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Vértice — Precisão para chegar mais alto",
    template: "%s · Vértice",
  },
  description:
    "Vértice transforma edital, rotina e desempenho em um plano de estudos adaptativo para concursos públicos e militares.",
  applicationName: "Vértice",
  appleWebApp: { capable: true, title: "Vértice", statusBarStyle: "black-translucent" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#090B0F" },
    { media: "(prefers-color-scheme: light)", color: "#F6F7F9" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="pt-BR"
      className={`dark ${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <body>
        <Providers>{children}</Providers>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
