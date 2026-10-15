import { z } from "zod";
import { db } from "@/lib/db";
import { limitsFor } from "@/lib/plan-limits";
import { recordAiUsage } from "@/modules/ai/usage";
import { firstName, formatClock, weekdayName } from "@/lib/format";
import { isoWeekdayOfKey, localNow } from "@/lib/time";
import { getCurrentUser } from "@/modules/auth/session";
import { rateLimit, retryMessage } from "@/modules/auth/rate-limit";
import { describeMentorError, isMentorAiConfigured, MentorRefusalError, runMentorTurn } from "@/modules/mentor/llm";
import { asGrounding, loadApiHistory, mentorUsageToday, toMessageViews } from "@/modules/mentor/queries";
import { MENTOR_MESSAGE_MAX } from "@/modules/mentor/suggestions";
import type { MentorWireEvent } from "@/modules/mentor/wire";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ message: z.string().trim().min(1, "Escreva uma mensagem.").max(MENTOR_MESSAGE_MAX, `Máximo de ${MENTOR_MESSAGE_MAX} caracteres.`) });

const json = (status: number, error: string) => Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  // Route handlers get no built-in CSRF protection: require a same-origin request.
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) return json(403, "Origem não permitida.");

  const user = await getCurrentUser();
  if (!user) return json(401, "Sua sessão expirou. Entre novamente.");
  if (!user.onboardedAt || !user.profile) return json(403, "Conclua os primeiros passos antes de usar o Mentor.");
  if (!isMentorAiConfigured()) return json(503, "O Mentor com IA não está configurado neste servidor.");

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json(400, parsed.error.issues[0]?.message ?? "Mensagem inválida.");

  const burst = await rateLimit(`mentor:${user.id}`, 10, 5 * 60_000);
  if (!burst.ok) return json(429, retryMessage(burst.retryAfterSec));
  const profile = user.profile;
  const tz = profile.timezone;
  const dailyLimit = limitsFor(user).mentorDailyMessages;
  if ((await mentorUsageToday(user.id, tz)) >= dailyLimit) {
    return json(429, `Você atingiu o limite de ${dailyLimit} mensagens por dia com o Mentor. As análises automáticas continuam disponíveis.`);
  }

  const userMessage = await db.mentorMessage.create({
    data: { userId: user.id, role: "USER", content: parsed.data.message, grounding: asGrounding({ mode: "ai" }) },
  });
  const history = await loadApiHistory(user.id, userMessage.id);
  const local = localNow(tz);
  history.push({
    role: "user",
    content: [
      {
        type: "text",
        text: `<contexto_atual>Hoje é ${weekdayName(isoWeekdayOfKey(local.key)).toLowerCase()}, ${local.key}, ${formatClock(local.minute)} (fuso ${tz}). Primeiro nome do estudante: ${firstName(user.name)}.</contexto_atual>`,
      },
      { type: "text", text: parsed.data.message },
    ],
  });

  const abort = new AbortController();
  request.signal.addEventListener("abort", () => abort.abort());
  const encoder = new TextEncoder();
  const ctx = { userId: user.id, firstName: firstName(user.name), profile };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (event: MentorWireEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          open = false;
        }
      };
      const partial = { text: "" };

      try {
        const result = await runMentorTurn(ctx, history, send, abort.signal, partial);
        if (!result.text) throw new Error("Empty Mentor answer");
        const saved = await db.mentorMessage.create({
          data: {
            userId: user.id,
            role: "ASSISTANT",
            content: result.text,
            grounding: asGrounding({ mode: "ai", sources: result.sources, recommendationIds: result.recommendationIds, model: result.model, truncated: result.truncated, usage: result.usage }),
          },
        });
        await recordAiUsage({ userId: user.id, feature: "MENTOR", model: result.model, usage: result.usage, refId: saved.id }).catch((e) => console.error("[mentor] usage log", e));
        const [view] = await toMessageViews(user.id, [saved]);
        send({ type: "done", message: view! });
      } catch (err) {
        const aborted = abort.signal.aborted;
        if (err instanceof MentorRefusalError) {
          const saved = await db.mentorMessage.create({
            data: { userId: user.id, role: "ASSISTANT", content: describeMentorError(err).message, grounding: asGrounding({ mode: "ai", refused: true }) },
          });
          const [view] = await toMessageViews(user.id, [saved]);
          send({ type: "done", message: view! });
        } else if (aborted && partial.text.trim()) {
          // Keep what the student already saw.
          await db.mentorMessage.create({
            data: { userId: user.id, role: "ASSISTANT", content: partial.text.trim(), grounding: asGrounding({ mode: "ai", interrupted: true }) },
          });
        } else {
          await db.mentorMessage.delete({ where: { id: userMessage.id } }).catch(() => undefined);
          const { message, log } = describeMentorError(err);
          if (log) console.error("[mentor] turn failed", err);
          send({ type: "error", error: message });
        }
      } finally {
        if (open) {
          open = false;
          try {
            controller.close();
          } catch {
            // already closed by the client
          }
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      // no-transform keeps compression from buffering the stream.
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
