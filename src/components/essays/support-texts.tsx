import type { SupportText } from "@/modules/essays/service";

export function SupportTexts({ texts }: { texts: SupportText[] }) {
  if (texts.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {texts.map((t, i) => (
        <figure key={i} className="flex flex-col gap-1 border-l-2 border-line pl-4">
          <figcaption className="text-sm font-medium text-fg-muted">
            Texto {i + 1}
            {t.title ? `: ${t.title}` : ""}
          </figcaption>
          <p className="whitespace-pre-line text-base text-fg-muted">{t.text}</p>
          <p className="text-xs text-fg-subtle">{t.generated ? "Texto gerado por IA para treino. Não é citação de autor ou veículo real." : t.source ? `Fonte: ${t.source}` : "Fonte não informada"}</p>
        </figure>
      ))}
    </div>
  );
}
