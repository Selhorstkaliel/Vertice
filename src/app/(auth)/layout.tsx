import Link from "next/link";
import { Logo } from "@/components/brand/logo";

const inputs = ["Edital", "Rotina", "Desempenho", "Questões", "Revisões", "Tempo até a prova"];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex flex-col px-6 py-6 sm:px-10">
        <Link href="/" className="self-start rounded-[var(--radius-control)]" aria-label="Vértice — página inicial">
          <Logo />
        </Link>
        <main className="flex flex-1 items-center py-12">
          <div className="w-full max-w-[380px]">{children}</div>
        </main>
      </div>

      {/* The product in one diagram: six inputs converging to one plan. */}
      <aside className="relative hidden overflow-hidden border-l bg-canvas-2 lg:flex lg:flex-col lg:justify-center lg:px-16">
        <div className="flex max-w-md flex-col gap-10">
          <ul className="flex flex-col">
            {inputs.map((label) => (
              <li key={label} className="border-b border-line-soft py-3 last:border-b-0">
                <span className="text-md text-fg-muted">{label}</span>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-4">
            <span className="h-px flex-1 bg-line" />
            <svg viewBox="0 0 24 24" className="size-5 text-performance" aria-hidden="true">
              <path d="M4 7 L12 18 L20 7" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="square" />
            </svg>
            <span className="h-px flex-1 bg-line" />
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-2xl font-semibold tracking-[-0.025em] text-fg">Um plano de estudos que se ajusta a você.</p>
            <p className="text-md text-fg-muted">
              O que estudar, quando e por quê — recalculado a partir do seu desempenho real.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}
