import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/cn";
import { EASE } from "@/animations/motion";
import { editalDemo, errorEntries, tafDemo, weeklyAccuracy } from "@/data/demo";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Sparkline } from "@/components/ui/MetricChart";

/* Miniaturas das telas usadas no Bento Grid. Todas são ilustrativas e ficam dentro de cards com a etiqueta de demonstração. */

const statusStyle: Record<string, string> = {
  Revisado: "text-positive",
  Estudado: "text-info",
  "Em andamento": "text-warning",
  "Não iniciado": "text-fg-subtle",
};

export function EditalMini() {
  return (
    <div className="flex flex-col gap-2.5">
      {editalDemo.map((d, i) => (
        <div key={d.subject} className={cn("rounded-[10px] border border-line-soft bg-canvas-2 p-3", i === 0 && "border-line", i > 1 && "hidden lg:block")}>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium text-fg">{d.subject}</span>
            <span className="flex items-center gap-3 text-xs text-fg-subtle">
              <span>Peso {d.weight}</span>
              <span className="numeral w-8 text-right text-fg-muted">{d.progress}%</span>
            </span>
          </div>
          <ProgressBar value={d.progress} tone="info" label={`Progresso em ${d.subject}`} className="mt-2" />
          {d.topics.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1.5 border-t border-line-soft pt-3">
              {d.topics.map((t) => (
                <li key={t.name} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-fg-muted">{t.name}</span>
                  <span className="flex shrink-0 items-center gap-2.5">
                    <span className={cn("hidden sm:inline", statusStyle[t.status])}>{t.status}</span>
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[0.625rem] font-medium",
                        t.priority === "Alta" ? "bg-performance/15 text-[#ff6680]" : "bg-white/5 text-fg-subtle",
                      )}
                    >
                      Prioridade {t.priority.toLowerCase()}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

const agenda = [
  { day: "Seg", blocks: [{ k: "t", h: 2 }, { k: "q", h: 1 }] },
  { day: "Ter", blocks: [{ k: "q", h: 1 }, { k: "t", h: 1 }, { k: "r", h: 1 }] },
  { day: "Qua", blocks: [] },
  { day: "Qui", blocks: [{ k: "t", h: 2 }, { k: "r", h: 1 }] },
  { day: "Sex", blocks: [] },
  { day: "Sáb", blocks: [{ k: "s", h: 3 }, { k: "r", h: 1 }] },
  { day: "Dom", blocks: [] },
];

const agendaKinds = {
  t: { label: "Teoria", cls: "bg-info/25 border-info/40" },
  q: { label: "Questões", cls: "bg-positive/20 border-positive/35" },
  r: { label: "Revisão", cls: "bg-warning/20 border-warning/35" },
  s: { label: "Simulado", cls: "bg-performance/20 border-performance/45" },
} as const;

export function WeekAgendaMini() {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-7 gap-1.5" role="img" aria-label="Agenda semanal com blocos de teoria, questões, revisão e simulado">
        {agenda.map((d) => (
          <div key={d.day} className="flex flex-col gap-1.5" aria-hidden>
            <span className="text-center text-[0.6875rem] text-fg-subtle">{d.day}</span>
            <div className="flex h-28 flex-col gap-1 rounded-md border border-line-soft bg-canvas-2 p-1">
              {d.blocks.map((b, i) => (
                <span key={i} className={cn("rounded-[4px] border", agendaKinds[b.k as keyof typeof agendaKinds].cls)} style={{ flexGrow: b.h }} />
              ))}
              {!d.blocks.length && <span className="m-auto h-px w-3 bg-line" />}
            </div>
          </div>
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
        {Object.values(agendaKinds).map((k) => (
          <li key={k.label} className="flex items-center gap-1.5 text-xs text-fg-subtle">
            <span aria-hidden className={cn("size-2.5 rounded-[3px] border", k.cls)} />
            {k.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

const filters = [
  { label: "Banca", value: "Marinha" },
  { label: "Matéria", value: "Física" },
  { label: "Assunto", value: "Dinâmica" },
  { label: "Dificuldade", value: "Média" },
  { label: "Concurso", value: "EFOMM" },
];

export function QuestionFiltersMini() {
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-wrap gap-1.5">
        {filters.map((f) => (
          <li key={f.label} className="flex items-center gap-1.5 rounded-md border border-line bg-canvas-2 px-2 py-1 text-xs">
            <span className="text-fg-subtle">{f.label}</span>
            <span className="text-fg">{f.value}</span>
          </li>
        ))}
      </ul>
      <div className="rounded-[10px] border border-line-soft bg-canvas-2 p-3">
        <p className="text-xs text-fg-subtle">Prova oficial · questão 14</p>
        <p className="mt-1.5 line-clamp-2 text-sm text-fg-muted">
          Dois blocos ligados por um fio ideal passam por uma polia sem atrito. Desprezando a massa do fio, a tração vale…
        </p>
        <div className="mt-3 grid grid-cols-5 gap-1.5" aria-hidden>
          {["A", "B", "C", "D", "E"].map((l) => (
            <span
              key={l}
              className={cn(
                "grid h-7 place-items-center rounded-md border text-xs",
                l === "C" ? "border-positive/50 bg-positive/10 text-positive" : "border-line-soft text-fg-subtle",
              )}
            >
              {l}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Flashcard com virada real ao clicar — a única interação do grid, porque mostra o que o recurso faz. */
export function FlashcardMini() {
  const [flipped, setFlipped] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setFlipped((v) => !v)}
        aria-pressed={flipped}
        aria-label={flipped ? "Mostrar a pergunta do flashcard" : "Mostrar a resposta do flashcard"}
        className="relative h-[120px] w-full rounded-[12px] border border-line bg-canvas-2 p-4 text-left transition-colors hover:border-line-strong"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={flipped ? "back" : "front"}
            initial={{ opacity: 0, rotateX: -60 }}
            animate={{ opacity: 1, rotateX: 0 }}
            exit={{ opacity: 0, rotateX: 60 }}
            transition={{ duration: 0.28, ease: EASE }}
            className="flex h-full flex-col justify-between"
          >
            <span className="text-xs text-fg-subtle">{flipped ? "Resposta" : "Fórmula · Dinâmica"}</span>
            <span className="text-[0.9375rem] font-medium text-fg">
              {flipped ? "a = g · sen θ" : "Aceleração de um bloco em plano inclinado sem atrito"}
            </span>
          </motion.span>
        </AnimatePresence>
        <RotateCcw aria-hidden className="absolute top-3.5 right-3.5 size-3.5 text-fg-faint" />
      </button>
      <div className="grid grid-cols-4 gap-1.5 text-center text-[0.6875rem]" aria-hidden>
        {[
          ["De novo", "1 min"],
          ["Difícil", "1 dia"],
          ["Bom", "3 dias"],
          ["Fácil", "7 dias"],
        ].map(([label, next]) => (
          <span key={label} className="rounded-md border border-line-soft py-1.5">
            <span className="block text-fg-muted">{label}</span>
            <span className="numeral block text-fg-subtle">{next}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function ErrorsMini() {
  return (
    <ul className="flex flex-col gap-2">
      {errorEntries.slice(0, 3).map((e) => (
        <li key={e.id} className="flex items-center justify-between gap-3 rounded-[10px] border border-line-soft bg-canvas-2 px-3 py-2.5">
          <span className="min-w-0">
            <span className="block truncate text-sm text-fg">{e.topic.split(" — ")[0]}</span>
            <span className="block text-xs text-fg-subtle">{e.reason}</span>
          </span>
          <span className={cn("numeral shrink-0 text-xs font-medium", e.repeats >= 3 ? "text-danger" : "text-fg-muted")}>{e.repeats}× repetido</span>
        </li>
      ))}
    </ul>
  );
}

export function SimulationMini() {
  const answered = 29;
  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 64 64" className="size-20 shrink-0 -rotate-90" role="img" aria-label="72,5% de acertos">
        <circle cx="32" cy="32" r="27" fill="none" stroke="var(--color-line)" strokeWidth="5" />
        <motion.circle
          cx="32"
          cy="32"
          r="27"
          fill="none"
          stroke="var(--color-info)"
          strokeWidth="5"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 0.725 }}
          viewport={{ once: true }}
          transition={{ duration: 1.2, ease: EASE }}
        />
      </svg>
      <dl className="grid flex-1 grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <dt className="text-xs text-fg-subtle">Acertos</dt>
          <dd className="numeral text-fg">{answered}/40</dd>
        </div>
        <div>
          <dt className="text-xs text-fg-subtle">Tempo</dt>
          <dd className="numeral text-fg">3h 26min</dd>
        </div>
        <div>
          <dt className="text-xs text-fg-subtle">Formato</dt>
          <dd className="text-fg">Personalizado</dd>
        </div>
        <div>
          <dt className="text-xs text-fg-subtle">Aproveitamento</dt>
          <dd className="numeral text-fg">72,5%</dd>
        </div>
      </dl>
    </div>
  );
}

export function PerformanceMini() {
  const values = weeklyAccuracy.map((w) => w.value);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="numeral text-3xl font-semibold tracking-[-0.03em] text-fg">78%</p>
        <p className="numeral text-xs text-positive">+20 p.p.</p>
      </div>
      <div className="rounded-[10px] border border-line-soft bg-canvas-2 px-3 pt-4 pb-2">
        <Sparkline values={values} className="h-16 w-full" />
        <div className="mt-2 flex justify-between text-[0.625rem] text-fg-subtle" aria-hidden>
          {weeklyAccuracy.map((w, i) => (
            <span key={w.label}>S{i + 1}</span>
          ))}
        </div>
      </div>
      <p className="text-xs text-fg-subtle">Acertos por semana, de 58% na semana 1 a 78% na semana 5.</p>
    </div>
  );
}

const calendarMarks: Record<number, "study" | "review" | "sim" | "exam"> = {
  2: "study", 3: "study", 5: "study", 6: "review", 9: "study", 10: "study", 12: "study", 13: "sim", 16: "study", 17: "review", 19: "study", 20: "study", 23: "study", 24: "study", 26: "review", 27: "sim", 30: "exam",
};

const markStyle = {
  study: { cls: "bg-info", label: "Estudo" },
  review: { cls: "bg-warning", label: "Revisão" },
  sim: { cls: "bg-positive", label: "Simulado" },
  exam: { cls: "bg-performance", label: "Prova" },
} as const;

export function CalendarMini() {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-7 gap-1" role="img" aria-label="Calendário do mês com dias de estudo, revisões, simulados e a prova">
        {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
          const mark = calendarMarks[day];
          return (
            <span
              key={day}
              aria-hidden
              className={cn(
                "numeral relative grid h-8 place-items-center rounded-md text-[0.6875rem]",
                mark === "exam" ? "border border-performance/60 text-fg" : "text-fg-subtle",
              )}
            >
              {day}
              {mark && mark !== "exam" && <span className={cn("absolute bottom-1 size-1 rounded-full", markStyle[mark].cls)} />}
            </span>
          );
        })}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
        {Object.values(markStyle).map((m) => (
          <li key={m.label} className="flex items-center gap-1.5 text-xs text-fg-subtle">
            <span aria-hidden className={cn("size-1.5 rounded-full", m.cls)} />
            {m.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TafMini() {
  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {tafDemo.map((t) => {
        const pct = Math.round((t.current / t.goal) * 100);
        return (
          <li key={t.name} className="flex flex-col gap-2 rounded-[10px] border border-line-soft bg-canvas-2 p-3">
            <span className="flex items-center justify-between gap-2 text-xs">
              <span className="text-fg-muted">{t.name}</span>
              <Sparkline values={t.history} tone="positive" className="h-4 w-10" />
            </span>
            <span className="flex items-baseline gap-1">
              <span className="numeral text-lg font-semibold text-fg">{t.current.toLocaleString("pt-BR")}</span>
              <span className="text-xs text-fg-subtle">
                {t.unit} · meta {t.goal.toLocaleString("pt-BR")}
              </span>
            </span>
            <ProgressBar value={pct} tone={pct >= 100 ? "positive" : "info"} label={`${t.name}: ${pct}% da meta`} />
          </li>
        );
      })}
    </ul>
  );
}
