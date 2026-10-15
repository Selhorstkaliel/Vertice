"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/display";
import { Textarea } from "@/components/ui/input";
import { formatTimer } from "@/lib/format";
import { cn } from "@/lib/utils";
import { estimateLines, lineCheck } from "@/engines/essays/correction";
import { saveEssayDraftAction, submitEssayAction } from "@/modules/essays/actions";

export interface EditorProps {
  draftId: string | null;
  competitionId: string;
  themeId: string | null;
  originalId: string | null;
  initialText: string;
  initialSeconds: number;
  timed: boolean;
  rubric: { charsPerLine: number; minLines: number | null; maxLines: number | null };
  correctionsLeft: number;
  aiReady: boolean;
  privacyNote: string;
}

export function EssayEditor(props: EditorProps) {
  const router = useRouter();
  const [text, setText] = React.useState(props.initialText);
  const [id, setId] = React.useState(props.draftId);
  const [saved, setSaved] = React.useState<"saved" | "saving" | "dirty" | "error">("saved");
  const [seconds, setSeconds] = React.useState(props.initialSeconds);
  const [submitting, startSubmit] = React.useTransition();
  const textRef = React.useRef(text);
  const idRef = React.useRef(id);
  const secondsRef = React.useRef(seconds);
  const savingRef = React.useRef<Promise<string | null> | null>(null);
  textRef.current = text;
  idRef.current = id;
  secondsRef.current = seconds;

  // Writing time: counts only while the tab is visible.
  React.useEffect(() => {
    const tick = window.setInterval(() => {
      if (document.visibilityState === "visible") setSeconds((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(tick);
  }, []);

  const save = React.useCallback(async (): Promise<string | null> => {
    if (savingRef.current) await savingRef.current;
    const run = (async () => {
      setSaved("saving");
      const r = await saveEssayDraftAction({
        id: idRef.current ?? undefined,
        competitionId: props.competitionId,
        themeId: props.themeId,
        originalId: props.originalId,
        text: textRef.current,
        timeSpentSec: secondsRef.current,
        timed: props.timed,
      });
      if (!r.ok) {
        setSaved("error");
        toast.error(r.error);
        return null;
      }
      if (!idRef.current) {
        idRef.current = r.data.id;
        setId(r.data.id);
        window.history.replaceState(null, "", `/redacao/escrever?rascunho=${r.data.id}`);
      }
      setSaved("saved");
      return r.data.id;
    })();
    savingRef.current = run;
    try {
      return await run;
    } finally {
      savingRef.current = null;
    }
  }, [props.competitionId, props.themeId, props.originalId, props.timed]);

  // Autosave a few seconds after the student stops typing.
  React.useEffect(() => {
    if (text === props.initialText) return;
    setSaved("dirty");
    const t = window.setTimeout(() => void save(), 2500);
    return () => window.clearTimeout(t);
  }, [text, save, props.initialText]);

  const lines = estimateLines(text, props.rubric.charsPerLine);
  const check = lineCheck(lines, props.rubric.minLines, props.rubric.maxLines);

  const submit = () =>
    startSubmit(async () => {
      const essayId = await save();
      if (!essayId) return;
      toast.message("Corrigindo: duas correções independentes, leva cerca de um minuto.");
      const r = await submitEssayAction(essayId);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      router.push(`/redacao/${essayId}`);
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-fg-subtle">
        <span className={cn(!check.ok && text.trim() && "text-warning")}>{text.trim() ? check.message : "Comece a escrever. Separe os parágrafos com uma linha em branco."}</span>
        <span className="flex items-center gap-4">
          <span className="numeral">{text.length} caracteres</span>
          <span className="numeral" aria-label="Tempo de escrita">
            {props.timed ? "Cronometrada: " : "Tempo: "}
            {formatTimer(seconds)}
          </span>
          <span>{saved === "saving" ? "Salvando…" : saved === "dirty" ? "Alterações não salvas" : saved === "error" ? "Falha ao salvar" : id ? "Rascunho salvo" : ""}</span>
        </span>
      </div>
      <Textarea
        aria-label="Texto da redação"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={24}
        maxLength={12000}
        spellCheck
        className="min-h-[28rem] font-[family-name:var(--font-serif,inherit)] text-md leading-8"
        placeholder="Escreva aqui sua redação."
      />
      <p className="text-sm text-fg-subtle">
        As linhas são uma estimativa a partir de {props.rubric.charsPerLine} caracteres por linha manuscrita; a contagem real depende da sua letra.
      </p>
      {!props.aiReady ? (
        <Notice tone="warning">A correção automática não está configurada neste servidor. Você pode escrever e salvar o rascunho.</Notice>
      ) : (
        <Notice tone="neutral" title="Privacidade">
          {props.privacyNote}
        </Notice>
      )}
      <div className="flex flex-wrap items-center gap-3 border-t pt-5">
        <Button variant="primary" size="lg" loading={submitting} disabled={!props.aiReady || props.correctionsLeft <= 0 || text.trim().length < 200} onClick={submit}>
          Enviar para correção
        </Button>
        <Button variant="ghost" size="lg" disabled={submitting} onClick={() => void save()}>
          Salvar rascunho
        </Button>
        <span className="text-sm text-fg-subtle">
          {props.correctionsLeft > 0 ? `${props.correctionsLeft} ${props.correctionsLeft === 1 ? "correção restante" : "correções restantes"} neste mês.` : "Você usou todas as correções deste mês."}
        </span>
      </div>
    </div>
  );
}
