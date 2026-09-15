"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { NativeSelect } from "@/components/ui/input";
import { Switch } from "@/components/ui/controls";
import { DAY_PERIOD_LABEL, ENERGY_LABEL } from "@/lib/labels";
import { setEnergyAction, setEnergyLearningAction } from "@/modules/routine/actions";
import type { EnergyInput, EnergyLevel } from "@/engines/types";
import { cn } from "@/lib/utils";

export interface LearnedEnergyView {
  period: EnergyInput["period"];
  delta: number;
  reason: string | null;
}

const signed = (v: number) => `${v > 0 ? "+" : "−"}${Math.abs(v).toFixed(2).replace(/0$/, "").replace(".", ",")}`;

export function EnergyEditor({ energy, learning }: { energy: EnergyInput[]; learning: { enabled: boolean; periods: LearnedEnergyView[] } }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [learningOn, setLearningOn] = React.useState(learning.enabled);
  const anyLearned = learning.periods.some((p) => p.delta !== 0);

  return (
    <div className="flex flex-col gap-4" aria-busy={pending}>
      <div className="flex flex-col gap-1">
        {energy.map((e) => {
          const learned = learning.periods.find((p) => p.period === e.period);
          return (
            <div key={e.period} className="flex flex-col gap-1 border-b border-line-soft py-2 last:border-b-0">
              <div className="flex items-center justify-between gap-4">
                <label htmlFor={`energy-${e.period}`} className="text-base text-fg">
                  {DAY_PERIOD_LABEL[e.period]}
                </label>
                <NativeSelect
                  id={`energy-${e.period}`}
                  defaultValue={e.level}
                  className="h-9 w-40"
                  onChange={(ev) => {
                    const level = ev.target.value as EnergyLevel;
                    startTransition(async () => {
                      const result = await setEnergyAction(e.period, level);
                      if (!result.ok) toast.error(result.error);
                    });
                  }}
                >
                  {Object.entries(ENERGY_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              {learningOn && learned && learned.delta !== 0 && (
                <p className="text-sm text-fg-subtle">
                  <span className={cn("numeral font-medium", learned.delta > 0 ? "text-positive" : "text-warning")}>Ajuste aprendido {signed(learned.delta)}</span>
                  {learned.reason ? `. ${learned.reason}` : ""}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-start justify-between gap-4 rounded-[var(--radius-object)] bg-surface p-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="energy-learning" className="text-base font-medium text-fg">
            Ajustar pela minha performance real
          </label>
          <p id="energy-learning-desc" className="text-sm text-fg-subtle">
            Compara seus acertos e o foco das sessões em cada período com a sua média das últimas 8 semanas. Os ajustes são pequenos e só aparecem com pelo menos 150 questões no total e 40 no período.
            {learningOn && !anyLearned && " Ainda não há diferença suficiente para ajustar."}
          </p>
        </div>
        <Switch
          id="energy-learning"
          aria-describedby="energy-learning-desc"
          checked={learningOn}
          disabled={pending}
          onCheckedChange={(value) => {
            setLearningOn(value);
            startTransition(async () => {
              const result = await setEnergyLearningAction(value);
              if (!result.ok) {
                setLearningOn(!value);
                toast.error(result.error);
              } else {
                toast.success(result.message);
                router.refresh();
              }
            });
          }}
        />
      </div>
    </div>
  );
}
