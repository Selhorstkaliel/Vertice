import type { Metadata } from "next";
import Link from "next/link";
import { FileStack, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Notice, PageHeader, SectionTitle } from "@/components/ui/display";
import { AutoRefresh, ImportPaperForm } from "@/components/admin/paper-controls";
import { requireAdmin } from "@/modules/auth/admin";
import { questionAiConfigured } from "@/modules/ai/gemini";
import { listExamPapers } from "@/modules/exam-papers/queries";
import { paperStatus } from "@/modules/exam-papers/format";

export const metadata: Metadata = { title: "Provas oficiais" };

export default async function ExamPapersPage() {
  await requireAdmin();
  const { papers, competitions } = await listExamPapers();
  const aiReady = questionAiConfigured();

  return (
    <div className="flex flex-col gap-10">
      <AutoRefresh active={papers.some((p) => p.running)} />
      <PageHeader
        title="Provas oficiais"
        description="Importe provas e gabaritos oficiais. A IA transcreve cada questão; nada chega aos alunos sem a sua revisão."
        actions={
          <Button variant="secondary" asChild>
            <Link href="/admin/geradas">
              <Sparkles /> Questões geradas
            </Link>
          </Button>
        }
      />

      {!aiReady && (
        <Notice tone="warning" title="Leitura automática desativada">
          Configure GEMINI_API_KEY no servidor. Sem ela, as provas ficam guardadas e podem ser lidas depois.
        </Notice>
      )}

      <section aria-labelledby="importar">
        <SectionTitle>
          <span id="importar">Importar prova</span>
        </SectionTitle>
        <ImportPaperForm competitions={competitions} aiReady={aiReady} />
      </section>

      <section aria-labelledby="importadas">
        <SectionTitle>
          <span id="importadas">Provas importadas</span>
        </SectionTitle>
        {papers.length === 0 ? (
          <EmptyState icon={<FileStack />} title="Nenhuma prova importada" description="Use o formulário acima ou rode npm run provas -- importar para buscar a lista de provas oficiais." />
        ) : (
          <ul className="flex flex-col">
            {papers.map((p) => {
              const status = paperStatus(p);
              return (
                <li key={p.id} className="flex flex-col gap-2 border-b border-line-soft py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 flex-col gap-1">
                    <Link href={`/admin/provas/${p.id}`} className="text-base font-medium text-fg hover:underline">
                      {p.title}
                    </Link>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg-subtle">
                      <Badge tone={status.tone}>{status.label}</Badge>
                      <span>
                        Lidas {p.extractedUpTo} de {p.expectedCount ?? "?"}
                      </span>
                      <span>· A revisar {p.pending}</span>
                      <span>· Publicadas {p.approved}</span>
                      {p.rejected > 0 && <span>· Rejeitadas {p.rejected}</span>}
                      {!p.answerKeyPath && <span className="text-warning">· Sem gabarito</span>}
                    </div>
                    {p.statusNote && <p className="text-sm text-fg-muted">{p.statusNote}</p>}
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/admin/provas/${p.id}`}>{p.pending > 0 ? "Revisar" : "Abrir"}</Link>
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
