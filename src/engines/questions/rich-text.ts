/**
 * Question text as stored: plain text with LaTeX between $…$ (inline) or
 * $$…$$ (display) and [[FIGURA n]] where the n-th figure goes.
 */
export type RichSegment = { kind: "text"; text: string } | { kind: "math"; tex: string; display: boolean } | { kind: "figure"; index: number };

const FIGURE = /\[\[FIGURA (\d+)\]\]/g;

export function figureMarkers(text: string) {
  return [...text.matchAll(FIGURE)].map((m) => Number(m[1]));
}

/**
 * `$` opens math only when not preceded by a letter or digit (so "R$ 150,00"
 * stays text), not followed by a space, and when a closing `$` exists that is
 * not preceded by a space nor followed by a digit — the usual Markdown rules.
 */
export function parseRich(text: string): RichSegment[] {
  const out: RichSegment[] = [];
  let buffer = "";
  const flush = () => {
    if (buffer) out.push({ kind: "text", text: buffer });
    buffer = "";
  };
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    const figure = /^\[\[FIGURA (\d+)\]\]/.exec(rest);
    if (figure) {
      flush();
      out.push({ kind: "figure", index: Number(figure[1]) });
      i += figure[0].length;
      continue;
    }
    const ch = text[i];
    if (ch === "\\" && text[i + 1] === "$") {
      buffer += "$";
      i += 2;
      continue;
    }
    if (ch === "$") {
      const display = text[i + 1] === "$";
      const open = display ? 2 : 1;
      const before = text[i - 1] ?? "";
      const after = text[i + open] ?? "";
      if (!/[\p{L}\p{N}]/u.test(before) && after && !/\s/.test(after)) {
        const close = findClose(text, i + open, display);
        if (close > 0) {
          flush();
          out.push({ kind: "math", tex: text.slice(i + open, close).trim(), display });
          i = close + open;
          continue;
        }
      }
    }
    buffer += ch;
    i++;
  }
  flush();
  return out;
}

function findClose(text: string, from: number, display: boolean) {
  for (let j = from; j < text.length; j++) {
    if (text[j] === "\\") {
      j++;
      continue;
    }
    if (text[j] === "\n" && text[j + 1] === "\n") return -1;
    if (display) {
      if (text[j] === "$" && text[j + 1] === "$") return j;
    } else if (text[j] === "$" && !/\s/.test(text[j - 1] ?? "") && !/\d/.test(text[j + 1] ?? "")) {
      return j;
    }
  }
  return -1;
}

/** Plain reading of rich text, for search snippets and lists. */
export function richToPlain(text: string) {
  return parseRich(text)
    .map((s) => (s.kind === "text" ? s.text : s.kind === "math" ? s.tex.replace(/\\(text|mathrm)\{([^}]*)\}/g, "$2").replace(/[{}\\]/g, "") : "[figura]"))
    .join("");
}

export type Box = [number, number, number, number];

/** Grows a normalized [ymin, xmin, ymax, xmax] box (0–1000) by `pad` and clamps it. Null when unusable. */
export function padBox(box: readonly number[], pad = 12): Box | null {
  if (box.length !== 4 || box.some((v) => !Number.isFinite(v))) return null;
  let [y0, x0, y1, x1] = box as Box;
  if (y1 < y0) [y0, y1] = [y1, y0];
  if (x1 < x0) [x0, x1] = [x1, x0];
  if (y1 - y0 < 5 || x1 - x0 < 5) return null;
  const clamp = (v: number) => Math.max(0, Math.min(1000, Math.round(v)));
  return [clamp(y0 - pad), clamp(x0 - pad), clamp(y1 + pad), clamp(x1 + pad)];
}

/** Numbers with two or more digits present in the extraction but absent from the PDF text layer. */
export function numbersMissingFromSource(extracted: string, sourceText: string) {
  const digits = (s: string) => new Set(s.match(/\d{2,}/g) ?? []);
  const source = digits(sourceText);
  const sourceJoined = sourceText.replace(/[^\d]/g, " ");
  return [...digits(extracted)].filter((n) => !source.has(n) && !sourceJoined.includes(n));
}
