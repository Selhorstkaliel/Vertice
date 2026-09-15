import Link from "next/link";
import { formatCalendarDate, formatNumber } from "@/lib/format";
import type { DashboardData } from "@/modules/dashboard/queries";

/**
 * The one bold element of the dashboard: days to the exam, drawn over the
 * trajectory from the start of preparation to exam day.
 */
export function CountdownBand({ exam, prepElapsed }: { exam: NonNullable<DashboardData["exam"]>; prepElapsed: number | null }) {
  const past = exam.daysLeft !== null && exam.daysLeft < 0;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
        <div className="flex flex-col gap-1.5">
          <p className="text-base text-fg-subtle">Concurso principal</p>
          <Link href={`/concursos/${exam.competitionId}`} className="text-xl font-semibold tracking-[-0.02em] text-fg hover:underline hover:underline-offset-4">
            {exam.title}
          </Link>
        </div>

        {exam.daysLeft !== null && !past ? (
          <div className="flex flex-col items-start gap-1 sm:items-end">
            <p className="flex items-baseline gap-2.5">
              <span className="text-base text-fg-subtle">Faltam</span>
              <span className="numeral text-[clamp(3.5rem,9vw,5.5rem)] leading-[0.9] font-light text-fg">{formatNumber(exam.daysLeft)}</span>
              <span className="text-md text-fg-muted">{exam.daysLeft === 1 ? "dia" : "dias"}</span>
            </p>
            <p className="text-sm text-fg-subtle">
              Prova em {formatCalendarDate(exam.date!)}
              {!exam.official && " — data informada por você"}
            </p>
          </div>
        ) : past ? (
          <p className="text-base text-fg-muted">A data da prova já passou. Atualize em Meus Concursos.</p>
        ) : (
          <div className="flex flex-col items-start gap-1 sm:items-end">
            <p className="text-lg text-fg-muted">Data ainda não definida.</p>
            <Link href={`/concursos/${exam.competitionId}`} className="text-sm text-info underline-offset-4 hover:underline">
              Informar data da prova
            </Link>
          </div>
        )}
      </div>

      {prepElapsed !== null && !past && (
        <div className="relative h-4" role="img" aria-label={`${Math.round(prepElapsed * 100)}% do período de preparação já decorrido`}>
          <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line" />
          <span
            className="absolute top-1/2 left-0 h-px origin-left -translate-y-1/2 animate-draw bg-fg-muted"
            style={{ width: `${prepElapsed * 100}%` }}
          />
          <span
            className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-performance"
            style={{ left: `${prepElapsed * 100}%` }}
          />
          <svg className="absolute top-1/2 right-0 size-3 -translate-y-1/2 text-fg" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M1 3 L6 10 L11 3" stroke="currentColor" strokeWidth="1.5" fill="none" />
          </svg>
        </div>
      )}
    </div>
  );
}
