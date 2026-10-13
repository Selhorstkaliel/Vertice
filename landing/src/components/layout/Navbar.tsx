import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { ROUTES } from "@/lib/routes";
import { primaryNav } from "@/data/navigation";
import { useScrolled } from "@/hooks/useScrolled";
import { EASE } from "@/animations/motion";
import { Container } from "@/components/ui/Container";
import { Logo } from "@/components/ui/Logo";
import { ButtonLink } from "@/components/ui/Button";

export function Navbar() {
  const scrolled = useScrolled();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setOpen(false), [location.pathname, location.hash]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.querySelector<HTMLElement>("a")?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    const onResize = () => window.matchMedia("(min-width: 1024px)").matches && setOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  const solid = scrolled || open;

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 border-b transition-[background-color,border-color,backdrop-filter] duration-300",
        solid ? "border-line-soft bg-canvas/80 backdrop-blur-xl backdrop-saturate-150" : "border-transparent bg-transparent",
      )}
    >
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-10 focus:rounded-md focus:bg-fg focus:px-3 focus:py-2 focus:text-sm focus:text-canvas"
      >
        Pular para o conteúdo
      </a>
      <Container className="flex h-16 items-center gap-6 lg:h-[72px] xl:gap-8">
        <Link to={ROUTES.home} aria-label="VÉRTICE, página inicial" className="shrink-0 rounded-md">
          <Logo />
        </Link>

        <nav aria-label="Principal" className="hidden flex-1 lg:block">
          <ul className="flex items-center justify-center gap-0.5 xl:gap-1">
            {primaryNav.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className="rounded-full px-2.5 py-2 text-sm whitespace-nowrap text-fg-muted transition-colors duration-200 hover:bg-white/[0.04] hover:text-fg xl:px-3.5"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto hidden items-center gap-2 lg:flex">
          <ButtonLink to={ROUTES.login} variant="ghost" size="sm">
            Entrar
          </ButtonLink>
          <ButtonLink to={ROUTES.signup} variant="primary" size="sm">
            Começar agora
          </ButtonLink>
        </div>

        <button
          ref={toggleRef}
          type="button"
          className="ml-auto grid size-10 place-items-center rounded-full border border-line text-fg transition-colors hover:bg-white/[0.05] lg:hidden"
          aria-expanded={open}
          aria-controls="menu-movel"
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="size-[18px]" aria-hidden /> : <Menu className="size-[18px]" aria-hidden />}
        </button>
      </Container>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            id="menu-movel"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="h-[calc(100dvh-64px)] overflow-y-auto overscroll-contain border-t border-line-soft bg-canvas lg:hidden"
          >
            <Container className="flex min-h-full flex-col py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
              <nav aria-label="Principal (móvel)">
                <ul className="flex flex-col">
                  {primaryNav.map((item, i) => (
                    <motion.li
                      key={item.to}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.04 * i, duration: 0.3, ease: EASE }}
                      className="border-b border-line-soft"
                    >
                      <Link to={item.to} className="flex items-center justify-between py-4 text-xl font-medium tracking-[-0.02em] text-fg">
                        {item.label}
                      </Link>
                    </motion.li>
                  ))}
                </ul>
              </nav>
              <div className="mt-auto grid gap-3 pt-10">
                <ButtonLink to={ROUTES.signup} variant="primary" size="lg">
                  Começar agora
                </ButtonLink>
                <ButtonLink to={ROUTES.login} variant="secondary" size="lg">
                  Entrar
                </ButtonLink>
              </div>
            </Container>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
