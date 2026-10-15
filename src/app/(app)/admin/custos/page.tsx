import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Metric, PageHeader, SectionTitle } from "@/components/ui/display";
import { requireAdmin } from "@/modules/auth/admin";
import { aiCostReport } from "@/modules/ai/usage";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Custos de IA" };

const usd = (v: number | null | undefined, digits = 4) => (v === null || v === undefined ? "—" : `US$ ${v.toFixed(digits)}`);

export default async function AiCostsPage({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  await requireAdmin();
  const { dias } = await searchParams;
  const days = [7, 30, 90].find((d) => String(d) === dias) ?? 30;
  const r = await aiCostReport(days);

  return (
    <div className="flex flex-col gap-10">
      <Link href="/admin/provas" className="inline-flex w-fit items-center gap-1.5 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden="true" /> Provas oficiais
      </Link>
      <PageHeader
        title="Custos de IA"
        description="Consumo registrado em cada chamada de IA, com custo estimado pela tabela de preços do provedor. Base para definir preço e limites dos planos."
      />
      <nav className="-mt-6 flex gap-3 text-sm" aria-label="Período">
        {[7, 30, 90].map((d) => (
          <Link key={d} href={`/admin/custos?dias=${d}`} className={cn(d === days ? "font-medium text-fg" : "text-fg-subtle hover:text-fg")}>
            {d} dias
          </Link>
        ))}
      </nav>
      <dl className="grid grid-cols-2 gap-6 border-y py-6 sm:grid-cols-4">
        <Metric label="Custo no período" value={usd(r.totalCost, 2)} />
        <Metric label="Chamadas" value={formatNumber(r.calls)} />
        <Metric label="Alunos com uso de IA" value={formatNumber(r.activeStudents)} />
        <Metric label="Custo por aluno ativo" value={usd(r.costPerActiveStudent, 3)} detail={r.activeStudents ? `${r.activeStudents} alunos` : "Sem dados"} />
      </dl>
      {r.unpriced > 0 && <p className="-mt-6 text-sm text-warning">{r.unpriced} chamadas de modelos sem preço cadastrado ficaram fora do custo (veja src/modules/ai/usage.ts).</p>}
      <section aria-labelledby="by-feature" className="flex flex-col gap-3">
        <SectionTitle>
          <span id="by-feature">Por uso</span>
        </SectionTitle>
        {r.features.length === 0 ? (
          <p className="text-base text-fg-muted">Nenhuma chamada registrada no período.</p>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="text-sm text-fg-subtle">
                <th className="pb-2 font-normal">Uso</th>
                <th className="pb-2 text-right font-normal">Chamadas</th>
                <th className="pb-2 text-right font-normal">Custo médio</th>
                <th className="pb-2 text-right font-normal">Entrada média</th>
                <th className="pb-2 text-right font-normal">Saída média</th>
                <th className="pb-2 text-right font-normal">Lido do cache</th>
                <th className="pb-2 text-right font-normal">Total</th>
              </tr>
            </thead>
            <tbody>
              {r.features.map((f) => (
                <tr key={f.feature} className="border-t border-line-soft">
                  <td className="py-2 text-base text-fg">{f.label}</td>
                  <td className="numeral py-2 text-right text-fg-muted">{formatNumber(f.calls)}</td>
                  <td className="numeral py-2 text-right text-fg-muted">{usd(f.avgCost)}</td>
                  <td className="numeral py-2 text-right text-fg-muted">{formatNumber(Math.round(f.avgInput))}</td>
                  <td className="numeral py-2 text-right text-fg-muted">{formatNumber(Math.round(f.avgOutput))}</td>
                  <td className="numeral py-2 text-right text-fg-muted">{f.cacheShare === null ? "—" : `${Math.round(f.cacheShare * 100)}%`}</td>
                  <td className="numeral py-2 text-right text-fg">{usd(f.totalCost, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="text-sm text-fg-subtle">
          Cada correção de redação são duas chamadas (correção dupla): o custo por redação é o dobro do custo médio da linha. A leitura de provas usa o Gemini e ainda não registra consumo aqui.
        </p>
      </section>
      {r.models.length > 0 && (
        <section aria-labelledby="by-model" className="flex flex-col gap-3">
          <SectionTitle>
            <span id="by-model">Por modelo</span>
          </SectionTitle>
          <ul className="flex flex-col gap-1 text-base text-fg-muted">
            {r.models.map((m) => (
              <li key={`${m.feature}-${m.model}`}>
                {m.model}, {r.features.find((f) => f.feature === m.feature)?.label}: {formatNumber(m.calls)} chamadas, {usd(m.avgCost)} em média
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
