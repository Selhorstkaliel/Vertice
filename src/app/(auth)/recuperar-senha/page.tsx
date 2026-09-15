import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/components/auth/auth-forms";
import { mailerConfigured } from "@/modules/auth/mailer";
import { isProduction } from "@/lib/env";

export const metadata: Metadata = { title: "Recuperar senha" };

export default function ForgotPasswordPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-[-0.025em]">Recuperar senha</h1>
        <p className="text-base text-fg-muted">
          Informe o e-mail da sua conta. Enviaremos um link válido por 60 minutos.
        </p>
      </div>
      <ForgotPasswordForm devHint={!mailerConfigured && !isProduction} />
      <Link href="/entrar" className="text-sm text-fg-muted underline-offset-4 hover:text-fg hover:underline">
        Voltar para o login
      </Link>
    </div>
  );
}
