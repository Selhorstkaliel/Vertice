import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { RegisterForm } from "@/components/auth/auth-forms";
import { getCurrentUser } from "@/modules/auth/session";

export const metadata: Metadata = { title: "Criar conta" };

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/painel");

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-[-0.025em]">Criar conta</h1>
        <p className="text-base text-fg-muted">
          Já tem conta?{" "}
          <Link href="/entrar" className="text-fg underline underline-offset-4 hover:text-fg-muted">
            Entrar
          </Link>
        </p>
      </div>
      <RegisterForm />
    </div>
  );
}
