import type { Metadata } from "next";
import { Notice, PageHeader } from "@/components/ui/display";
import { MentorChat } from "@/components/mentor/mentor-chat";
import { ClearConversationButton } from "@/components/mentor/clear-conversation";
import { DecisionCard } from "@/components/recommendations/decision-card";
import { requireOnboardedUser } from "@/modules/auth/session";
import { getMentorStatus, getMentorThread } from "@/modules/mentor/queries";
import { listRecommendationPanel } from "@/modules/recommendations/service";
import { plural } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Mentor" };

export default async function MentorPage() {
  const user = await requireOnboardedUser();
  const [thread, status, panel] = await Promise.all([
    getMentorThread(user.id),
    getMentorStatus(user.id, user.profile.timezone),
    listRecommendationPanel(user.id),
  ]);

  // Proposals already shown under a message are not repeated in the side panel.
  const inThread = new Set(thread.flatMap((m) => m.recommendations.map((r) => r.id)));
  const pendingElsewhere = panel.pending.filter((r) => !inThread.has(r.id));
  const pendingInThread = panel.pending.length - pendingElsewhere.length;

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Vértice Mentor"
        description="Converse sobre seu plano, rotina e desempenho. As respostas usam seus dados e explicam o porquê; nada muda sem a sua aprovação."
        actions={thread.length > 0 ? <ClearConversationButton /> : null}
      />

      {status.aiEnabled ? (
        <p className="-mt-2 mb-6 max-w-2xl text-sm text-fg-subtle">
          {status.privacyNote} Datas, pesos e regras sem confirmação aparecem como informação não verificada.
        </p>
      ) : (
        <Notice tone="neutral" title="Conversa com IA não configurada" className="mb-6">
          Este servidor não tem chave de acesso ao serviço de IA. As análises automáticas abaixo funcionam com os seus dados, sem IA, e nenhuma resposta é simulada.
        </Notice>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <MentorChat initialMessages={thread} aiEnabled={status.aiEnabled} dailyLimit={status.dailyLimit} usedToday={status.usedToday} />

        {/* On phones the panel only appears when something outside the conversation awaits a decision. */}
        <aside
          aria-labelledby="recs-title"
          className={cn("flex flex-col gap-6 max-lg:order-first lg:sticky lg:top-10 lg:self-start", pendingElsewhere.length === 0 && "max-lg:hidden")}
        >
          <section className="flex flex-col gap-3">
            <h2 id="recs-title" className="text-md font-semibold tracking-[-0.01em]">
              Aguardando sua decisão
            </h2>
            {pendingElsewhere.map((rec) => (
              <DecisionCard key={rec.id} rec={rec} />
            ))}
            {pendingInThread > 0 && (
              <p className="text-sm text-fg-subtle">{plural(pendingInThread, "sugestão está na conversa", "sugestões estão na conversa")}.</p>
            )}
            {panel.pending.length === 0 && <p className="text-base text-fg-muted">Nenhuma recomendação pendente.</p>}
          </section>

          {panel.recent.length > 0 && (
            // On phones the conversation matters more; applied proposals still offer Desfazer inline.
            <section aria-labelledby="recent-title" className="flex flex-col gap-3 max-lg:hidden">
              <h2 id="recent-title" className="text-md font-semibold tracking-[-0.01em]">
                Decisões recentes
              </h2>
              {panel.recent.map((rec) => (
                <DecisionCard key={rec.id} rec={rec} compact />
              ))}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
