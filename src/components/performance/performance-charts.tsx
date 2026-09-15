"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMinutes, formatPercent, plural } from "@/lib/format";
import { axisTick, ChartSection, ChartTooltipCard, LegendItem, TableView, useChartColors } from "@/components/charts/chart-kit";

const TARGET = 70;

export interface WeekDatum {
  label: string;
  answered: number;
  accuracy: number | null;
  executedMinutes: number;
  plannedMinutes: number | null;
}

/* ── Accuracy trend: single series, target as a solid hairline reference ── */

export function AccuracyTrendChart({ data }: { data: WeekDatum[] }) {
  const c = useChartColors();
  const points = data.map((d) => ({ ...d, pct: d.accuracy === null ? null : Math.round(d.accuracy * 1000) / 10 }));
  const lastIndex = points.map((p) => p.pct !== null).lastIndexOf(true);
  const measured = points.filter((p) => p.pct !== null).length;

  return (
    <ChartSection
      id="chart-accuracy"
      title="Evolução de acertos"
      description={`Percentual semanal. Semanas com menos de 10 questões ficam em branco. Meta de referência: ${TARGET}%.`}
      empty={measured === 0 ? "Responda pelo menos 10 questões em uma semana para ver a evolução." : null}
      table={
        <TableView
          caption="Acertos por semana"
          columns={["Semana", "Questões", "Acertos"]}
          rows={data.map((d) => [d.label, d.answered, d.accuracy === null ? "—" : formatPercent(d.accuracy)])}
        />
      }
    >
      <div className="h-60 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 16, right: 44, bottom: 0, left: 0 }} accessibilityLayer>
            <CartesianGrid stroke={c.grid} strokeWidth={1} vertical={false} />
            <XAxis dataKey="label" tick={axisTick(c)} tickLine={false} axisLine={{ stroke: c.grid }} interval="preserveStartEnd" minTickGap={16} />
            <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={axisTick(c)} tickLine={false} axisLine={false} unit="%" width={44} />
            <ReferenceLine y={TARGET} stroke={c.reference} strokeWidth={1} label={{ value: `Meta ${TARGET}%`, position: "insideTopLeft", fill: c.axis, fontSize: 11, dy: -2 }} />
            <Tooltip
              cursor={{ stroke: c.axis, strokeWidth: 1 }}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as (typeof points)[number] | undefined;
                if (!active || !p) return null;
                return (
                  <ChartTooltipCard
                    title={`Semana de ${p.label}`}
                    rows={[{ key: "acc", label: "de acertos", value: p.pct === null ? "—" : `${p.pct.toLocaleString("pt-BR")}%`, color: c.series }]}
                    note={p.pct === null ? `${plural(p.answered, "questão", "questões")}, mínimo de 10` : plural(p.answered, "questão", "questões")}
                  />
                );
              }}
            />
            <Line
              type="monotone"
              dataKey="pct"
              stroke={c.series}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              connectNulls={false}
              isAnimationActive={false}
              dot={(props: { cx?: number; cy?: number; index?: number }) =>
                props.index === lastIndex && props.cx !== undefined && props.cy !== undefined ? (
                  <circle key="end" cx={props.cx} cy={props.cy} r={4} fill={c.series} stroke={c.surface} strokeWidth={2} />
                ) : (
                  <g key={`d-${props.index}`} />
                )
              }
              activeDot={{ r: 5, fill: c.series, stroke: c.surface, strokeWidth: 2 }}
            >
              <LabelList
                dataKey="pct"
                content={(props: { x?: number | string; y?: number | string; index?: number; value?: number | string | null }) =>
                  props.index === lastIndex && props.value !== null && props.value !== undefined ? (
                    <text x={Number(props.x) + 8} y={Number(props.y) + 4} fill={c.text} fontSize={12} fontWeight={600}>
                      {`${Math.round(Number(props.value))}%`}
                    </text>
                  ) : null
                }
              />
            </Line>
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartSection>
  );
}

/* ── Study time: emphasis form, executed in the series hue, planned as context ── */

export function StudyTimeChart({ data }: { data: WeekDatum[] }) {
  const c = useChartColors();
  const points = data.map((d) => ({ ...d, executedH: Math.round((d.executedMinutes / 60) * 10) / 10, plannedH: d.plannedMinutes === null ? null : Math.round((d.plannedMinutes / 60) * 10) / 10 }));
  const hasAny = data.some((d) => d.executedMinutes > 0 || (d.plannedMinutes ?? 0) > 0);
  const lastIndex = points.length - 1;

  return (
    <ChartSection
      id="chart-time"
      title="Tempo estudado por semana"
      description="Executado em sessões concluídas, comparado ao planejado no plano da semana."
      empty={hasAny ? null : "Conclua sessões de estudo para ver o tempo por semana."}
      legend={
        <>
          <LegendItem label="Executado" color={c.series} />
          <LegendItem label="Planejado" color={c.context} />
        </>
      }
      table={
        <TableView
          caption="Tempo planejado e executado por semana"
          columns={["Semana", "Planejado", "Executado"]}
          rows={data.map((d) => [d.label, d.plannedMinutes === null ? "Sem plano" : formatMinutes(d.plannedMinutes), formatMinutes(d.executedMinutes)])}
        />
      }
    >
      <div className="h-60 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={points} margin={{ top: 20, right: 8, bottom: 0, left: 0 }} barGap={2} barCategoryGap="28%" accessibilityLayer>
            <CartesianGrid stroke={c.grid} strokeWidth={1} vertical={false} />
            <XAxis dataKey="label" tick={axisTick(c)} tickLine={false} axisLine={{ stroke: c.grid }} interval="preserveStartEnd" minTickGap={16} />
            <YAxis tick={axisTick(c)} tickLine={false} axisLine={false} unit="h" width={44} allowDecimals={false} />
            <Tooltip
              cursor={{ fill: c.grid, opacity: 0.5 }}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as (typeof points)[number] | undefined;
                if (!active || !p) return null;
                return (
                  <ChartTooltipCard
                    title={`Semana de ${p.label}`}
                    rows={[
                      { key: "e", label: "executado", value: formatMinutes(p.executedMinutes), color: c.series },
                      { key: "p", label: "planejado", value: p.plannedMinutes === null ? "sem plano" : formatMinutes(p.plannedMinutes), color: c.context },
                    ]}
                    note={p.plannedMinutes ? `${formatPercent(p.executedMinutes / p.plannedMinutes)} do planejado` : undefined}
                  />
                );
              }}
            />
            <Bar dataKey="plannedH" name="Planejado" fill={c.context} maxBarSize={14} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="executedH" name="Executado" fill={c.series} maxBarSize={14} radius={[4, 4, 0, 0]} isAnimationActive={false}>
              <LabelList
                dataKey="executedMinutes"
                content={(props: { x?: number | string; y?: number | string; width?: number | string; index?: number; value?: number | string }) =>
                  props.index === lastIndex && Number(props.value) > 0 ? (
                    <text x={Number(props.x) + Number(props.width) / 2} y={Number(props.y) - 6} textAnchor="middle" fill={c.text} fontSize={12} fontWeight={600}>
                      {formatMinutes(Number(props.value))}
                    </text>
                  ) : null
                }
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartSection>
  );
}

/* ── Simulations over time ── */

export interface SimulationDatum {
  id: string;
  label: string;
  title: string;
  score: number;
  correct: number;
  total: number;
}

export function SimulationScoresChart({ data }: { data: SimulationDatum[] }) {
  const c = useChartColors();
  const points = data.map((d) => ({ ...d, pct: Math.round(d.score * 1000) / 10 }));
  const lastIndex = points.length - 1;

  return (
    <ChartSection
      id="chart-simulations"
      title="Simulados"
      description="Percentual de acertos de cada simulado finalizado."
      empty={data.length === 0 ? "Nenhum simulado finalizado ainda." : null}
      table={
        <TableView
          caption="Resultados dos simulados"
          columns={["Data", "Simulado", "Acertos"]}
          rows={data.map((d) => [d.label, d.title, `${d.correct}/${d.total} (${formatPercent(d.score)})`])}
        />
      }
    >
      <div className="h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 16, right: 44, bottom: 0, left: 0 }} accessibilityLayer>
            <CartesianGrid stroke={c.grid} strokeWidth={1} vertical={false} />
            <XAxis dataKey="label" tick={axisTick(c)} tickLine={false} axisLine={{ stroke: c.grid }} interval="preserveStartEnd" minTickGap={16} />
            <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tick={axisTick(c)} tickLine={false} axisLine={false} unit="%" width={44} />
            <Tooltip
              cursor={{ stroke: c.axis, strokeWidth: 1 }}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as (typeof points)[number] | undefined;
                if (!active || !p) return null;
                return <ChartTooltipCard title={`${p.title}, ${p.label}`} rows={[{ key: "s", label: "de acertos", value: `${p.pct.toLocaleString("pt-BR")}%`, color: c.series }]} note={`${p.correct} de ${p.total} questões`} />;
              }}
            />
            <Line
              type="linear"
              dataKey="pct"
              stroke={c.series}
              strokeWidth={2}
              isAnimationActive={false}
              dot={{ r: 4, fill: c.series, stroke: c.surface, strokeWidth: 2 }}
              activeDot={{ r: 5, fill: c.series, stroke: c.surface, strokeWidth: 2 }}
            >
              <LabelList
                dataKey="pct"
                content={(props: { x?: number | string; y?: number | string; index?: number; value?: number | string }) =>
                  props.index === lastIndex ? (
                    <text x={Number(props.x) + 8} y={Number(props.y) + 4} fill={c.text} fontSize={12} fontWeight={600}>
                      {`${Math.round(Number(props.value))}%`}
                    </text>
                  ) : null
                }
              />
            </Line>
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartSection>
  );
}

/* ── Readiness history (snapshots) ── */

export function ReadinessHistoryChart({ data }: { data: { label: string; readiness: number }[] }) {
  const c = useChartColors();
  if (data.length < 2) {
    return <p className="text-sm text-fg-subtle">O histórico do índice é registrado diariamente e aparece a partir do segundo dia com dados.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="h-36 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} accessibilityLayer>
            <CartesianGrid stroke={c.grid} strokeWidth={1} vertical={false} />
            <XAxis dataKey="label" tick={axisTick(c)} tickLine={false} axisLine={{ stroke: c.grid }} interval="preserveStartEnd" minTickGap={24} />
            <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tick={axisTick(c)} tickLine={false} axisLine={false} width={36} />
            <Tooltip
              cursor={{ stroke: c.axis, strokeWidth: 1 }}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as { label: string; readiness: number } | undefined;
                if (!active || !p) return null;
                return <ChartTooltipCard title={p.label} rows={[{ key: "r", label: "de 100", value: String(Math.round(p.readiness)), color: c.series }]} />;
              }}
            />
            <Line type="monotone" dataKey="readiness" stroke={c.series} strokeWidth={2} dot={false} activeDot={{ r: 4, fill: c.series, stroke: c.surface, strokeWidth: 2 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <TableView caption="Histórico do índice de preparação" columns={["Dia", "Índice"]} rows={data.map((d) => [d.label, Math.round(d.readiness)])} />
    </div>
  );
}
