import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { env } from "@/lib/env";
import { ChatGptError, chatGptFailure } from "./chatgpt-protocol";
import { activeRegistration, ChatGptStore, type ChatGptRegistration } from "./chatgpt-store";

export const CHATGPT_RESOURCE = "https://api.openai.com/v1";
export const CHATGPT_USAGE_URL = "https://chatgpt.com/#settings/Usage";
export const CHATGPT_SCOPES = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
export const chatGptStore = new ChatGptStore(path.resolve(process.cwd(), ".chatgpt"), env.SESSION_SECRET);
export const personalChatGpt = () => env.CHATGPT_PERSONAL_MODE === "on";

export function chatGptConfigured() {
  if (!personalChatGpt()) return false;
  try {
    const registration = activeRegistration(chatGptStore.readSync());
    return !!registration?.accessToken && registration.scopes.includes("chatgpt.tokens.use.direct");
  } catch { return false; }
}

interface Metadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  revocation_endpoint: string;
}
let metadataPromise: Promise<Metadata> | undefined;
export async function chatGptMetadata(): Promise<Metadata> {
  metadataPromise ??= (async () => {
    const response = await fetch("https://auth.openai.com/.well-known/openid-configuration", { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new ChatGptError("Não foi possível consultar a configuração oficial de login do ChatGPT.");
    const metadata = await response.json() as Metadata;
    if (metadata.issuer !== "https://auth.openai.com") throw new ChatGptError("Emissor inesperado no login do ChatGPT.", "auth");
    for (const key of ["authorization_endpoint", "token_endpoint", "jwks_uri", "revocation_endpoint"] as const) {
      if (new URL(metadata[key]).origin !== "https://auth.openai.com") throw new ChatGptError("Endpoint inesperado no login do ChatGPT.", "auth");
    }
    return metadata;
  })().catch((error) => { metadataPromise = undefined; throw error; });
  return metadataPromise;
}

type TokenResponse = { access_token: string; refresh_token?: string; id_token?: string; expires_in: number; scope?: string };
async function tokenRequest(params: URLSearchParams): Promise<TokenResponse> {
  const metadata = await chatGptMetadata();
  const response = await fetch(metadata.token_endpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: params, signal: AbortSignal.timeout(20_000) });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw chatGptFailure(response.status, body, response.headers.get("x-request-id") ?? undefined);
  const tokens = body as TokenResponse;
  if (!tokens.access_token || !Number.isFinite(tokens.expires_in) || tokens.expires_in <= 0) throw new ChatGptError("O login do ChatGPT não devolveu credenciais válidas.", "auth");
  return tokens;
}

export async function beginChatGptSignIn(redirectUri: string, newAccount = false) {
  const uri = new URL(redirectUri);
  if (uri.protocol !== "http:" || uri.hostname !== "127.0.0.1" || uri.pathname !== "/auth/callback" || uri.search || uri.hash) throw new Error("O callback precisa ser http://127.0.0.1:<porta>/auth/callback.");
  const metadata = await chatGptMetadata();
  const registration = await chatGptStore.locked(async () => {
    const state = await chatGptStore.read() ?? { version: 1 as const, hostId: `urn:uuid:${randomUUID()}`, activeClientId: null, registrations: [] };
    await chatGptStore.save(state);
    return { state, previous: newAccount ? null : activeRegistration(state) };
  });
  const state = randomBytes(32).toString("base64url");
  const nonce = randomBytes(32).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const clientId = registration.previous?.clientId ?? (!newAccount ? registration.state.pendingClientId : undefined) ?? "dynamic_agent_client";
  const url = new URL(metadata.authorization_endpoint);
  url.search = new URLSearchParams({
    client_id: clientId,
    ...(clientId === "dynamic_agent_client" ? { agent_name_hint: "Vértice" } : {}),
    ext_agent_host_id: registration.state.hostId,
    response_type: "code", redirect_uri: redirectUri, scope: CHATGPT_SCOPES, resource: CHATGPT_RESOURCE,
    state, nonce, code_challenge_method: "S256", code_challenge: createHash("sha256").update(verifier).digest("base64url"),
  }).toString();
  return { url: url.toString(), state, nonce, verifier, redirectUri, clientId };
}

export async function completeChatGptSignIn(attempt: Awaited<ReturnType<typeof beginChatGptSignIn>>, callback: URL) {
  if (callback.searchParams.get("state") !== attempt.state) throw new ChatGptError("A resposta de login não corresponde à tentativa iniciada.", "auth");
  if (callback.searchParams.has("error")) throw new ChatGptError("A autorização do ChatGPT foi cancelada ou recusada.", "auth");
  const code = callback.searchParams.get("code");
  const clientId = attempt.clientId === "dynamic_agent_client" ? callback.searchParams.get("client_id") : attempt.clientId;
  if (!code || !clientId || clientId === "dynamic_agent_client") throw new ChatGptError("O login do ChatGPT não retornou código e registro válidos.", "auth");
  // Preserve a newly issued registration before exchanging its one-time code.
  if (attempt.clientId === "dynamic_agent_client") await chatGptStore.locked(async () => {
    const state = (await chatGptStore.read())!;
    state.pendingClientId = clientId;
    await chatGptStore.save(state);
  });
  const tokens = await tokenRequest(new URLSearchParams({ grant_type: "authorization_code", client_id: clientId, code, code_verifier: attempt.verifier, redirect_uri: attempt.redirectUri, resource: CHATGPT_RESOURCE }));
  if (!tokens.id_token) throw new ChatGptError("O ChatGPT não devolveu identidade verificável.", "auth");
  const metadata = await chatGptMetadata();
  const { payload } = await jwtVerify(tokens.id_token, createRemoteJWKSet(new URL(metadata.jwks_uri)), { issuer: metadata.issuer, audience: clientId, algorithms: ["RS256", "ES256"], requiredClaims: ["sub", "exp", "iat", "nonce"], clockTolerance: 5 });
  if (!payload.sub || payload.nonce !== attempt.nonce) throw new ChatGptError("A identidade do ChatGPT não passou na validação.", "auth");
  const registration: ChatGptRegistration = {
    clientId, subject: payload.sub, email: typeof payload.email === "string" ? payload.email : undefined,
    accessToken: tokens.access_token, refreshToken: tokens.refresh_token,
    scopes: (tokens.scope ?? "").split(/\s+/).filter(Boolean), expiresAt: Date.now() + tokens.expires_in * 1000,
  };
  await chatGptStore.locked(async () => {
    const state = (await chatGptStore.read())!;
    const previous = state.registrations.find((r) => r.clientId === clientId);
    if (previous && previous.subject !== registration.subject) throw new ChatGptError("O registro do ChatGPT pertence a outra identidade.", "auth");
    state.registrations = state.registrations.filter((r) => r.clientId !== clientId);
    state.registrations.push(registration);
    state.activeClientId = clientId;
    delete state.pendingClientId;
    await chatGptStore.save(state);
  });
  return registration;
}

/** Serialize refresh, re-read the latest credentials, and retain the returned rotating token. */
export async function chatGptAccess(): Promise<ChatGptRegistration & { accessToken: string }> {
  if (!personalChatGpt()) throw new ChatGptError("Ative CHATGPT_PERSONAL_MODE=on para usar seu plano pessoal.", "auth");
  return chatGptStore.locked(async () => {
    const state = await chatGptStore.read();
    const registration = activeRegistration(state);
    if (!registration?.accessToken || !registration.scopes.includes("chatgpt.tokens.use.direct")) throw new ChatGptError("Conecte seu ChatGPT e autorize o uso do plano: Admin › Conexão de IA (/admin/ia) ou npm run chatgpt -- conectar.", "auth");
    if (registration.expiresAt < Date.now() + 60_000) {
      if (!registration.refreshToken) throw new ChatGptError("A conexão do ChatGPT expirou. Reconecte em Admin › Conexão de IA (/admin/ia) ou com npm run chatgpt -- conectar.", "auth");
      let tokens: TokenResponse;
      try {
        tokens = await tokenRequest(new URLSearchParams({ grant_type: "refresh_token", client_id: registration.clientId, refresh_token: registration.refreshToken, resource: CHATGPT_RESOURCE }));
      } catch (error) {
        if (error instanceof ChatGptError && /^(invalid_grant|invalid_refresh_token|refresh_token_|token_expired|token_invalidated)/.test(error.code ?? "")) {
          delete registration.accessToken;
          delete registration.refreshToken;
          registration.scopes = [];
          registration.expiresAt = 0;
          await chatGptStore.save(state!);
        }
        throw error;
      }
      registration.accessToken = tokens.access_token;
      registration.refreshToken = tokens.refresh_token ?? registration.refreshToken;
      registration.expiresAt = Date.now() + tokens.expires_in * 1000;
      if (tokens.scope !== undefined) registration.scopes = tokens.scope.split(/\s+/).filter(Boolean);
      await chatGptStore.save(state!);
      if (!registration.scopes.includes("chatgpt.tokens.use.direct")) throw new ChatGptError("O ChatGPT não autorizou o uso do plano nesta conexão.", "auth");
    }
    return registration as ChatGptRegistration & { accessToken: string };
  });
}

export async function disconnectChatGpt() {
  return chatGptStore.locked(async () => {
    const state = await chatGptStore.read();
    const registration = activeRegistration(state);
    if (!state || !registration) return { revoked: true };
    let revoked = false;
    if (registration.refreshToken) {
      try {
        const metadata = await chatGptMetadata();
        const response = await fetch(metadata.revocation_endpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: registration.refreshToken, token_type_hint: "refresh_token", client_id: registration.clientId }), signal: AbortSignal.timeout(20_000) });
        revoked = response.ok;
      } catch { /* Still disconnect locally; caller explains remote revocation was not confirmed. */ }
    }
    delete registration.accessToken;
    delete registration.refreshToken;
    registration.scopes = [];
    registration.expiresAt = 0;
    await chatGptStore.save(state);
    return { revoked };
  });
}
