import type { Metadata } from "next";
import { Bell } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui/display";
import { NotificationBulkActions, NotificationItem, NotificationPreferenceSwitch } from "@/components/notifications/notification-controls";
import { requireOnboardedUser } from "@/modules/auth/session";
import { listNotifications } from "@/modules/notifications/service";
import { NOTIFICATION_TYPE_LABEL } from "@/lib/labels";
import { timeAgo } from "@/lib/format";

export const metadata: Metadata = { title: "Notificações" };

const TYPE_DESCRIPTION: Record<keyof typeof NOTIFICATION_TYPE_LABEL, string> = {
  FLASHCARDS_DUE: "Quando 10 ou mais cartões aguardam revisão no dia.",
  SIMULATION_SOON: "Véspera de simulados agendados no calendário.",
  EXAM_COUNTDOWN: "Marcos de 90, 60, 30, 15, 7, 3 e 1 dia para a prova do concurso principal.",
  TOPIC_STALE: "Tópicos estudados sem revisão há 14 dias ou mais.",
  PLAN_RECALCULATED: "Reagendamentos aplicados automaticamente com a sua autorização.",
  GOAL: "Meta semanal de estudo concluída.",
  RECOMMENDATION: "Novas sugestões do planejador aguardando sua decisão.",
  SYSTEM: "Avisos importantes sobre a sua conta.",
};

export default async function NotificationsPage() {
  const user = await requireOnboardedUser();
  const { items, muted } = await listNotifications(user.id);
  const unread = items.filter((n) => !n.readAt).length;

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Notificações"
        description="Avisos gerados a partir do seu plano, revisões, prova e recomendações."
        actions={items.length > 0 ? <NotificationBulkActions unread={unread} read={items.length - unread} /> : null}
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-labelledby="list-title" className="flex min-w-0 flex-col">
          <h2 id="list-title" className="sr-only">
            Lista de notificações
          </h2>
          {items.length === 0 ? (
            <EmptyState
              icon={<Bell />}
              title="Nenhuma notificação"
              description="Os avisos aparecem aqui quando houver flashcards acumulados, revisões atrasadas, marcos da contagem para a prova ou sugestões para decidir."
            />
          ) : (
            <>
              <p className="pb-2 text-sm text-fg-subtle">{unread > 0 ? `${unread} não ${unread === 1 ? "lida" : "lidas"}` : "Tudo lido"}</p>
              <ul className="flex flex-col border-t">
                {items.map((n) => (
                  <NotificationItem
                    key={n.id}
                    n={{ id: n.id, title: n.title, body: n.body, href: n.href, typeLabel: NOTIFICATION_TYPE_LABEL[n.type], when: timeAgo(n.createdAt), unread: !n.readAt }}
                  />
                ))}
              </ul>
            </>
          )}
        </section>

        <section aria-labelledby="prefs-title" className="flex flex-col gap-2 lg:sticky lg:top-10 lg:self-start">
          <h2 id="prefs-title" className="text-md font-semibold tracking-[-0.01em]">
            Tipos de aviso
          </h2>
          <p className="text-sm text-fg-subtle">Tipos desativados deixam de gerar notificações novas.</p>
          <div className="flex flex-col">
            {(Object.keys(NOTIFICATION_TYPE_LABEL) as (keyof typeof NOTIFICATION_TYPE_LABEL)[]).map((type) => (
              <NotificationPreferenceSwitch key={type} type={type} label={NOTIFICATION_TYPE_LABEL[type]} description={TYPE_DESCRIPTION[type]} enabled={!muted.has(type)} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
