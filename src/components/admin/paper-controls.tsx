"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCheck, Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/display";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/overlay";
import { approveCleanAction, deletePaperAction, startExtractionAction } from "@/modules/exam-papers/actions";

/** Refreshes the page while a paper is being read, so progress shows up without reloading. */
export function AutoRefresh({ active, everyMs = 6000 }: { active: boolean; everyMs?: number }) {
  const router = useRouter();
  React.useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, everyMs);
    return () => window.clearInterval(timer);
  }, [active, everyMs, router]);
  return null;
}

export function StartExtractionButton({ paperId, label }: { paperId: string; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  return (
    <Button
      variant="secondary"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await startExtractionAction(paperId);
          if (!r.ok) toast.error(r.error);
          else {
            toast.success(r.message);
            router.refresh();
          }
        })
      }
    >
      <Play /> {label}
    </Button>
  );
}

export function ApproveCleanButton({ filter, count }: { filter: { examPaperId?: string; origin?: "GENERATED" }; count: number }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  if (count === 0) return null;
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <CheckCheck /> Publicar {count} sem pendências
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title={`Publicar ${count} questão(ões)?`}
          description="Só entram as questões sem nenhuma pendência automática. Elas passam a aparecer para todos os alunos. Você ainda pode editá-las depois."
        >
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  const r = await approveCleanAction(filter);
                  setOpen(false);
                  if (!r.ok) toast.error(r.error);
                  else {
                    toast.success(r.message);
                    router.refresh();
                  }
                })
              }
            >
              Publicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function DeletePaperButton({ paperId, title }: { paperId: string; title: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        <Trash2 /> Apagar prova
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Apagar esta prova?" description={`${title}: o PDF, o gabarito e todas as questões em revisão serão removidos. Não dá para desfazer.`}>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  const r = await deletePaperAction(paperId);
                  if (!r.ok) {
                    toast.error(r.error);
                    setOpen(false);
                    return;
                  }
                  toast.success(r.message);
                  router.push("/admin/provas");
                })
              }
            >
              Apagar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

type Errors = Record<string, string[] | undefined>;

export function ImportPaperForm({ competitions, aiReady }: { competitions: { id: string; name: string; kind: string }[]; aiReady: boolean }) {
  const router = useRouter();
  const [errors, setErrors] = React.useState<Errors>({});
  const [message, setMessage] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const military = competitions.filter((c) => c.kind === "MILITARY");
  const others = competitions.filter((c) => c.kind !== "MILITARY");

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setErrors({});
    setMessage(null);
    try {
      const response = await fetch("/api/admin/provas", { method: "POST", body: new FormData(event.currentTarget) });
      const data = (await response.json().catch(() => ({}))) as { id?: string; error?: string; fieldErrors?: Errors; started?: boolean };
      if (!response.ok || !data.id) {
        setErrors(data.fieldErrors ?? {});
        setMessage(data.error ?? "Não foi possível importar a prova.");
        return;
      }
      toast.success(data.started ? "Prova importada. A leitura começou." : "Prova importada.");
      router.push(`/admin/provas/${data.id}`);
    } catch {
      setMessage("Sem conexão com o servidor. Tente novamente.");
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {message && <Notice tone="danger">{message}</Notice>}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Concurso" htmlFor="importar-concurso" error={errors.competitionId}>
          <NativeSelect name="competitionId" defaultValue="">
            <option value="" disabled>
              Escolha
            </option>
            <optgroup label="Militares">
              {military.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </optgroup>
            {others.length > 0 && (
              <optgroup label="Outros concursos">
                {others.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            )}
          </NativeSelect>
        </Field>
        <Field label="Ano da prova" htmlFor="importar-ano" error={errors.year}>
          <Input name="year" type="number" inputMode="numeric" min={1990} max={new Date().getFullYear() + 1} placeholder="2026" />
        </Field>
        <Field label="Versão" htmlFor="importar-versao" error={errors.version} hint="Dia, cor ou modelo da prova.">
          <Input name="version" placeholder="2º dia, prova branca" maxLength={80} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset className="flex flex-col gap-3 rounded-[var(--radius-object)] p-4 shadow-[inset_0_0_0_1px_var(--line)]">
          <legend className="px-1 text-sm font-medium text-fg-muted">Prova (PDF oficial)</legend>
          <Field label="Arquivo" htmlFor="importar-pdf" error={errors.pdf} hint="Até 40 MB.">
            <Input name="pdf" type="file" accept="application/pdf" className="h-auto py-2 text-sm" />
          </Field>
          <Field label="Ou endereço oficial" htmlFor="importar-pdf-url" hint="Também fica registrado como fonte.">
            <Input name="pdfUrl" type="url" placeholder="https://www.marinha.mil.br/…/prova.pdf" />
          </Field>
        </fieldset>
        <fieldset className="flex flex-col gap-3 rounded-[var(--radius-object)] p-4 shadow-[inset_0_0_0_1px_var(--line)]">
          <legend className="px-1 text-sm font-medium text-fg-muted">Gabarito oficial (recomendado)</legend>
          <Field label="Arquivo" htmlFor="importar-gabarito" optional>
            <Input name="answerKey" type="file" accept="application/pdf" className="h-auto py-2 text-sm" />
          </Field>
          <Field label="Ou endereço oficial" htmlFor="importar-gabarito-url" optional hint="Prefira o gabarito definitivo.">
            <Input name="answerKeyUrl" type="url" placeholder="https://…/gabarito-definitivo.pdf" />
          </Field>
        </fieldset>
      </div>
      <Field label="Título" htmlFor="importar-titulo" optional hint="Em branco: concurso, ano e versão.">
        <Input name="title" maxLength={160} />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" loading={pending}>
          Importar e ler a prova
        </Button>
        {!aiReady && <p className="text-sm text-warning">A leitura automática precisa de GEMINI_API_KEY no servidor; a prova fica guardada até lá.</p>}
      </div>
    </form>
  );
}
