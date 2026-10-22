import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { notify, type NewNotification } from "@/modules/notifications/service";

/** Text of a downloaded HTML page, honoring its declared charset (government sites still use ISO-8859-1). */
export function decodeHtml(bytes: Uint8Array) {
  const head = Buffer.from(bytes.subarray(0, 4096)).toString("latin1");
  const charset = /charset=["']?([\w-]+)/i.exec(head)?.[1]?.toLowerCase() ?? "utf-8";
  try {
    return new TextDecoder(charset === "iso-8859-1" || charset === "latin1" ? "windows-1252" : charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

export const allowLocalSources = () => env.EDITAIS_ALLOW_LOCAL_SOURCES === "on";

/** Students following a competition, including those on a customized copy of it. */
export async function followersOf(competitionId: string) {
  return db.studentCompetition.findMany({
    where: { status: { not: "ARCHIVED" }, competition: { OR: [{ id: competitionId }, { forkedFromId: competitionId }] } },
    select: { id: true, userId: true, competitionId: true, customExamDate: true, keepCustomExamDate: true },
  });
}

export async function notifyFollowers(competitionId: string, build: (userId: string) => NewNotification[]) {
  const followers = await followersOf(competitionId);
  let sent = 0;
  for (const f of followers) sent += await notify(f.userId, build(f.userId));
  return sent;
}

/**
 * Gemini response schema (OpenAPI subset) from the zod schemas used to
 * validate the answer, so the two can never drift apart.
 */
export function zodToGemini(schema: z.ZodTypeAny): Record<string, unknown> {
  const def = schema._def as { typeName: string } & Record<string, unknown>;
  switch (def.typeName) {
    case "ZodNullable":
      return { ...zodToGemini(def.innerType as z.ZodTypeAny), nullable: true };
    case "ZodOptional":
      return zodToGemini(def.innerType as z.ZodTypeAny);
    case "ZodDefault":
      return zodToGemini(def.innerType as z.ZodTypeAny);
    case "ZodEffects":
      return zodToGemini(def.schema as z.ZodTypeAny);
    case "ZodObject": {
      const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
      return { type: "OBJECT", properties: Object.fromEntries(Object.entries(shape).map(([k, v]) => [k, zodToGemini(v as z.ZodTypeAny)])), required: Object.keys(shape) };
    }
    case "ZodArray":
      return { type: "ARRAY", items: zodToGemini(def.type as z.ZodTypeAny) };
    case "ZodString":
      return { type: "STRING" };
    case "ZodNumber":
      return { type: (def.checks as { kind: string }[] | undefined)?.some((c) => c.kind === "int") ? "INTEGER" : "NUMBER" };
    case "ZodBoolean":
      return { type: "BOOLEAN" };
    case "ZodEnum":
      return { type: "STRING", enum: def.values as string[] };
    default:
      throw new Error(`zodToGemini: unsupported ${def.typeName}`);
  }
}
