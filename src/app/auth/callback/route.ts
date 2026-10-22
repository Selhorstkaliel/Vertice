import { cookies } from "next/headers";
import { getCurrentUser } from "@/modules/auth/session";
import { safeRedirectPath } from "@/modules/auth/constants";
import { completeChatGptSignIn, personalChatGpt } from "@/modules/ai/chatgpt-auth";
import { selectChatGptModel } from "@/modules/ai/chatgpt";
import { ATTEMPT_COOKIE, CALLBACK_PATH, CALLBACK_RESULT, CONNECT_CHANNEL, openAttempt, type CallbackResult } from "@/modules/ai/chatgpt-connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

/** Inside the sign-in popup: tell the app window, then close. Falls back to a link if the browser keeps it open. */
function popupPage(result: CallbackResult, returnTo: string) {
  const message = JSON.stringify({ type: "result", result }).replace(/</g, "\\u003c");
  const back = `${returnTo}${returnTo.includes("?") ? "&" : "?"}resultado=${result}`;
  return new Response(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vértice</title>
<style>body{font:16px/1.5 system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh;background:#111;color:#eee;text-align:center;padding:16px}a{color:#7ab7ff}</style></head>
<body><main><p>${CALLBACK_RESULT[result].text}</p><p>Você pode fechar esta janela. <a href="${back}">Voltar ao Vértice</a></p></main>
<script>try{new BroadcastChannel(${JSON.stringify(CONNECT_CHANNEL)}).postMessage(${message})}catch(e){}try{localStorage.setItem(${JSON.stringify(CONNECT_CHANNEL)},${JSON.stringify(result)}+":"+Date.now())}catch(e){}setTimeout(function(){window.close()},150)</script></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8", ...NO_STORE } },
  );
}

/** OAuth callback of the browser connection started from the connection dialog or /admin/ia. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !personalChatGpt()) return new Response("Não encontrado.", { status: 404 });
  const jar = await cookies();
  const opened = await openAttempt(jar.get(ATTEMPT_COOKIE)?.value, user.id);
  jar.delete({ name: ATTEMPT_COOKIE, path: CALLBACK_PATH });
  const attempt = opened?.attempt;
  const returnTo = safeRedirectPath(opened?.returnTo, "/configuracoes");

  // Relative: Next reports request.url with the configured app host, not the 127.0.0.1 the browser used.
  const back = (result: CallbackResult) =>
    opened?.popup
      ? popupPage(result, returnTo)
      : new Response(null, { status: 303, headers: { Location: `${returnTo}${returnTo.includes("?") ? "&" : "?"}resultado=${result}`, ...NO_STORE } });

  const callback = new URL(request.url);
  if (!attempt || callback.searchParams.get("state") !== attempt.state) return back("expirado");
  if (callback.searchParams.has("error")) return back("cancelado");
  try {
    // Exchange against the exact URI sent in the authorization request, not the proxied request URL.
    const redirect = new URL(attempt.redirectUri);
    redirect.search = callback.search;
    const registration = await completeChatGptSignIn(attempt, redirect);
    if (!registration.scopes.includes("chatgpt.tokens.use.direct")) return back("escopo");
  } catch (error) {
    // Never log callback URLs, codes or token bodies.
    console.error("[chatgpt] conexão não concluída:", error instanceof Error ? error.message : "erro desconhecido");
    return back("falha");
  }
  try {
    await selectChatGptModel();
  } catch (error) {
    console.error("[chatgpt] modelo não selecionado:", error instanceof Error ? error.message : "erro desconhecido");
    return back("sem-modelo");
  }
  return back("conectado");
}
