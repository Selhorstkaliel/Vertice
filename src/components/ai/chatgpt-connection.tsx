"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { LogIn, PlugZap, RefreshCw, Sparkles, Unplug, UserPlus } from "lucide-react";
import { Button, Spinner } from "@/components/ui/button";
import { Badge, Notice } from "@/components/ui/display";
import { Field, NativeSelect } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import type { ActionResult } from "@/lib/action";
import type { ChatGptStatus } from "@/modules/ai/chatgpt-status";
import { CALLBACK_RESULT, CONNECT_CHANNEL, type CallbackResult } from "@/modules/ai/chatgpt-results";
import {
  disconnectChatGptAction,
  getChatGptStatusAction,
  selectChatGptModelAction,
  startChatGptConnectionAction,
  switchChatGptAccountAction,
  testChatGptAction,
} from "@/modules/ai/chatgpt-actions";

const USAGE_URL = "https://chatgpt.com/#settings/Usage";
const PROMPT_DISMISSED = "vertice-chatgpt-prompt-dismissed";

function announce(result: CallbackResult) {
  const { tone, text } = CALLBACK_RESULT[result];
  if (tone === "positive") toast.success(text);
  else if (tone === "warning") toast.warning(text);
  else toast.error(text);
}

/** Results from the sign-in popup. BroadcastChannel first; the storage event covers browsers without it. */
function useConnectResult(onResult: (result: CallbackResult) => void) {
  const handler = React.useRef(onResult);
  React.useEffect(() => { handler.current = onResult; });
  React.useEffect(() => {
    // The popup sends on both channels: the same result twice within a few seconds counts once.
    let last = { result: "", at: 0 };
    const deliver = (result: unknown) => {
      if (typeof result !== "string" || !(result in CALLBACK_RESULT)) return;
      if (last.result === result && Date.now() - last.at < 3000) return;
      last = { result, at: Date.now() };
      handler.current(result as CallbackResult);
    };
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(CONNECT_CHANNEL);
      channel.onmessage = (e) => deliver(e.data?.result);
    } catch { /* storage event below */ }
    const onStorage = (e: StorageEvent) => {
      if (e.key === CONNECT_CHANNEL && e.newValue) deliver(e.newValue.split(":")[0]);
    };
    window.addEventListener("storage", onStorage);
    return () => { channel?.close(); window.removeEventListener("storage", onStorage); };
  }, []);
}

/** Connection controls. Used on /admin/ia, in Configurações and inside the connection dialog. */
export function ChatGptConnection({ status, returnTo, onChanged }: { status: ChatGptStatus; returnTo: string; onChanged?: () => void }) {
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);
  const [answer, setAnswer] = React.useState<string | null>(null);

  const changed = React.useCallback(() => { onChanged?.(); router.refresh(); }, [onChanged, router]);

  useConnectResult((result) => {
    setPending(null);
    announce(result);
    changed();
  });

  async function run<T>(key: string, action: () => Promise<ActionResult<T>>, after?: (data: T) => void) {
    setPending(key);
    try {
      const result = await action();
      if (!result.ok) { toast.error(result.error); return; }
      if (result.message) toast.success(result.message);
      after?.(result.data);
      changed();
    } finally {
      setPending((current) => (current === key ? null : current));
    }
  }

  function connect(newAccount: boolean) {
    const key = newAccount ? "nova" : "conectar";
    setPending(key);
    // Open synchronously in the click so the browser does not block it; navigate once the URL exists.
    const w = 520, h = 720;
    const popup = window.open("about:blank", "vertice-chatgpt-login", `popup,width=${w},height=${h},left=${Math.round(window.screenX + (window.outerWidth - w) / 2)},top=${Math.round(window.screenY + (window.outerHeight - h) / 2)}`);
    void startChatGptConnectionAction({ newAccount, popup: !!popup, returnTo }).then((result) => {
      if (!result.ok) { popup?.close(); toast.error(result.error); setPending(null); return; }
      if (!popup) { window.location.assign(result.data.url); return; }
      popup.location.href = result.data.url;
      popup.focus();
      // OpenAI's pages sever the opener, so `closed` cannot be trusted; the button frees itself after a while.
      setTimeout(() => setPending((current) => (current === key ? null : current)), 15_000);
    }, () => { popup?.close(); toast.error("Não foi possível iniciar a conexão."); setPending(null); });
  }

  if (!status.personal) {
    return (
      <Notice tone="warning" title="Modo pessoal desligado">
        Para usar seu plano do ChatGPT, defina <code>CHATGPT_PERSONAL_MODE=&quot;on&quot;</code> no arquivo <code>.env</code> do seu Vértice e reinicie o servidor.
      </Notice>
    );
  }
  if (status.unreadable) {
    return (
      <Notice tone="danger" title="Credenciais ilegíveis">
        O arquivo <code>.chatgpt/connection.enc</code> não abre com o <code>SESSION_SECRET</code> atual (o segredo mudou ou o arquivo foi corrompido). Remova a pasta <code>.chatgpt/</code> e conecte de novo.
      </Notice>
    );
  }
  if (status.loopbackUrl) {
    return (
      <Notice tone="warning" title="Abra pelo endereço 127.0.0.1" action={<Button asChild variant="primary" size="sm"><a href={status.loopbackUrl}>Abrir em 127.0.0.1</a></Button>}>
        A OpenAI só devolve o login para http://127.0.0.1. Abra o Vértice por esse endereço e entre de novo, se pedir.
      </Notice>
    );
  }

  const busy = pending !== null;
  const others = status.accounts.filter((a) => !a.active);

  return (
    <div className="flex flex-col gap-6">
      {status.connected ? (
        <p className="flex flex-wrap items-center gap-2 text-base text-fg">
          <Badge tone="positive">Conectado</Badge>
          {status.email ?? "Conta ChatGPT"}
          {status.model && <span className="text-sm text-fg-subtle">· {status.model}</span>}
        </p>
      ) : (
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-base text-fg-muted marker:text-fg-faint">
          <li>Clique em Conectar: abre uma janela com o login oficial da OpenAI.</li>
          <li>Entre na sua conta do ChatGPT (Plus ou Pro) e autorize o Vértice a usar seu plano.</li>
          <li>A janela fecha sozinha e a IA fica pronta. Nenhuma senha ou chave é digitada no Vértice.</li>
        </ol>
      )}

      <div className="flex flex-wrap gap-2">
        {status.connected ? (
          <>
            <Button variant="primary" loading={pending === "testar"} disabled={busy} onClick={() => run("testar", testChatGptAction, (d) => setAnswer(`${d.text} (${d.model})`))}>
              <PlugZap aria-hidden /> Testar conexão
            </Button>
            <Button variant="secondary" loading={pending === "conectar"} disabled={busy} onClick={() => connect(false)}>
              <RefreshCw aria-hidden /> Reconectar
            </Button>
            <Button variant="outline" loading={pending === "nova"} disabled={busy} onClick={() => connect(true)}>
              <UserPlus aria-hidden /> Outra conta
            </Button>
            <Button variant="danger" loading={pending === "sair"} disabled={busy} onClick={() => { if (confirm("Desconectar o ChatGPT? Os recursos de IA param até você conectar de novo.")) void run("sair", disconnectChatGptAction); }}>
              <Unplug aria-hidden /> Desconectar
            </Button>
          </>
        ) : (
          <>
            <Button variant="primary" size="lg" loading={pending === "conectar"} disabled={busy} onClick={() => connect(false)}>
              <LogIn aria-hidden /> {status.accounts.length ? "Reconectar ChatGPT" : "Conectar com ChatGPT"}
            </Button>
            {status.accounts.length > 0 && (
              <Button variant="outline" size="lg" loading={pending === "nova"} disabled={busy} onClick={() => connect(true)}>
                <UserPlus aria-hidden /> Usar outra conta
              </Button>
            )}
          </>
        )}
      </div>
      {(pending === "conectar" || pending === "nova") && <p className="-mt-3 text-sm text-fg-subtle">Conclua o login na janela da OpenAI. Se ela não abriu, permita pop-ups para este endereço.</p>}

      {answer && <Notice tone="positive" title="Resposta do ChatGPT">{answer}</Notice>}

      {status.connected && (
        <div className="flex max-w-md flex-col gap-2">
          {status.modelsError ? (
            <p className="text-sm text-warning">Não foi possível listar os modelos: {status.modelsError}</p>
          ) : (
            <Field
              label="Modelo"
              htmlFor="chatgpt-model"
              hint={status.envModel ? `CHATGPT_MODEL=${status.envModel} no .env tem prioridade sobre esta escolha.` : "Usado em todos os recursos de IA. A lista vem da sua conta."}
            >
              <NativeSelect value={status.model ?? ""} disabled={busy || !!status.envModel || status.models.length === 0} onChange={(e) => void run("modelo", () => selectChatGptModelAction(e.target.value))}>
                {!status.model && <option value="">Selecionar</option>}
                {status.models.map((m) => (
                  <option key={m.slug} value={m.slug}>
                    {m.name || m.slug}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
        </div>
      )}

      {others.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-md font-semibold">Outras contas salvas</h3>
          <ul className="flex flex-col">
            {others.map((a) => (
              <li key={a.clientId} className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft py-2.5 last:border-b-0">
                <span className="flex items-center gap-2 text-base text-fg">
                  {a.email ?? "Conta ChatGPT"}
                  {!a.connected && <Badge tone="neutral">Precisa reconectar</Badge>}
                </span>
                <Button size="sm" variant="ghost" loading={pending === a.clientId} disabled={busy} onClick={() => run(a.clientId, () => switchChatGptAccountAction(a.clientId))}>
                  Usar esta conta
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-sm text-fg-subtle">
        Os tokens ficam criptografados no seu computador, em <code>.chatgpt/</code>. O uso entra nos limites do seu plano:{" "}
        <a href={USAGE_URL} target="_blank" rel="noreferrer" className="text-info underline-offset-4 hover:underline">acompanhar uso no ChatGPT</a>.
      </p>
    </div>
  );
}

export function AiFeatureList({ features }: { features: ChatGptStatus["features"] }) {
  return (
    <ul className="flex flex-col">
      {features.map((f) => (
        <li key={f.name} className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1 border-b border-line-soft py-3 last:border-b-0">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-base text-fg">{f.name}</span>
            <span className="text-sm text-fg-subtle">{f.detail}</span>
          </div>
          <span className="flex items-center gap-2 text-sm text-fg-muted">
            {f.provider}
            {f.ready ? <Badge tone="positive">Pronto</Badge> : <Badge tone="warning">Não configurado</Badge>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The connection as a popup dialog: status loads when it opens. */
export function ChatGptDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const pathname = usePathname();
  const [status, setStatus] = React.useState<ChatGptStatus | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    void getChatGptStatusAction(pathname).then((r) => {
      if (r.ok) { setStatus(r.data); setError(null); } else setError(r.error);
    }, () => setError("Não foi possível carregar a conexão."));
  }, [pathname]);

  React.useEffect(() => { if (open) load(); }, [open, load]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Conectar sua IA" description="Use sua conta do ChatGPT para ler e interpretar provas, corrigir redações, conversar com o Mentor e ler editais." className="max-w-xl">
        {error ? (
          <p className="text-base text-danger">{error}</p>
        ) : !status ? (
          <div className="flex items-center gap-2 py-6 text-fg-muted"><Spinner /> Carregando…</div>
        ) : (
          <div className="flex flex-col gap-6">
            <ChatGptConnection status={status} returnTo={pathname} onChanged={load} />
            <details className="text-base">
              <summary className="cursor-pointer text-sm text-fg-muted hover:text-fg">Recursos de IA</summary>
              <div className="mt-2"><AiFeatureList features={status.features} /></div>
            </details>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Opens the dialog from any button. */
export function ChatGptDialogButton({ children, ...props }: React.ComponentProps<typeof Button>) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button {...props} onClick={() => setOpen(true)}>{children}</Button>
      <ChatGptDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

/**
 * Shown across the app while this installation has no AI connected.
 * Opens the dialog once per browser session; afterwards the banner stays as the way back.
 */
export function AiConnectPrompt() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    let dismissed = false;
    try { dismissed = sessionStorage.getItem(PROMPT_DISMISSED) === "1"; } catch { /* private mode */ }
    if (!dismissed) setOpen(true);
  }, []);

  // A connection finished in another tab also clears the banner here.
  useConnectResult((result) => { if (result === "conectado") router.refresh(); });

  function change(next: boolean) {
    setOpen(next);
    if (!next) { try { sessionStorage.setItem(PROMPT_DISMISSED, "1"); } catch { /* private mode */ } }
  }

  return (
    <>
      <Notice
        tone="info"
        title="Conecte sua IA"
        className="mb-6"
        action={<Button size="sm" variant="primary" onClick={() => setOpen(true)}><Sparkles aria-hidden /> Conectar ChatGPT</Button>}
      >
        A leitura de provas, a correção de redação e o Mentor usam a sua conta do ChatGPT.
      </Notice>
      <ChatGptDialog open={open} onOpenChange={change} />
    </>
  );
}
