/** Status shown for an imported exam, derived from its stored status and whether a reading is running. */
export function paperStatus(p: { status: string; running: boolean; statusNote: string | null }) {
  if (p.running) return { label: "Lendo a prova", tone: "info" } as const;
  switch (p.status) {
    case "UPLOADED":
      return { label: "Aguardando leitura", tone: "neutral" } as const;
    case "EXTRACTING":
      return { label: "Leitura pausada", tone: "warning" } as const;
    case "FAILED":
      return { label: "Falha na leitura", tone: "danger" } as const;
    case "REVIEW":
      return { label: "Em revisão", tone: "warning" } as const;
    default:
      return { label: "Revisada", tone: "positive" } as const;
  }
}
