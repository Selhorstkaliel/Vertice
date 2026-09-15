"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Download, ImageUp, LogOut, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox, ChoiceGroup, Switch } from "@/components/ui/controls";
import { Notice } from "@/components/ui/display";
import { Field, Input, Label, NativeSelect } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/overlay";
import { Avatar } from "@/components/app/app-shell";
import {
  changePasswordAction,
  deleteAccountAction,
  deleteMentorHistoryAction,
  removeAvatarAction,
  revokeOtherSessionsAction,
  updateNameAction,
  updatePreferencesAction,
  uploadAvatarAction,
  type PreferencesInput,
} from "@/modules/account/actions";

type Errors = Record<string, string[] | undefined>;

function useSubmit() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [errors, setErrors] = React.useState<Errors>({});
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string; fieldErrors?: Errors }>, after?: () => void) =>
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.error);
        return;
      }
      setErrors({});
      if (r.message) toast.success(r.message);
      after?.();
      router.refresh();
    });
  return { pending, errors, run };
}

/* ─────────────────────────────── Conta ── */

/** Resizes to a centered 256 px square so uploads stay small regardless of the original photo. */
async function resizeAvatar(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const size = 256;
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("blob"))), "image/jpeg", 0.86));
}

export function AccountForm({ name, email, avatarUrl, isDemo }: { name: string; email: string; avatarUrl: string | null; isDemo: boolean }) {
  const [value, setValue] = React.useState(name);
  const { pending, errors, run } = useSubmit();
  const fileRef = React.useRef<HTMLInputElement>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      toast.error("Use uma imagem PNG, JPEG ou WebP.");
      return;
    }
    let blob: Blob;
    try {
      blob = await resizeAvatar(file);
    } catch {
      toast.error("Não foi possível ler esta imagem.");
      return;
    }
    const fd = new FormData();
    fd.set("avatar", new File([blob], "avatar.jpg", { type: "image/jpeg" }));
    run(() => uploadAvatarAction(fd));
  };

  return (
    <div className="flex flex-col gap-6">
      {isDemo && <Notice tone="neutral">Conta de demonstração: nome, foto, senha e exclusão ficam bloqueados. As preferências podem ser testadas.</Notice>}
      <div className="flex flex-wrap items-center gap-4">
        <Avatar name={name} src={avatarUrl} className="size-16 text-base" />
        <div className="flex flex-wrap gap-2">
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => void onFile(e.target.files?.[0]).finally(() => (e.target.value = ""))} />
          <Button variant="secondary" size="sm" disabled={isDemo} loading={pending} onClick={() => fileRef.current?.click()}>
            <ImageUp />
            {avatarUrl ? "Trocar foto" : "Enviar foto"}
          </Button>
          {avatarUrl && (
            <Button variant="ghost" size="sm" disabled={isDemo || pending} onClick={() => run(removeAvatarAction)}>
              Remover foto
            </Button>
          )}
        </div>
      </div>
      <form
        className="flex max-w-md flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => updateNameAction(value));
        }}
      >
        <Field label="Nome" htmlFor="acc-name" error={errors.name}>
          <Input value={value} onChange={(e) => setValue(e.target.value)} maxLength={80} disabled={isDemo} autoComplete="name" />
        </Field>
        <Field label="E-mail" htmlFor="acc-email" hint="O e-mail é usado para entrar e recuperar a senha.">
          <Input value={email} readOnly disabled />
        </Field>
        <div>
          <Button type="submit" variant="secondary" loading={pending} disabled={isDemo || value.trim() === name}>
            Salvar nome
          </Button>
        </div>
      </form>
    </div>
  );
}

/* ─────────────────────────────── Aparência ── */

export function ThemeForm() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const value = mounted && resolvedTheme === "light" ? "light" : "dark";
  return (
    <ChoiceGroup
      aria-label="Tema"
      value={value}
      onValueChange={(v) => setTheme(v)}
      options={[
        { value: "dark", label: "Escuro", description: "Padrão do Vértice, ideal para longas sessões." },
        { value: "light", label: "Claro", description: "Mesma identidade, para ambientes iluminados." },
      ]}
    />
  );
}

/* ─────────────────────────────── Rotina e estudos ── */

export interface PreferencesValues {
  goal: string;
  track: "PUBLIC" | "MILITARY" | "BOTH";
  weeklyHoursTarget: number | null;
  dailyStudyLimitMin: number;
  maxSessionMin: number;
  minBreakMin: number;
  timezone: string;
  autoApplyMinorChanges: boolean;
  works: boolean;
  studiesCollege: boolean;
  physicalPrep: boolean;
}

const TIMEZONES = [
  ["America/Noronha", "Fernando de Noronha (UTC−2)"],
  ["America/Sao_Paulo", "Brasília: Sul, Sudeste, GO, DF (UTC−3)"],
  ["America/Bahia", "Bahia (UTC−3)"],
  ["America/Fortaleza", "Nordeste: CE, RN, PB, PI, MA (UTC−3)"],
  ["America/Recife", "Pernambuco (UTC−3)"],
  ["America/Maceio", "Alagoas e Sergipe (UTC−3)"],
  ["America/Belem", "Pará e Amapá (UTC−3)"],
  ["America/Araguaina", "Tocantins (UTC−3)"],
  ["America/Campo_Grande", "Mato Grosso do Sul (UTC−4)"],
  ["America/Cuiaba", "Mato Grosso (UTC−4)"],
  ["America/Manaus", "Amazonas (UTC−4)"],
  ["America/Porto_Velho", "Rondônia (UTC−4)"],
  ["America/Boa_Vista", "Roraima (UTC−4)"],
  ["America/Rio_Branco", "Acre (UTC−5)"],
] as const;

const toText = (n: number) => String(n);

export function PreferencesForm({ initial }: { initial: PreferencesValues }) {
  const [v, setV] = React.useState({
    ...initial,
    weekly: initial.weeklyHoursTarget === null ? "" : toText(initial.weeklyHoursTarget).replace(".", ","),
    daily: toText(initial.dailyStudyLimitMin),
    session: toText(initial.maxSessionMin),
    breakMin: toText(initial.minBreakMin),
  });
  const { pending, errors, run } = useSubmit();
  const set = <K extends keyof typeof v>(k: K, value: (typeof v)[K]) => setV((p) => ({ ...p, [k]: value }));
  const num = (s: string) => (s.trim() === "" ? Number.NaN : Number(s.replace(",", ".")));

  const submit = () => {
    const payload: PreferencesInput = {
      goal: v.goal,
      track: v.track,
      weeklyHoursTarget: v.weekly.trim() ? num(v.weekly) : null,
      dailyStudyLimitMin: num(v.daily),
      maxSessionMin: num(v.session),
      minBreakMin: num(v.breakMin),
      timezone: v.timezone,
      autoApplyMinorChanges: v.autoApplyMinorChanges,
      works: v.works,
      studiesCollege: v.studiesCollege,
      physicalPrep: v.physicalPrep,
    };
    run(() => updatePreferencesAction(payload));
  };

  const zones: readonly (readonly [string, string])[] = TIMEZONES.some(([z]) => z === initial.timezone) ? TIMEZONES : [[initial.timezone, initial.timezone], ...TIMEZONES];

  return (
    <form
      className="flex flex-col gap-10"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <fieldset id="rotina" className="flex scroll-mt-24 flex-col gap-4">
        <legend className="mb-4 text-lg font-semibold tracking-[-0.01em]">Rotina</legend>
        <div className="grid max-w-2xl gap-4 sm:grid-cols-3">
          <Field label="Limite diário (min)" htmlFor="pref-daily" error={errors.dailyStudyLimitMin}>
            <Input inputMode="numeric" value={v.daily} onChange={(e) => set("daily", e.target.value.replace(/\D/g, ""))} maxLength={3} />
          </Field>
          <Field label="Sessão máxima (min)" htmlFor="pref-session" error={errors.maxSessionMin}>
            <Input inputMode="numeric" value={v.session} onChange={(e) => set("session", e.target.value.replace(/\D/g, ""))} maxLength={3} />
          </Field>
          <Field label="Pausa mínima (min)" htmlFor="pref-break" error={errors.minBreakMin}>
            <Input inputMode="numeric" value={v.breakMin} onChange={(e) => set("breakMin", e.target.value.replace(/\D/g, ""))} maxLength={2} />
          </Field>
        </div>
        <Field label="Fuso horário" htmlFor="pref-tz" error={errors.timezone} className="max-w-md" hint="Define o dia e a hora usados no plano, na sequência e nos relatórios.">
          <NativeSelect value={v.timezone} onChange={(e) => set("timezone", e.target.value)}>
            {zones.map(([z, label]) => (
              <option key={z} value={z}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <div className="flex max-w-2xl items-start justify-between gap-4 rounded-[var(--radius-object)] bg-surface p-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="pref-auto" className="text-base font-medium text-fg">
              Aplicar ajustes pequenos automaticamente
            </label>
            <p id="pref-auto-desc" className="text-sm text-fg-subtle">
              Reagendamentos de até 2 sessões não realizadas, sem sessões deixadas de fora, são aplicados sozinhos. Você é avisado e pode desfazer. Mudanças maiores sempre pedem sua decisão.
            </p>
          </div>
          <Switch id="pref-auto" aria-describedby="pref-auto-desc" checked={v.autoApplyMinorChanges} onCheckedChange={(c) => set("autoApplyMinorChanges", c)} />
        </div>
      </fieldset>

      <fieldset id="estudos" className="flex scroll-mt-24 flex-col gap-4">
        <legend className="mb-4 text-lg font-semibold tracking-[-0.01em]">Estudos</legend>
        <Field label="Objetivo" htmlFor="pref-goal" optional error={errors.goal} className="max-w-2xl">
          <Input value={v.goal} onChange={(e) => set("goal", e.target.value)} maxLength={200} placeholder="Ex.: aprovação na EFOMM" />
        </Field>
        <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
          <Field label="Meta semanal (horas)" htmlFor="pref-weekly" optional error={errors.weeklyHoursTarget} hint="Deixe em branco para planejar só pela rotina.">
            <Input inputMode="decimal" value={v.weekly} onChange={(e) => set("weekly", e.target.value)} maxLength={5} />
          </Field>
          <Field label="Área de preparação" htmlFor="pref-track">
            <NativeSelect value={v.track} onChange={(e) => set("track", e.target.value as PreferencesValues["track"])}>
              <option value="PUBLIC">Concursos públicos</option>
              <option value="MILITARY">Concursos militares</option>
              <option value="BOTH">Públicos e militares</option>
            </NativeSelect>
          </Field>
        </div>
        <div className="flex flex-col gap-2.5">
          {(
            [
              ["works", "Trabalho"],
              ["studiesCollege", "Faço faculdade"],
              ["physicalPrep", "Faço preparação física"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="flex items-center gap-2">
              <Checkbox id={`pref-${key}`} checked={v[key]} onCheckedChange={(c) => set(key, c === true)} />
              <Label htmlFor={`pref-${key}`}>{label}</Label>
            </div>
          ))}
        </div>
      </fieldset>

      <div>
        <Button type="submit" variant="primary" loading={pending}>
          Salvar preferências
        </Button>
      </div>
    </form>
  );
}

/* ─────────────────────────────── Privacidade e dados ── */

export function MentorHistoryButton({ count }: { count: number }) {
  const { pending, run } = useSubmit();
  return (
    <Button variant="outline" size="sm" loading={pending} disabled={count === 0} onClick={() => run(deleteMentorHistoryAction)}>
      <Trash2 />
      Apagar conversas com o Mentor
    </Button>
  );
}

export function ExportButton() {
  return (
    <Button asChild variant="secondary">
      <a href="/api/exportar" download>
        <Download />
        Exportar meus dados
      </a>
    </Button>
  );
}

/* ─────────────────────────────── Segurança ── */

export function PasswordForm({ disabled }: { disabled: boolean }) {
  const [v, setV] = React.useState({ current: "", password: "", confirm: "" });
  const { pending, errors, run } = useSubmit();
  return (
    <form
      className="flex max-w-md flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => changePasswordAction(v), () => setV({ current: "", password: "", confirm: "" }));
      }}
    >
      <Field label="Senha atual" htmlFor="pw-current" error={errors.current}>
        <Input type="password" autoComplete="current-password" value={v.current} onChange={(e) => setV((p) => ({ ...p, current: e.target.value }))} disabled={disabled} />
      </Field>
      <Field label="Nova senha" htmlFor="pw-new" error={errors.password} hint="Pelo menos 8 caracteres.">
        <Input type="password" autoComplete="new-password" value={v.password} onChange={(e) => setV((p) => ({ ...p, password: e.target.value }))} disabled={disabled} />
      </Field>
      <Field label="Confirmar nova senha" htmlFor="pw-confirm" error={errors.confirm}>
        <Input type="password" autoComplete="new-password" value={v.confirm} onChange={(e) => setV((p) => ({ ...p, confirm: e.target.value }))} disabled={disabled} />
      </Field>
      <div>
        <Button type="submit" variant="secondary" loading={pending} disabled={disabled || !v.current || !v.password || !v.confirm}>
          Alterar senha
        </Button>
      </div>
    </form>
  );
}

export function RevokeSessionsButton({ others }: { others: number }) {
  const { pending, run } = useSubmit();
  return (
    <Button variant="outline" size="sm" loading={pending} disabled={others === 0} onClick={() => run(revokeOtherSessionsAction)}>
      <LogOut />
      Encerrar outras sessões
    </Button>
  );
}

export function DeleteAccountDialog({ disabled }: { disabled: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState({ password: "", confirmation: "" });
  const [errors, setErrors] = React.useState<Errors>({});
  const [pending, startTransition] = React.useTransition();
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setV({ password: "", confirmation: "" });
          setErrors({});
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="danger" disabled={disabled}>
          <Trash2 />
          Excluir conta
        </Button>
      </DialogTrigger>
      <DialogContent title="Excluir conta definitivamente?" description="Todos os seus dados serão apagados: plano, rotina, sessões, questões, flashcards, simulados, metas e histórico. Não é possível desfazer. Exporte seus dados antes, se quiser guardá-los.">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const r = await deleteAccountAction(v);
              if (r && !r.ok) {
                setErrors(r.fieldErrors ?? {});
                toast.error(r.error);
              }
            });
          }}
        >
          <Field label="Senha" htmlFor="del-password" error={errors.password}>
            <Input type="password" autoComplete="current-password" value={v.password} onChange={(e) => setV((p) => ({ ...p, password: e.target.value }))} />
          </Field>
          <Field label="Digite EXCLUIR para confirmar" htmlFor="del-confirm" error={errors.confirmation}>
            <Input value={v.confirmation} onChange={(e) => setV((p) => ({ ...p, confirmation: e.target.value }))} autoComplete="off" />
          </Field>
          <DialogFooter className="mt-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Manter conta
            </Button>
            <Button type="submit" variant="danger" loading={pending} disabled={!v.password || v.confirmation.trim().toUpperCase() !== "EXCLUIR"}>
              Excluir definitivamente
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
