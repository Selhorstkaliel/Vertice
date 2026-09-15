import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/auth-forms";
import { Notice } from "@/components/ui/display";
import { getCurrentUser } from "@/modules/auth/session";
import { safeRedirectPath } from "@/modules/auth/constants";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; sessao?: string }>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();
  if (user) redirect(safeRedirectPath(params.next));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-[-0.025em]">Entrar</h1>
        <p className="text-base text-fg-muted">
          Ainda não tem conta?{" "}
          <Link href="/cadastro" className="text-fg underline underline-offset-4 hover:text-fg-muted">
            Criar conta
          </Link>
        </p>
      </div>
      {params.sessao === "expirada" && (
        <Notice tone="neutral">Sua sessão terminou. Entre novamente para continuar.</Notice>
      )}
      <LoginForm next={params.next ? safeRedirectPath(params.next) : undefined} />
    </div>
  );
}
