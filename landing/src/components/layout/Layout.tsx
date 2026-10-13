import { useEffect } from "react";
import { Outlet, useLocation } from "react-router";
import { MotionConfig } from "framer-motion";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";

/** Rola até a âncora da URL (inclusive vindo de outra rota) ou volta ao topo ao trocar de página. */
function ScrollManager() {
  const { pathname, hash, key } = useLocation();

  useEffect(() => {
    if (!hash) {
      window.scrollTo({ top: 0, behavior: "instant" });
      return;
    }
    const id = decodeURIComponent(hash.slice(1));
    let frame = 0;
    let tries = 0;
    // Seções com lazy loading podem demorar alguns quadros para existir.
    const seek = () => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ block: "start" });
        return;
      }
      if (tries++ < 60) frame = requestAnimationFrame(seek);
    };
    seek();
    return () => cancelAnimationFrame(frame);
  }, [pathname, hash, key]);

  return null;
}

export function Layout() {
  return (
    <MotionConfig reducedMotion="user">
      <ScrollManager />
      <Navbar />
      {/* tabIndex=-1 recebe o foco vindo do link "Pular para o conteúdo"; o anel só aparece nesse caso. */}
      <main id="conteudo" tabIndex={-1}>
        <Outlet />
      </main>
      <Footer />
    </MotionConfig>
  );
}
