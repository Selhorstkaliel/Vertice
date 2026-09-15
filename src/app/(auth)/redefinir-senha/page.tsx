import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/auth/auth-forms";
import { Notice } from "@/components/ui/display";

export const metadata: Metadata = { title: "Redefinir senha" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-[-0.025em]">Redefinir senha</h1>
        <p className="text-base text-fg-muted">Escolha uma nova senha para sua conta.</p>
      </div>
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <Notice
          tone="warning"
          title="Link incompleto"
          action={
            <Link href="/recuperar-senha" className="text-sm text-fg underline underline-offset-4">
              Solicitar novo link
            </Link>
          }
        >
          Abra o link completo enviado por e-mail.
        </Notice>
      )}
    </div>
  );
}
