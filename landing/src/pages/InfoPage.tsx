import { Mail } from "lucide-react";
import { ROUTES } from "@/lib/routes";
import { SITE } from "@/lib/site";
import { usePageMeta } from "@/hooks/usePageMeta";
import { fillTokens, legalConfig, privacy, terms, type LegalSection } from "@/data/legal";
import { PageIntro } from "@/components/layout/PageIntro";
import { Container } from "@/components/ui/Container";
import { ButtonAnchor, ButtonLink } from "@/components/ui/Button";

type Kind = "about" | "contact" | "terms" | "privacy";

const about: LegalSection[] = [
  {
    heading: "Por que o VÉRTICE existe",
    paragraphs: [
      "Tudo começou com uma pergunta: com o tempo que você tem até a prova, o que deveria estudar agora? Para responder, a plataforma conecta edital, rotina, questões, revisões, simulados e desempenho em um único sistema.",
      "Cada recomendação mostra o motivo. Sugestões de mudança no plano podem ser aceitas, editadas, ignoradas ou desfeitas — quem decide é você.",
    ],
  },
  {
    heading: "Compromissos",
    list: [
      "Sem promessas de aprovação: o Índice de Preparação resume evidências de estudo, não chance de aprovação.",
      "Sem dados inventados: datas, pesos e notas de corte só aparecem quando cadastrados; o que não foi verificado é identificado como tal.",
      "Sem afiliação: o VÉRTICE não é ligado a bancas, órgãos públicos ou Forças Armadas.",
      "Seus dados são seus: você pode exportá-los e encerrar a conta quando quiser.",
    ],
  },
];

/** Com o endereço publicado, a primeira frase o apresenta; sem ele, o aviso acima já explicou a ausência. */
const contactSections = (email: string): LegalSection[] => [
  {
    heading: "Canal oficial",
    paragraphs: [
      ...(email ? ["O endereço acima é o único canal oficial: nenhum outro endereço, perfil ou telefone fala em nome do VÉRTICE."] : []),
      "Use esse canal para suporte, dúvidas sobre a conta, relatos de problemas e pedidos relacionados a privacidade, como acesso, correção ou exclusão de dados.",
    ],
  },
  {
    heading: "O que ajuda na resposta",
    list: [
      "o e-mail cadastrado na sua conta;",
      "a tela em que o problema aconteceu e o que você esperava que acontecesse;",
      "o horário aproximado, se for algo que aconteceu uma vez só.",
    ],
  },
  {
    heading: "O que não conseguimos responder",
    paragraphs: [
      "Perguntas sobre regras, datas, vagas ou resultados de concursos precisam ir para a banca ou o órgão responsável. O VÉRTICE não é afiliado a eles e não fala por eles.",
    ],
  },
];

const pages: Record<Kind, { path: string; title: string; description: string; sections: LegalSection[]; legal?: boolean }> = {
  about: {
    path: ROUTES.about,
    title: "Sobre o VÉRTICE",
    description: "Uma plataforma de preparação autônoma para concursos públicos e militares.",
    sections: about,
  },
  contact: {
    path: ROUTES.contact,
    title: "Contato",
    description: "Como falar com o VÉRTICE.",
    sections: contactSections(legalConfig.contactEmail),
  },
  terms: {
    path: ROUTES.terms,
    title: "Termos de uso",
    description: "As condições de uso da plataforma.",
    sections: terms,
    legal: true,
  },
  privacy: {
    path: ROUTES.privacy,
    title: "Política de privacidade",
    description: "Como os dados da sua preparação são tratados.",
    sections: privacy,
    legal: true,
  },
};

const updatedAt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).format(
  new Date(`${legalConfig.updatedAt}T12:00:00Z`),
);

function Sections({ sections }: { sections: LegalSection[] }) {
  return (
    <div className="flex flex-col gap-10">
      {sections.map((section) => (
        <section key={section.heading} className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-fg sm:text-2xl">{section.heading}</h2>
          {section.paragraphs?.map((text) => (
            <p key={text} className="text-base leading-relaxed text-fg-muted">
              {fillTokens(text)}
            </p>
          ))}
          {section.list && (
            <ul className="flex flex-col gap-3 border-s border-line ps-5">
              {section.list.map((item) => (
                <li key={item} className="text-base leading-relaxed text-fg-muted">
                  {fillTokens(item)}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

export default function InfoPage({ kind }: { kind: Kind }) {
  const page = pages[kind];
  usePageMeta(page.path);
  const email = legalConfig.contactEmail;

  return (
    <>
      <PageIntro title={page.title} description={page.description}>
        {page.legal && (
          <p className="text-sm text-fg-subtle">
            Última revisão em <time dateTime={legalConfig.updatedAt}>{updatedAt}</time>
          </p>
        )}
      </PageIntro>

      <Container className="py-16 sm:py-20">
        <div className="flex max-w-2xl flex-col gap-10">
          {page.legal && !legalConfig.published && (
            <p role="note" className="rounded-[12px] border border-dashed border-line-strong p-4 text-sm leading-relaxed text-fg-muted">
              Este documento ainda não está em vigor. Ele passa a valer quando a plataforma abrir cadastros ao público, e a data acima será atualizada.
            </p>
          )}

          {kind === "contact" &&
            (email ? (
              <ButtonAnchor href={`mailto:${email}`} size="lg" className="self-start" icon={<Mail className="size-4" />}>
                {email}
              </ButtonAnchor>
            ) : (
              <p role="note" className="rounded-[12px] border border-dashed border-line-strong p-4 text-sm leading-relaxed text-fg-muted">
                O endereço de contato oficial ainda não foi publicado. Até lá, nenhum canal fala em nome do VÉRTICE.
              </p>
            ))}

          <Sections sections={page.sections} />

          <div className="flex flex-wrap gap-3 border-t border-line pt-8">
            <ButtonLink to={ROUTES.home} variant="secondary">
              Voltar para a página inicial
            </ButtonLink>
            {kind !== "contact" && (
              <ButtonLink to={ROUTES.contact} variant="ghost">
                Falar com o VÉRTICE
              </ButtonLink>
            )}
          </div>
          <p className="text-sm text-fg-subtle">{SITE.slogan}</p>
        </div>
      </Container>
    </>
  );
}
