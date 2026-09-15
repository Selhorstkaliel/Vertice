"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltipCard, TableView, axisTick, useChartColors } from "@/components/charts/chart-kit";
import { formatMeasure, type MeasureUnit } from "@/engines/military/taf";

const dayMonth = (key: string) => key.split("-").reverse().slice(0, 2).join("/");

/** Round axis bounds and at most five ticks: 15 s/30 s/1 min… for times, 1/2/5… for counts. */
function niceTicks(min: number, max: number, unit: MeasureUnit) {
  const steps = unit === "SECONDS" ? [15, 30, 60, 120, 300, 600, 1800] : [1, 2, 5, 10, 20, 50, 100, 250, 500, 1000];
  const range = Math.max(max - min, 1);
  const step = steps.find((st) => range / st <= 4) ?? steps.at(-1)!;
  const lo = Math.max(0, Math.floor(min / step) * step - (min % step === 0 ? step : 0));
  const hi = Math.ceil(max / step) * step + (max % step === 0 ? step : 0);
  const ticks: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(v);
  return { domain: [lo, hi] as [number, number], ticks };
}

export function TafEvolutionChart({
  name,
  unit,
  betterWhen,
  target,
  results,
}: {
  name: string;
  unit: MeasureUnit;
  betterWhen: "LOWER" | "HIGHER";
  target: number | null;
  results: { dateKey: string; value: number }[];
}) {
  const c = useChartColors();
  const data = results.map((r) => ({ ...r, label: dayMonth(r.dateKey) }));
  const values = [...results.map((r) => r.value), ...(target !== null ? [target] : [])];
  const axis = niceTicks(Math.min(...values), Math.max(...values), unit);

  return (
    <div className="flex flex-col gap-2">
      <div className="h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: 0 }} accessibilityLayer>
            <CartesianGrid stroke={c.grid} strokeWidth={1} vertical={false} />
            <XAxis dataKey="label" tick={axisTick(c)} tickLine={false} axisLine={{ stroke: c.grid }} interval="preserveStartEnd" minTickGap={20} />
            <YAxis
              domain={axis.domain}
              ticks={axis.ticks}
              tick={axisTick(c)}
              tickLine={false}
              axisLine={false}
              width={unit === "SECONDS" ? 48 : 40}
              tickFormatter={(v: number) => (unit === "SECONDS" ? formatMeasure(v, unit) : String(Math.round(v)))}
            />
            {target !== null && (
              <ReferenceLine
                y={target}
                stroke={c.reference}
                strokeDasharray="4 4"
                label={{ value: `Meta ${formatMeasure(target, unit)}`, position: "insideTopRight", fill: c.axis, fontSize: 11 }}
              />
            )}
            <Tooltip
              cursor={{ stroke: c.axis, strokeWidth: 1 }}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as { label: string; value: number } | undefined;
                if (!active || !p) return null;
                return <ChartTooltipCard title={p.label} rows={[{ key: "v", label: name, value: formatMeasure(p.value, unit), color: c.series }]} />;
              }}
            />
            <Line type="monotone" dataKey="value" stroke={c.series} strokeWidth={2} dot={{ r: 4, fill: c.series, stroke: c.surface, strokeWidth: 2 }} activeDot={{ r: 5, fill: c.series, stroke: c.surface, strokeWidth: 2 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-sm text-fg-subtle">{betterWhen === "LOWER" ? "Menor é melhor." : "Maior é melhor."} Linha tracejada: sua meta.</p>
      <TableView caption={`Evolução em ${name}`} columns={["Data", "Resultado"]} rows={data.map((d) => [d.dateKey.split("-").reverse().join("/"), formatMeasure(d.value, unit)])} />
    </div>
  );
}
