import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { getCurrentUser } from "@/modules/auth/session";

/**
 * A página pública do VÉRTICE é a landing em `landing/`, publicada em outro endereço.
 * A raiz do aplicativo leva quem já entrou para o painel e os demais para a landing
 * (ou para a tela de acesso, enquanto NEXT_PUBLIC_LANDING_URL não estiver definido).
 */
export default async function RootPage() {
  if (await getCurrentUser()) redirect("/painel");
  redirect(env.NEXT_PUBLIC_LANDING_URL ?? "/entrar");
}
