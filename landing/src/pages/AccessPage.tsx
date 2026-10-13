import { useEffect } from "react";
import { ArrowLeft, ArrowUpRight, LoaderCircle } from "lucide-react";
import { ROUTES } from "@/lib/routes";
import { APP_PATHS, appLink } from "@/lib/site";
import { usePageMeta } from "@/hooks/usePageMeta";
import { Container } from "@/components/ui/Container";
import { ButtonAnchor, ButtonLink } from "@/components/ui/Button";
import { LogoMark } from "@/components/ui/Logo";
import { Reveal } from "@/animations/Reveal";

type Kind = "login" | "signup" | "dashboard";

const content: Record<Kind, { path: string; appPath: (typeof APP_PATHS)[keyof typeof APP_PATHS]; title: string; body: string; action: string }> = {
  login: {
    path: ROUTES.login,
    appPath: APP_PATHS.login,
    title: "Entrar no VÉRTICE",
    body: "O acesso à sua conta acontece no aplicativo, onde ficam seu plano, suas questões e seu desempenho.",
    action: "Ir para o login",
  },
  signup: {
    path: ROUTES.signup,
    appPath: APP_PATHS.signup,
    title: "Criar sua conta",
    body: "O cadastro acontece no aplicativo. Depois dele, você escolhe o concurso, informa sua rotina e recebe o primeiro plano.",
    action: "Ir para o cadastro",
  },
  dashboard: {
    path: ROUTES.dashboard,
    appPath: APP_PATHS.dashboard,
    title: "Seu painel",
    body: "O painel fica no aplicativo e mostra o plano do dia, o progresso e as próximas revisões da sua conta.",
    action: "Abrir o painel",
  },
};

/**
 * Ponte entre a landing e o aplicativo. Não há autenticação aqui: com o endereço do app configurado,
 * a página redireciona para a rota real (o botão fica como alternativa); sem ele, diz que o acesso não está disponível.
 */
export default function AccessPage({ kind }: { kind: Kind }) {
  const c = content[kind];
  const href = appLink(c.appPath);
  usePageMeta(c.path);

  useEffect(() => {
    if (href) window.location.replace(href);
  }, [href]);

  return (
    <section className="relative isolate flex min-h-dvh items-center overflow-hidden pt-28 pb-20">
      <div aria-hidden className="precision-grid pointer-events-none absolute inset-0 -z-10" />
      <Container className="flex justify-center">
        <Reveal className="w-full max-w-md rounded-[var(--radius-window)] border border-line bg-canvas-2 p-8 sm:p-10">
          <LogoMark className="size-8 text-fg" />
          <h1 className="mt-6 text-3xl font-semibold tracking-[-0.03em]">{c.title}</h1>
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-fg-muted">{c.body}</p>

          {href ? (
            <>
              <p role="status" className="mt-6 flex items-center gap-2 text-sm text-fg-subtle">
                <LoaderCircle aria-hidden className="size-4 animate-spin" />
                Abrindo o aplicativo…
              </p>
              <ButtonAnchor href={href} size="lg" className="mt-4 w-full" icon={<ArrowUpRight className="size-4" />}>
                {c.action}
              </ButtonAnchor>
            </>
          ) : (
            <div role="status" className="mt-8 rounded-[12px] border border-dashed border-line-strong p-4 text-sm leading-relaxed text-fg-muted">
              O acesso ao aplicativo ainda não está disponível por este endereço.
            </div>
          )}

          <ButtonLink to={ROUTES.home} variant="ghost" size="sm" className="mt-4 -ml-3.5">
            <ArrowLeft aria-hidden className="size-4" />
            Voltar para a página inicial
          </ButtonLink>
        </Reveal>
      </Container>
    </section>
  );
}
