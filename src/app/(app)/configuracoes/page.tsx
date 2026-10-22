import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { Notice, PageHeader } from "@/components/ui/display";
import { AiFeatureList, ChatGptConnection } from "@/components/ai/chatgpt-connection";
import { chatGptStatus } from "@/modules/ai/chatgpt-status";
import { CALLBACK_RESULT, type CallbackResult } from "@/modules/ai/chatgpt-results";
import { NotificationPreferenceSwitch } from "@/components/notifications/notification-controls";
import {
  AccountForm,
  DeleteAccountDialog,
  ExportButton,
  MentorHistoryButton,
  PasswordForm,
  PreferencesForm,
  RevokeSessionsButton,
  ThemeForm,
} from "@/components/settings/account-forms";
import { requireOnboardedUser } from "@/modules/auth/session";
import { db } from "@/lib/db";
import { mentorPrivacyNote, mentorProvider } from "@/modules/mentor/provider";
import { NOTIFICATION_TYPE_LABEL } from "@/lib/labels";
import { formatDateTime, timeAgo } from "@/lib/format";

export const metadata: Metadata = { title: "Configurações" };

const SECTIONS = [
  ["conta", "Conta"],
  ["aparencia", "Aparência"],
  ["ia", "Inteligência artificial"],
  ["notificacoes", "Notificações"],
  ["rotina", "Rotina"],
  ["estudos", "Estudos"],
  ["privacidade", "Privacidade"],
  ["dados", "Dados"],
  ["seguranca", "Segurança"],
] as const;

const SECURITY_EVENT_LABEL: Record<string, string> = {
  LOGIN_SUCCESS: "Entrada na conta",
  LOGIN_FAILURE: "Tentativa de entrada com senha incorreta",
  LOGOUT: "Saída da conta",
  REGISTER: "Conta criada",
  PASSWORD_RESET_REQUESTED: "Recuperação de senha solicitada",
  PASSWORD_RESET_COMPLETED: "Senha redefinida",
  PASSWORD_CHANGED: "Senha alterada",
  DATA_EXPORTED: "Dados exportados",
};

function describeAgent(ua: string | null) {
  if (!ua) return "Navegador desconhecido";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Navegador";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "sistema desconhecido";
  return `${browser} no ${os}`;
}

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex scroll-mt-24 flex-col gap-5 border-t pt-8">
      <div className="flex max-w-2xl flex-col gap-1">
        <h2 id={`${id}-title`} className="text-lg font-semibold tracking-[-0.01em]">
          {title}
        </h2>
        {description && <p className="text-base text-fg-muted">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ resultado?: string }> }) {
  const user = await requireOnboardedUser();
  const { resultado } = await searchParams;
  const aiResult = resultado && resultado in CALLBACK_RESULT ? CALLBACK_RESULT[resultado as CallbackResult] : null;
  const p = user.profile;
  const tz = p.timezone;
  const [preferences, sessions, events, mentorCount] = await Promise.all([
    db.notificationPreference.findMany({ where: { userId: user.id }, select: { type: true, enabled: true } }),
    db.session.findMany({ where: { userId: user.id, expiresAt: { gt: new Date() } }, select: { id: true, userAgent: true, createdAt: true, lastSeenAt: true }, orderBy: { lastSeenAt: "desc" } }),
    db.securityEvent.findMany({ where: { userId: user.id }, select: { id: true, type: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 10 }),
    db.mentorMessage.count({ where: { userId: user.id } }),
  ]);
  const ai = await chatGptStatus((await headers()).get("host"), "/configuracoes");
  const muted = new Set(preferences.filter((x) => !x.enabled).map((x) => x.type));
  const others = sessions.filter((s) => s.id !== user.sessionId).length;

  return (
    <div className="flex flex-col">
      <PageHeader title="Configurações" description="Conta, aparência, notificações, preferências de rotina e estudo, privacidade e segurança." />

      <div className="grid gap-10 lg:grid-cols-[180px_minmax(0,1fr)]">
        <nav aria-label="Seções das configurações" className="max-lg:hidden">
          <ul className="sticky top-10 flex flex-col gap-1">
            {SECTIONS.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="block rounded-[var(--radius-control)] px-2 py-1.5 text-base text-fg-muted transition-colors hover:bg-surface hover:text-fg">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex min-w-0 flex-col gap-12">
          <Section id="conta" title="Conta">
            <AccountForm name={user.name} email={user.email} avatarUrl={user.avatarUrl} isDemo={user.isDemo} />
          </Section>

          <Section id="aparencia" title="Aparência" description="O tema fica salvo neste navegador.">
            <div className="max-w-xl">
              <ThemeForm />
            </div>
          </Section>

          <Section id="ia" title="Inteligência artificial" description="Conecte sua conta do ChatGPT para ler e interpretar provas, corrigir redações, conversar com o Mentor e ler editais.">
            <div className="flex max-w-2xl flex-col gap-6">
              {aiResult && <Notice tone={aiResult.tone}>{aiResult.text}</Notice>}
              {ai.personal ? (
                <ChatGptConnection status={ai} returnTo="/configuracoes" />
              ) : (
                <p className="text-base text-fg-muted">Neste servidor, a IA usa as chaves configuradas pelo administrador.</p>
              )}
              <AiFeatureList features={ai.features} />
            </div>
          </Section>

          <Section id="notificacoes" title="Notificações" description="Tipos desativados deixam de gerar avisos novos.">
            <div className="flex max-w-2xl flex-col">
              {(Object.keys(NOTIFICATION_TYPE_LABEL) as (keyof typeof NOTIFICATION_TYPE_LABEL)[]).map((type) => (
                <NotificationPreferenceSwitch key={type} type={type} label={NOTIFICATION_TYPE_LABEL[type]} enabled={!muted.has(type)} />
              ))}
            </div>
            <Link href="/notificacoes" className="text-sm text-info underline-offset-4 hover:underline">
              Abrir central de notificações
            </Link>
          </Section>

          <section aria-label="Rotina e estudos" className="flex flex-col gap-5 border-t pt-8">
            <PreferencesForm
              initial={{
                goal: p.goal ?? "",
                track: p.track,
                weeklyHoursTarget: p.weeklyHoursTarget,
                dailyStudyLimitMin: p.dailyStudyLimitMin,
                maxSessionMin: p.maxSessionMin,
                minBreakMin: p.minBreakMin,
                timezone: p.timezone,
                autoApplyMinorChanges: p.autoApplyMinorChanges,
                works: p.works,
                studiesCollege: p.studiesCollege,
                physicalPrep: p.physicalPrep,
              }}
            />
            <p className="text-sm text-fg-subtle">
              Compromissos, horários e energia por período ficam em <Link href="/rotina" className="text-info underline-offset-4 hover:underline">Rotina</Link>.
            </p>
          </section>

          <Section id="privacidade" title="Privacidade" description="O que o Vértice guarda e com quem compartilha.">
            <ul className="flex max-w-2xl list-disc flex-col gap-2 pl-5 text-base text-fg-muted marker:text-fg-faint">
              <li>Seus estudos, rotina, questões, flashcards, simulados e metas ficam no banco de dados da plataforma e só são acessíveis pela sua conta.</li>
              <li>
                {mentorProvider().configured
                  ? `Quando você conversa com o Mentor com IA: ${mentorPrivacyNote().charAt(0).toLowerCase()}${mentorPrivacyNote().slice(1)}`
                  : "O Mentor com IA não está configurado neste servidor; nenhum dado é enviado a provedores de IA."}
              </li>
              <li>Senhas são guardadas apenas como hash e nunca aparecem na exportação.</li>
            </ul>
            <div>
              <MentorHistoryButton count={mentorCount} />
            </div>
          </Section>

          <Section id="dados" title="Dados" description="Baixe uma cópia completa dos seus dados em JSON: perfil, rotina, planos, sessões, questões, erros, flashcards, simulados, metas, calendário, TAF e histórico.">
            <div>
              <ExportButton />
            </div>
          </Section>

          <Section id="seguranca" title="Segurança">
            <div className="flex flex-col gap-3">
              <h3 className="text-md font-semibold">Senha</h3>
              <PasswordForm disabled={user.isDemo} />
            </div>

            <div className="flex max-w-2xl flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-md font-semibold">Sessões ativas</h3>
                <RevokeSessionsButton others={others} />
              </div>
              <ul className="flex flex-col">
                {sessions.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-line-soft py-2.5 last:border-b-0">
                    <span className="text-base text-fg">
                      {describeAgent(s.userAgent)}
                      {s.id === user.sessionId && <span className="ml-2 text-sm text-positive">Esta sessão</span>}
                    </span>
                    <span className="text-sm text-fg-subtle">Ativa {timeAgo(s.lastSeenAt)}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex max-w-2xl flex-col gap-3">
              <h3 className="text-md font-semibold">Atividade recente</h3>
              {events.length === 0 ? (
                <p className="text-base text-fg-muted">Nenhum evento registrado.</p>
              ) : (
                <ul className="flex flex-col">
                  {events.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-line-soft py-2 last:border-b-0">
                      <span className={e.type === "LOGIN_FAILURE" ? "text-base text-warning" : "text-base text-fg-muted"}>{SECURITY_EVENT_LABEL[e.type] ?? e.type}</span>
                      <span className="numeral text-sm text-fg-subtle">{formatDateTime(e.createdAt, tz)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex max-w-2xl flex-col gap-3 rounded-[var(--radius-object)] p-4 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--danger)_35%,transparent)]">
              <h3 className="text-md font-semibold">Excluir conta</h3>
              <p className="text-base text-fg-muted">Remove a conta e todos os dados associados. Esta ação não pode ser desfeita.</p>
              <div>
                <DeleteAccountDialog disabled={user.isDemo} />
              </div>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
