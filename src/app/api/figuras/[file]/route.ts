import { getCurrentUser } from "@/modules/auth/session";
import { fileExists, loadFile } from "@/lib/storage";

export const runtime = "nodejs";

const NAME = /^[a-z0-9][a-z0-9-]{0,100}\.(png|jpg)$/;

/** Question figures, for signed-in users only. Names carry a random suffix, so a file never changes. */
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (!(await getCurrentUser())) return new Response("Não autorizado", { status: 401 });
  if (!NAME.test(file) || !(await fileExists("figuras", file))) return new Response("Figura não encontrada", { status: 404 });
  const bytes = await loadFile("figuras", file);
  return new Response(new Uint8Array(bytes), {
    headers: { "Content-Type": file.endsWith(".jpg") ? "image/jpeg" : "image/png", "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
  });
}
