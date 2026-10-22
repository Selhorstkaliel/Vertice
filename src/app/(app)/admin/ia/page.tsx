import type { Metadata } from "next";
import { headers } from "next/headers";
import { Notice, PageHeader, SectionTitle } from "@/components/ui/display";
import { AiFeatureList, ChatGptConnection } from "@/components/ai/chatgpt-connection";
import { requireAdmin } from "@/modules/auth/admin";
import { chatGptStatus } from "@/modules/ai/chatgpt-status";
import { CALLBACK_RESULT, type CallbackResult } from "@/modules/ai/chatgpt-results";

export const metadata: Metadata = { title: "Conexão de IA" };
export const dynamic = "force-dynamic";

export default async function AiConnectionPage({ searchParams }: { searchParams: Promise<{ resultado?: string }> }) {
  await requireAdmin();
  const { resultado } = await searchParams;
  const result = resultado && resultado in CALLBACK_RESULT ? CALLBACK_RESULT[resultado as CallbackResult] : null;
  const status = await chatGptStatus((await headers()).get("host"), "/admin/ia");

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        title="Conexão de IA"
        description="Conecte sua conta do ChatGPT (Plus ou Pro) para a leitura de provas e editais, a correção de redações e o Mentor usarem seu plano. Cada aluno conecta a própria conta no Vértice instalado no computador dele, pelo aviso no topo do app ou em Configurações."
      />
      {result && <Notice tone={result.tone} className="-mt-6">{result.text}</Notice>}
      <section aria-labelledby="conta" className="flex max-w-2xl flex-col gap-3">
        <SectionTitle>
          <span id="conta">Conta ChatGPT</span>
        </SectionTitle>
        <ChatGptConnection status={status} returnTo="/admin/ia" />
      </section>
      <section aria-labelledby="recursos" className="flex max-w-3xl flex-col gap-3">
        <SectionTitle>
          <span id="recursos">Recursos de IA</span>
        </SectionTitle>
        <AiFeatureList features={status.features} />
      </section>
    </div>
  );
}
