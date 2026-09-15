import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col px-5 py-6 sm:px-10">
      <Link href="/" aria-label="Vértice — página inicial" className="self-start">
        <Logo />
      </Link>
      <main className="flex flex-1 flex-col items-start justify-center gap-5">
        <p className="numeral text-3xl font-light text-fg-subtle">404</p>
        <h1 className="text-2xl font-semibold tracking-[-0.025em]">Página não encontrada</h1>
        <p className="max-w-md text-base text-fg-muted">O endereço não existe ou você não tem acesso a este conteúdo.</p>
        <Button asChild variant="secondary">
          <Link href="/painel">Voltar ao dashboard</Link>
        </Button>
      </main>
    </div>
  );
}
