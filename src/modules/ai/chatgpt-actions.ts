"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import { fail, ok, runAction, type ActionResult } from "@/lib/action";
import { requireUser } from "@/modules/auth/session";
import { safeRedirectPath } from "@/modules/auth/constants";
import { activeRegistration } from "./chatgpt-store";
import { beginChatGptSignIn, chatGptStore, disconnectChatGpt, personalChatGpt, CHATGPT_USAGE_URL } from "./chatgpt-auth";
import { chatGptModels, chatGptResponse, selectChatGptModel, ChatGptError } from "./chatgpt";
import { ATTEMPT_COOKIE, ATTEMPT_TTL_S, CALLBACK_PATH, loopbackRedirectUri, sealAttempt } from "./chatgpt-connect";
import { chatGptStatus, type ChatGptStatus } from "./chatgpt-status";

/*
 * Every student runs their own installation and connects their own ChatGPT
 * account, so any signed-in user of this local server may manage it.
 */

const PERSONAL_OFF = "Defina CHATGPT_PERSONAL_MODE=\"on\" no .env e reinicie o servidor para conectar seu ChatGPT.";

/** ChatGptError messages are written for the user; anything else stays generic. */
async function chatGpt<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  return runAction(async () => {
    try { return await fn(); }
    catch (error) {
      if (error instanceof ChatGptError) return fail(error.message);
      throw error;
    }
  });
}

function refresh() {
  revalidatePath("/admin/ia");
  revalidatePath("/configuracoes");
}

export async function getChatGptStatusAction(path: string): Promise<ActionResult<ChatGptStatus>> {
  return chatGpt(async () => {
    await requireUser();
    return ok(await chatGptStatus((await headers()).get("host"), safeRedirectPath(path, "/configuracoes")));
  });
}

export async function startChatGptConnectionAction(input: { newAccount: boolean; popup: boolean; returnTo: string }): Promise<ActionResult<{ url: string }>> {
  return chatGpt(async () => {
    const user = await requireUser();
    if (!personalChatGpt()) return fail(PERSONAL_OFF);
    const redirectUri = loopbackRedirectUri((await headers()).get("host"));
    if (!redirectUri) return fail("Abra o Vértice pelo endereço http://127.0.0.1 (não localhost) para conectar: a OpenAI só devolve o login para esse endereço.");
    const attempt = await beginChatGptSignIn(redirectUri, input.newAccount === true);
    // Without a popup the whole tab leaves; only these two pages show the result on return.
    const returnTo = input.popup === true ? safeRedirectPath(input.returnTo, "/configuracoes") : input.returnTo === "/admin/ia" ? "/admin/ia" : "/configuracoes";
    (await cookies()).set(ATTEMPT_COOKIE, await sealAttempt(attempt, user.id, input.popup === true, returnTo), {
      httpOnly: true, secure: false, sameSite: "lax", path: CALLBACK_PATH, maxAge: ATTEMPT_TTL_S,
    });
    return ok({ url: attempt.url });
  });
}

export async function testChatGptAction(): Promise<ActionResult<{ text: string; model: string }>> {
  return chatGpt(async () => {
    await requireUser();
    if (!personalChatGpt()) return fail(PERSONAL_OFF);
    const result = await chatGptResponse({ instructions: "Responda em português.", input: [{ role: "user", content: "Responda apenas: Conexão funcionando." }] });
    if (!result.text.trim()) return fail("O ChatGPT concluiu sem texto.");
    return ok({ text: result.text.trim(), model: result.model }, "O ChatGPT respondeu. O teste consumiu uma pequena parte da franquia.");
  });
}

export async function selectChatGptModelAction(slug: string): Promise<ActionResult<null>> {
  return chatGpt(async () => {
    await requireUser();
    if (!personalChatGpt()) return fail(PERSONAL_OFF);
    const parsed = z.string().min(1).max(120).safeParse(slug);
    if (!parsed.success) return fail("Escolha um modelo.");
    if (!(await chatGptModels()).some((m) => m.slug === parsed.data)) return fail("Este modelo não está disponível nesta conta.");
    await chatGptStore.locked(async () => {
      const state = await chatGptStore.read();
      const registration = activeRegistration(state);
      if (!state || !registration) throw new ChatGptError("A conexão do ChatGPT foi encerrada.", "auth");
      registration.model = parsed.data;
      await chatGptStore.save(state);
    });
    refresh();
    return ok(null, "Modelo atualizado.");
  });
}

export async function switchChatGptAccountAction(clientId: string): Promise<ActionResult<null>> {
  return chatGpt(async () => {
    await requireUser();
    if (!personalChatGpt()) return fail(PERSONAL_OFF);
    const ready = await chatGptStore.locked(async () => {
      const state = await chatGptStore.read();
      const registration = state?.registrations.find((r) => r.clientId === clientId);
      if (!state || !registration) return null;
      state.activeClientId = registration.clientId;
      await chatGptStore.save(state);
      return !!registration.accessToken;
    });
    if (ready === null) return fail("Conta não encontrada.");
    refresh();
    if (!ready) return ok(null, "Conta selecionada. Clique em Reconectar para autorizar o uso do plano de novo.");
    if (!activeRegistration(await chatGptStore.read())?.model) await selectChatGptModel();
    return ok(null, "Conta selecionada.");
  });
}

export async function disconnectChatGptAction(): Promise<ActionResult<null>> {
  return chatGpt(async () => {
    await requireUser();
    const { revoked } = await disconnectChatGpt();
    refresh();
    return ok(null, revoked ? "ChatGPT desconectado e autorização revogada." : `Desconectado neste computador. Não foi possível confirmar a revogação; remova o Vértice também em ${CHATGPT_USAGE_URL}.`);
  });
}
