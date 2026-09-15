import Link from "next/link";
import { Logo, LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/modules/auth/session";

const capabilities = [
  {
    title: "Planejamento",
    body: "O plano da semana é montado a partir do edital, dos seus horários livres e do seu desempenho. Cada sessão mostra por que foi escolhida.",
  },
  {
    title: "Rotina",
    body: "Compromissos fixos nunca são movidos. Os horários livres são classificados pela sua energia: conteúdo exigente vai para quando você rende mais.",
  },
  {
    title: "Questões",
    body: "Resolução com correção imediata, caderno de erros com o motivo de cada erro e transformação de questões em flashcards.",
  },
  {
    title: "Flashcards",
    body: "Repetição espaçada determinística: o intervalo de cada revisão é calculado e explicado, não sorteado.",
  },
  {
    title: "Desempenho",
    body: "Planejado contra realizado, evolução de acertos e um Índice de Preparação que diz o que sustenta o número e o que falta.",
  },
  {
    title: "Concursos militares",
    body: "Etapas configuráveis e registro do TAF em uma área própria, separada do conteúdo acadêmico.",
  },
];

const example = [
  { time: "08:00", title: "Matemática — Funções", meta: "Teoria, 50min" },
  { time: "09:20", title: "Questões de Funções", meta: "40min" },
  { time: "14:00", title: "Física — Dinâmica", meta: "Teoria, 50min", open: true },
  { time: "20:30", title: "Flashcards", meta: "20min" },
];

export default async function LandingPage() {
  const user = await getCurrentUser();

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="mx-auto flex max-w-[1200px] items-center justify-between px-5 py-5 sm:px-10">
        <Link href="/" aria-label="Vértice — página inicial" className="rounded-[var(--radius-control)]">
          <Logo />
        </Link>
        <nav aria-label="Conta" className="flex items-center gap-2">
          {user ? (
            <Button asChild variant="secondary" size="sm">
              <Link href="/painel">Ir para o dashboard</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/entrar">Entrar</Link>
              </Button>
              <Button asChild variant="primary" size="sm">
                <Link href="/cadastro">Começar preparação</Link>
              </Button>
            </>
          )}
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-[1200px] gap-16 px-5 pt-16 pb-24 sm:px-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-end lg:pt-28">
          <div className="flex flex-col gap-8">
            <h1 className="text-[clamp(3rem,8.5vw,6.25rem)] leading-[0.92] font-semibold tracking-[-0.045em] text-fg">
              Sua preparação.
              <br />
              Sob controle.
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-fg-muted">
              Vértice transforma edital, rotina e desempenho em um plano de estudos adaptativo para concursos públicos e militares.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="primary" size="lg">
                <Link href={user ? "/painel" : "/cadastro"}>Começar preparação</Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="#plataforma">Conhecer a plataforma</Link>
              </Button>
            </div>
          </div>

          <figure className="flex flex-col gap-3" aria-labelledby="example-caption">
            <figcaption id="example-caption" className="text-sm text-fg-subtle">
              Exemplo ilustrativo de um dia no plano
            </figcaption>
            <ol className="flex flex-col border-t">
              {example.map((row) => (
                <li key={row.time} className="border-b border-line-soft py-3.5">
                  <div className="flex items-baseline gap-5">
                    <span className="numeral w-12 shrink-0 text-base text-fg-subtle">{row.time}</span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-base font-medium text-fg">{row.title}</span>
                      <span className="text-sm text-fg-subtle">{row.meta}</span>
                    </span>
                  </div>
                  {row.open && (
                    <div className="mt-3 ml-[4.25rem] flex flex-col gap-1.5 border-l-2 border-performance pl-4">
                      <span className="text-sm font-medium text-fg">Por quê?</span>
                      <span className="text-sm text-fg-muted">Desempenho de 52% em Dinâmica nas últimas 34 questões, abaixo da meta de 70%.</span>
                      <span className="text-sm text-fg-muted">Horário de alta energia reservado para conteúdo exigente.</span>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </figure>
        </section>

        <section className="border-y bg-canvas-2">
          <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-5 py-16 sm:px-10 lg:flex-row lg:items-center lg:justify-between">
            <p className="max-w-3xl text-xl leading-snug font-medium tracking-[-0.02em] text-fg-muted sm:text-2xl">
              <span className="text-fg">Edital, rotina, desempenho, questões, revisões e tempo até a prova</span> entram. Sai um plano que responde o que estudar, quando, quanto e por quê.
            </p>
            <LogoMark className="hidden size-16 shrink-0 lg:block" />
          </div>
        </section>

        <section id="plataforma" className="mx-auto max-w-[1200px] scroll-mt-10 px-5 py-24 sm:px-10">
          <h2 className="max-w-xl text-2xl font-semibold tracking-[-0.025em] sm:text-3xl sm:leading-tight">Um mentor de estudos que mostra o raciocínio.</h2>
          <dl className="mt-14 flex flex-col border-t">
            {capabilities.map((c) => (
              <div key={c.title} className="grid gap-2 border-b border-line-soft py-6 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:gap-10">
                <dt className="text-lg font-medium text-fg">{c.title}</dt>
                <dd className="max-w-2xl text-md leading-relaxed text-fg-muted">{c.body}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mx-auto max-w-[1200px] px-5 pb-24 sm:px-10">
          <div className="grid gap-10 border-t pt-14 md:grid-cols-3">
            {[
              ["Sem promessas de aprovação", "O Índice de Preparação resume evidências de estudo. Não é chance de aprovação."],
              ["Sem dados inventados", "Datas, pesos e notas de corte só aparecem quando cadastrados. O resto é marcado como não verificado."],
              ["Você decide", "Sugestões de mudança no plano podem ser aceitas, editadas, ignoradas ou desfeitas."],
            ].map(([title, body]) => (
              <div key={title} className="flex flex-col gap-2">
                <h3 className="text-md font-semibold text-fg">{title}</h3>
                <p className="text-base leading-relaxed text-fg-muted">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t">
          <div className="mx-auto flex max-w-[1200px] flex-col items-start gap-6 px-5 py-20 sm:px-10 md:flex-row md:items-center md:justify-between">
            <p className="text-2xl font-semibold tracking-[-0.025em]">Precisão para chegar mais alto.</p>
            <Button asChild variant="primary" size="lg">
              <Link href={user ? "/painel" : "/cadastro"}>Começar preparação</Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-3 px-5 py-8 text-sm text-fg-subtle sm:flex-row sm:justify-between sm:px-10">
          <span>Vértice — preparação para concursos públicos e militares.</span>
          <span>Não afiliado a bancas, órgãos ou Forças Armadas.</span>
        </div>
      </footer>
    </div>
  );
}
