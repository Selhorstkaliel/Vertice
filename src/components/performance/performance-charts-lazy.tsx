"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/display";

// Recharts is heavy; load it only where charts render, keeping the frame height stable.
const frame = (height: string) => {
  function ChartPlaceholder() {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="Carregando gráfico">
        <Skeleton className="h-5 w-48" />
        <Skeleton className={height} />
      </div>
    );
  }
  return ChartPlaceholder;
};

export const AccuracyTrendChart = dynamic(() => import("./performance-charts").then((m) => m.AccuracyTrendChart), { ssr: false, loading: frame("h-60") });
export const StudyTimeChart = dynamic(() => import("./performance-charts").then((m) => m.StudyTimeChart), { ssr: false, loading: frame("h-60") });
export const SimulationScoresChart = dynamic(() => import("./performance-charts").then((m) => m.SimulationScoresChart), { ssr: false, loading: frame("h-52") });
export const ReadinessHistoryChart = dynamic(() => import("./performance-charts").then((m) => m.ReadinessHistoryChart), { ssr: false, loading: frame("h-36") });
