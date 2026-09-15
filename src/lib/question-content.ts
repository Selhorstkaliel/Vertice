/** Figures stored on a question, as [{ file, description }]. Anything malformed is dropped. */
export function questionFigures(value: unknown): { file: string | null; description: string }[] {
  if (!Array.isArray(value)) return [];
  return value.map((f) => {
    const item = (f ?? {}) as { file?: unknown; description?: unknown };
    return { file: typeof item.file === "string" ? item.file : null, description: typeof item.description === "string" ? item.description : "" };
  });
}

/** How the resolution was written, told to the student next to it. Null when a person wrote it. */
export function explanationAuthorship(source: string, aiModel: string | null) {
  if (!aiModel) return null;
  return source === "GENERATED"
    ? "Questão e resolução escritas com IA; a resposta foi conferida por uma resolução independente."
    : "Resolução escrita com IA e conferida com o gabarito oficial.";
}
