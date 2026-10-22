import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let cached: string | null = null;

/** The build this server runs, so open tabs notice an update (see components/app/update-guard). */
export async function GET() {
  cached ??= await readFile(path.join(process.cwd(), ".next", "BUILD_ID"), "utf8").then((s) => s.trim()).catch(() => "development");
  return Response.json({ build: cached }, { headers: { "Cache-Control": "no-store" } });
}
