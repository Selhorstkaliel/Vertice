import { ROUTES } from "@/lib/routes";
import { usePageMeta } from "@/hooks/usePageMeta";
import { Container } from "@/components/ui/Container";
import { ButtonLink } from "@/components/ui/Button";

export default function NotFoundPage() {
  usePageMeta("/404");

  return (
    <section className="flex min-h-[80dvh] items-center pt-28 pb-20">
      <Container className="flex flex-col items-start gap-6">
        <p className="numeral text-sm text-fg-subtle">Erro 404</p>
        <h1 className="max-w-2xl text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">Esta página não existe.</h1>
        <p className="max-w-lg text-lg text-fg-muted">O endereço pode ter mudado ou foi digitado com erro. Volte para a página inicial e siga por lá.</p>
        <ButtonLink to={ROUTES.home}>Ir para a página inicial</ButtonLink>
      </Container>
    </section>
  );
}
