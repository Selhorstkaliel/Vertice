"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/display";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/overlay";
import { COMPETITION_STATUS_LABEL, ENROLLMENT_STATUS_LABEL, STAGE_STATUS_LABEL } from "@/lib/labels";
import {
  addStageAction,
  addSubjectAction,
  createCompetitionAction,
  customizeEditalAction,
  enrollCompetitionAction,
  moveStageAction,
  removeEnrollmentAction,
  removeStageAction,
  setPrimaryEnrollmentAction,
  updateEnrollmentAction,
  updateOwnedCompetitionAction,
  updateStageAction,
  type CompetitionInput,
} from "@/modules/competitions/actions";

type Result = { ok: boolean; error?: string; message?: string };

function useAction() {
  const [pending, startTransition] = React.useTransition();
  const run = (fn: () => Promise<Result>, after?: () => void) =>
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error);
      else {
        if (r.message) toast.success(r.message);
        after?.();
      }
    });
  return { pending, run };
}

export function EnrollButton({ competitionId, primary = false, label }: { competitionId: string; primary?: boolean; label?: string }) {
  const { pending, run } = useAction();
  return (
    <Button size="sm" variant={primary ? "primary" : "secondary"} loading={pending} onClick={() => run(() => enrollCompetitionAction(competitionId, primary))}>
      <Plus />
      {label ?? (primary ? "Adicionar como principal" : "Adicionar")}
    </Button>
  );
}

export function SetPrimaryButton({ enrollmentId }: { enrollmentId: string }) {
  const { pending, run } = useAction();
  return (
    <Button size="sm" variant="outline" loading={pending} onClick={() => run(() => setPrimaryEnrollmentAction(enrollmentId))}>
      <Star />
      Tornar principal
    </Button>
  );
}

export function CustomizeEditalButton({ enrollmentId, variant = "secondary" }: { enrollmentId: string; variant?: "primary" | "secondary" | "outline" }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  return (
    <Button
      size="sm"
      variant={variant}
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await customizeEditalAction(enrollmentId);
          if (!r.ok) toast.error(r.error);
          else {
            toast.success(r.message);
            router.push(`/edital?concurso=${r.data.competitionId}`);
          }
        })
      }
    >
      <Pencil />
      Personalizar edital
    </Button>
  );
}

export function RemoveEnrollmentButton({ enrollmentId, name }: { enrollmentId: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const { pending, run } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="danger">
          <Trash2 />
          Remover
        </Button>
      </DialogTrigger>
      <DialogContent title={`Remover ${name}?`} description="O concurso sai da sua lista e do plano. Seu progresso nos tópicos, questões e flashcards é mantido.">
        <DialogFooter className="mt-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Manter concurso
          </Button>
          <Button variant="danger" loading={pending} onClick={() => run(() => removeEnrollmentAction(enrollmentId), () => router.push("/concursos"))}>
            Remover concurso
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EnrollmentSettings({
  enrollmentId,
  officialDate,
  customExamDate,
  status,
  notes,
}: {
  enrollmentId: string;
  officialDate: string | null;
  customExamDate: string | null;
  status: "ACTIVE" | "PAUSED" | "ARCHIVED";
  notes: string | null;
}) {
  const [date, setDate] = React.useState(customExamDate ?? "");
  const [st, setSt] = React.useState(status);
  const [n, setN] = React.useState(notes ?? "");
  const { pending, run } = useAction();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => updateEnrollmentAction(enrollmentId, { customExamDate: date || null, status: st, notes: n }));
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {officialDate ? (
          <Field label="Data da prova" htmlFor="official-date" hint="Data oficial registrada.">
            <Input value={officialDate.split("-").reverse().join("/")} readOnly disabled />
          </Field>
        ) : (
          <Field label="Data da prova" htmlFor="exam-date" hint="Deixe em branco se ainda não foi definida.">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        )}
        <Field label="Situação" htmlFor="enroll-status">
          <NativeSelect value={st} onChange={(e) => setSt(e.target.value as typeof st)}>
            {Object.entries(ENROLLMENT_STATUS_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <Field label="Anotações" htmlFor="enroll-notes" optional>
        <Textarea rows={3} value={n} onChange={(e) => setN(e.target.value)} maxLength={1000} />
      </Field>
      <Button type="submit" variant="secondary" className="self-start" loading={pending}>
        Salvar alterações
      </Button>
    </form>
  );
}

export function AddSubjectDialog({ competitionId, subjects }: { competitionId: string; subjects: { id: string; name: string }[] }) {
  const [open, setOpen] = React.useState(false);
  const [subjectId, setSubjectId] = React.useState("");
  const [newName, setNewName] = React.useState("");
  const { pending, run } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          <Plus />
          Adicionar disciplina
        </Button>
      </DialogTrigger>
      <DialogContent title="Adicionar disciplina" description="Disciplinas do catálogo trazem tópicos de referência, que você pode ajustar.">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => addSubjectAction(competitionId, subjectId ? { subjectId } : { newSubjectName: newName }),
              () => {
                setOpen(false);
                setSubjectId("");
                setNewName("");
              },
            );
          }}
        >
          <Field label="Do catálogo" htmlFor="add-subject">
            <NativeSelect value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="">Selecione</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Ou crie uma nova" htmlFor="new-subject" optional>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} disabled={!!subjectId} maxLength={80} placeholder="Ex.: Legislação Municipal" />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={pending} disabled={!subjectId && newName.trim().length < 2}>
              Adicionar disciplina
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const emptyCompetition: CompetitionInput = {
  name: "",
  organization: "",
  position: "",
  kind: "PUBLIC",
  examBoardId: "",
  year: null,
  examDate: null,
  editalUrl: "",
  status: "EXPECTED",
};

export function CompetitionFormDialog({
  boards,
  initial,
  competitionId,
  trigger,
}: {
  boards: { id: string; name: string }[];
  initial?: CompetitionInput;
  competitionId?: string;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<CompetitionInput>(initial ?? emptyCompetition);
  const [errors, setErrors] = React.useState<Record<string, string[] | undefined>>({});
  const [message, setMessage] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const set = <K extends keyof CompetitionInput>(k: K, v: CompetitionInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setForm(initial ?? emptyCompetition);
          setErrors({});
          setMessage(null);
        }
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="secondary">
            <Plus />
            Cadastrar concurso
          </Button>
        )}
      </DialogTrigger>
      <DialogContent title={competitionId ? "Editar concurso" : "Cadastrar concurso"} description="Use apenas informações do edital oficial." className="max-w-xl">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const r = competitionId ? await updateOwnedCompetitionAction(competitionId, form) : await createCompetitionAction(form);
              if (r && !r.ok) {
                setErrors(r.fieldErrors ?? {});
                setMessage(r.fieldErrors ? null : r.error);
              } else if (r?.ok) {
                toast.success(r.message);
                setOpen(false);
              }
            });
          }}
        >
          {message && <Notice tone="danger">{message}</Notice>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome" htmlFor="c-name" error={errors.name}>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={80} />
            </Field>
            <Field label="Órgão" htmlFor="c-org" error={errors.organization}>
              <Input value={form.organization} onChange={(e) => set("organization", e.target.value)} maxLength={120} />
            </Field>
            <Field label="Cargo" htmlFor="c-position" optional>
              <Input value={form.position ?? ""} onChange={(e) => set("position", e.target.value)} maxLength={120} />
            </Field>
            <Field label="Tipo" htmlFor="c-kind">
              <NativeSelect value={form.kind} onChange={(e) => set("kind", e.target.value as CompetitionInput["kind"])}>
                <option value="PUBLIC">Público</option>
                <option value="MILITARY">Militar</option>
              </NativeSelect>
            </Field>
            <Field label="Banca" htmlFor="c-board" optional>
              <NativeSelect value={form.examBoardId ?? ""} onChange={(e) => set("examBoardId", e.target.value)}>
                <option value="">Não informada</option>
                {boards.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Situação" htmlFor="c-status">
              <NativeSelect value={form.status} onChange={(e) => set("status", e.target.value as CompetitionInput["status"])}>
                {Object.entries(COMPETITION_STATUS_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Ano" htmlFor="c-year" optional error={errors.year}>
              <Input type="number" inputMode="numeric" value={form.year ?? ""} onChange={(e) => set("year", e.target.value ? Number(e.target.value) : null)} />
            </Field>
            <Field label="Data da prova" htmlFor="c-date" optional error={errors.examDate}>
              <Input type="date" value={(form.examDate as string | null) ?? ""} onChange={(e) => set("examDate", e.target.value || null)} />
            </Field>
          </div>
          <Field label="Link do edital" htmlFor="c-url" optional error={errors.editalUrl}>
            <Input type="url" value={form.editalUrl ?? ""} onChange={(e) => set("editalUrl", e.target.value)} placeholder="https://" />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={pending}>
              {competitionId ? "Salvar concurso" : "Cadastrar concurso"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export interface StageView {
  id: string;
  name: string;
  status: keyof typeof STAGE_STATUS_LABEL;
  date: string | null;
  notes: string | null;
}

export function StagesEditor({ enrollmentId, stages }: { enrollmentId: string; stages: StageView[] }) {
  const [newStage, setNewStage] = React.useState("");
  const { pending, run } = useAction();
  return (
    <div className="flex flex-col gap-3">
      {stages.length === 0 && <p className="text-base text-fg-muted">Nenhuma etapa cadastrada.</p>}
      <ol className="flex flex-col">
        {stages.map((s, i) => (
          <li key={s.id} className="grid grid-cols-[1.5rem_minmax(0,1fr)] items-start gap-3 border-b border-line-soft py-3 last:border-b-0 sm:grid-cols-[1.5rem_minmax(0,1fr)_10rem_9.5rem_auto] sm:items-center">
            <span className="numeral pt-2 text-sm text-fg-subtle sm:pt-0">{i + 1}</span>
            <span className="pt-1.5 text-base text-fg sm:pt-0">{s.name}</span>
            <NativeSelect
              aria-label={`Status de ${s.name}`}
              className="col-start-2 h-9 text-sm sm:col-start-auto"
              defaultValue={s.status}
              onChange={(e) => run(() => updateStageAction(s.id, { status: e.target.value as StageView["status"], date: s.date, notes: s.notes ?? undefined }))}
            >
              {Object.entries(STAGE_STATUS_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </NativeSelect>
            <Input
              type="date"
              aria-label={`Data de ${s.name}`}
              className="col-start-2 h-9 text-sm sm:col-start-auto"
              defaultValue={s.date ?? ""}
              onBlur={(e) => {
                if ((e.target.value || null) !== s.date) run(() => updateStageAction(s.id, { status: s.status, date: e.target.value || null, notes: s.notes ?? undefined }));
              }}
            />
            <div className="col-start-2 flex gap-1 sm:col-start-auto">
              <Button size="icon-sm" variant="ghost" aria-label={`Mover ${s.name} para cima`} disabled={i === 0 || pending} onClick={() => run(() => moveStageAction(s.id, "up"))}>
                ↑
              </Button>
              <Button size="icon-sm" variant="ghost" aria-label={`Mover ${s.name} para baixo`} disabled={i === stages.length - 1 || pending} onClick={() => run(() => moveStageAction(s.id, "down"))}>
                ↓
              </Button>
              <Button size="icon-sm" variant="ghost" aria-label={`Remover ${s.name}`} disabled={pending} onClick={() => run(() => removeStageAction(s.id))}>
                <Trash2 />
              </Button>
            </div>
          </li>
        ))}
      </ol>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => addStageAction(enrollmentId, newStage), () => setNewStage(""));
        }}
      >
        <Input value={newStage} onChange={(e) => setNewStage(e.target.value)} placeholder="Nova etapa" aria-label="Nome da nova etapa" maxLength={80} className="max-w-72" />
        <Button type="submit" variant="secondary" loading={pending} disabled={newStage.trim().length < 2}>
          Adicionar etapa
        </Button>
      </form>
    </div>
  );
}
