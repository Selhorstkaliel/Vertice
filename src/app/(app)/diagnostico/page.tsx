import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Notice, PageHeader } from "@/components/ui/display";
import { StartDiagnosticButton } from "@/components/simulations/start-diagnostic";
import { requireOnboardedUser } from "@/modules/auth/session";
import { getDiagnosticOffer } from "@/modules/simulations/diagnostic";
import { plural } from "@/lib/format";

export const metadata: Metadata = { title: "Diagnóstico" };

export default async function DiagnosticPage({ searchParams }: { searchParams: Promise<{ inicio?: string }> }) {
  const user = await requireOnboardedUser();
  const { inicio } = await searchParams;
  const offer = await getDiagnosticOffer(user.id);
  const skipHref = inicio ? "/rotina?inicio=1" : "/painel";
  const skipLabel = inicio ? "Pular e montar minha rotina" : "Agora não";

  if (!offer) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Diagnóstico" />
        <Notice tone="warning">Escolha um concurso principal para fazer o diagnóstico.</Notice>
      </div>
    );
  }

  const { plan } = offer;
  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <PageHeader
        title="Diagnóstico inicial"
        description={`Opcional. Um retrato do seu nível hoje em ${offer.competitionName}, para o primeiro plano já começar pelos seus pontos fracos.`}
      />

      {offer.existing?.status === "IN_PROGRESS" ? (
        <Notice tone="info" title="Diagnóstico em andamento">
          <span className="mt-2 flex flex-wrap gap-2">
            <Button asChild variant="primary" size="sm">
              <Link href={`/simulados/tentativa/${offer.existing.id}`}>Continuar diagnóstico</Link>
            </Button>
          </span>
        </Notice>
      ) : offer.existing ? (
        <Notice tone="positive" title="Você já fez o diagnóstico">
          <span className="mt-2 flex flex-wrap gap-2">
            <Button asChild variant="secondary" size="sm">
              <Link href={`/simulados/resultado/${offer.existing.id}`}>Ver resultado</Link>
            </Button>
          </span>
        </Notice>
      ) : null}

      {plan.status === "UNAVAILABLE" ? (
        <Notice tone="warning" title="Ainda não dá para montar o diagnóstico">
          Há {plural(offer.officialTotal, "questão oficial publicada", "questões oficiais publicadas")} de {offer.competitionName} no banco, poucas para um retrato confiável. O plano
          começa pelo edital e se ajusta conforme você resolve questões.
        </Notice>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            <p className="text-base text-fg">
              {plural(plan.total, "questão oficial", "questões oficiais")} de provas anteriores, sem cronômetro. Tempo sugerido: cerca de {plan.suggestedMinutes} minutos.
            </p>
            <ul className="flex flex-col gap-1 text-base text-fg-muted">
              {offer.split.map((s) => (
                <li key={s.name}>
                  {s.name}: {s.questions}
                </li>
              ))}
            </ul>
            <p className="text-sm text-fg-subtle">
              {plan.basis === "WEIGHT"
                ? "Distribuídas pelos pesos confirmados do edital."
                : "Distribuídas pela quantidade de questões de cada disciplina nas provas oficiais do banco, já que os pesos do edital não estão todos confirmados."}{" "}
              Só entram questões de provas oficiais; nenhuma questão gerada por IA.
            </p>
          </div>
          {plan.status === "REDUCED" && (
            <Notice tone="warning" title="Diagnóstico reduzido">
              Este concurso ainda tem poucas questões oficiais publicadas, então o diagnóstico tem só {plan.total}. Ele dá uma primeira pista, não um retrato completo.
            </Notice>
          )}
        </>
      )}

      <div className="flex flex-wrap gap-2 border-t pt-6">
        {plan.status !== "UNAVAILABLE" && !offer.existing && <StartDiagnosticButton label="Começar diagnóstico" />}
        <Button asChild variant={plan.status === "UNAVAILABLE" || offer.existing ? "primary" : "ghost"} size="lg">
          <Link href={skipHref}>{plan.status === "UNAVAILABLE" || offer.existing ? (inicio ? "Montar minha rotina" : "Voltar ao painel") : skipLabel}</Link>
        </Button>
      </div>
    </div>
  );
}
