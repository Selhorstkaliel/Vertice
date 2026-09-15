"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/display";
import {
  loginAction,
  registerAction,
  requestPasswordResetAction,
  resetPasswordAction,
  type FormState,
} from "@/modules/auth/actions";

function errorsFor(state: FormState, field: string) {
  return state && !state.ok ? state.fieldErrors?.[field] : undefined;
}

function FormError({ state }: { state: FormState }) {
  if (!state || state.ok || state.fieldErrors) return null;
  return (
    <Notice tone="danger" className="py-2.5">
      {state.error}
    </Notice>
  );
}

function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = React.useState(false);
  return (
    <div className="relative">
      <Input {...props} type={visible ? "text" : "password"} className="pr-11" />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-[var(--radius-control)] text-fg-subtle hover:text-fg"
        aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
        aria-pressed={visible}
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(loginAction, null);
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <FormError state={state} />
      {next && <input type="hidden" name="next" value={next} />}
      <Field label="E-mail" htmlFor="email" error={errorsFor(state, "email")}>
        <Input name="email" type="email" autoComplete="email" inputMode="email" required autoFocus />
      </Field>
      <Field label="Senha" htmlFor="password" error={errorsFor(state, "password")}>
        <PasswordInput name="password" autoComplete="current-password" required />
      </Field>
      <div className="-mt-2 flex justify-end">
        <Link href="/recuperar-senha" className="text-sm text-fg-muted underline-offset-4 hover:text-fg hover:underline">
          Esqueci minha senha
        </Link>
      </div>
      <Button type="submit" variant="primary" size="lg" loading={pending}>
        Entrar
      </Button>
    </form>
  );
}

export function RegisterForm() {
  const [state, action, pending] = useActionState(registerAction, null);
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <FormError state={state} />
      <Field label="Nome" htmlFor="name" error={errorsFor(state, "name")}>
        <Input name="name" autoComplete="name" required autoFocus maxLength={80} />
      </Field>
      <Field label="E-mail" htmlFor="email" error={errorsFor(state, "email")}>
        <Input name="email" type="email" autoComplete="email" inputMode="email" required />
      </Field>
      <Field label="Senha" htmlFor="password" hint="Pelo menos 8 caracteres." error={errorsFor(state, "password")}>
        <PasswordInput name="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <Button type="submit" variant="primary" size="lg" loading={pending}>
        Criar conta
      </Button>
      <p className="text-sm text-fg-subtle">
        Sua rotina, desempenho e calendário são privados. Nada é exibido publicamente.
      </p>
    </form>
  );
}

export function ForgotPasswordForm({ devHint }: { devHint: boolean }) {
  const [state, action, pending] = useActionState(requestPasswordResetAction, null);

  if (state?.ok) {
    return (
      <div className="flex flex-col gap-4">
        <Notice tone="positive">{state.message}</Notice>
        {devHint && (
          <Notice tone="neutral" title="Ambiente de desenvolvimento">
            O envio de e-mail ainda não está configurado. O link de redefinição foi impresso no terminal do servidor.
          </Notice>
        )}
        <Link href="/entrar" className="text-sm text-fg-muted underline-offset-4 hover:text-fg hover:underline">
          Voltar para o login
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <FormError state={state} />
      <Field label="E-mail da conta" htmlFor="email" error={errorsFor(state, "email")}>
        <Input name="email" type="email" autoComplete="email" inputMode="email" required autoFocus />
      </Field>
      <Button type="submit" variant="primary" size="lg" loading={pending}>
        Enviar link de redefinição
      </Button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, null);
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <FormError state={state} />
      <input type="hidden" name="token" value={token} />
      <Field label="Nova senha" htmlFor="password" hint="Pelo menos 8 caracteres." error={errorsFor(state, "password")}>
        <PasswordInput name="password" autoComplete="new-password" required autoFocus />
      </Field>
      <Field label="Confirme a nova senha" htmlFor="confirm" error={errorsFor(state, "confirm")}>
        <PasswordInput name="confirm" autoComplete="new-password" required />
      </Field>
      <Button type="submit" variant="primary" size="lg" loading={pending}>
        Redefinir senha
      </Button>
      <p className="text-sm text-fg-subtle">Por segurança, todas as sessões abertas serão encerradas.</p>
    </form>
  );
}
