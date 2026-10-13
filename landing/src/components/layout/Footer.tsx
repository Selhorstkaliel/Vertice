import { Link } from "react-router";
import { ROUTES } from "@/lib/routes";
import { SITE } from "@/lib/site";
import { footerNav, socialLinks } from "@/data/navigation";
import { Container } from "@/components/ui/Container";
import { Logo } from "@/components/ui/Logo";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-line-soft bg-canvas">
      <Container className="grid grid-cols-1 gap-12 py-16 md:grid-cols-12 md:gap-8 lg:py-20">
        <div className="flex flex-col gap-4 md:col-span-5">
          <Link to={ROUTES.home} aria-label="VÉRTICE, página inicial" className="self-start rounded-md">
            <Logo />
          </Link>
          <p className="text-sm text-fg-muted">{SITE.slogan}</p>
        </div>

        <nav aria-label="Rodapé" className="grid grid-cols-2 gap-8 sm:grid-cols-3 md:col-span-7">
          {footerNav.map((group) => (
            <div key={group.title} className="flex flex-col gap-4">
              <h2 className="text-sm font-medium text-fg">{group.title}</h2>
              <ul className="flex flex-col gap-2.5">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <Link to={link.to} className="text-sm text-fg-subtle transition-colors hover:text-fg">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {socialLinks.length > 0 && (
            <div className="flex flex-col gap-4">
              <h2 className="text-sm font-medium text-fg">Social</h2>
              <ul className="flex flex-col gap-2.5">
                {socialLinks.map((link) => (
                  <li key={link.href}>
                    <a href={link.href} target="_blank" rel="noreferrer" className="text-sm text-fg-subtle transition-colors hover:text-fg">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </nav>
      </Container>
      <Container>
        <div className="flex flex-col gap-2 border-t border-line-soft py-6 text-xs text-fg-subtle sm:flex-row sm:justify-between">
          {/* O ano vem do build e é recalculado na hidratação; a virada de ano não precisa avisar. */}
          <span suppressHydrationWarning>
            © {year} {SITE.name}
          </span>
          <span>Não afiliado a bancas, órgãos públicos ou Forças Armadas.</span>
        </div>
      </Container>
    </footer>
  );
}
