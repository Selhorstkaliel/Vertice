import * as React from "react";
import katex from "katex";
import { parseRich } from "@/engines/questions/rich-text";
import { cn } from "@/lib/utils";

export interface QuestionFigure {
  file: string | null;
  description: string;
}

export function figureUrl(file: string) {
  return `/api/figuras/${file}`;
}

function renderMath(tex: string, display: boolean) {
  try {
    return katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: "ignore", output: "htmlAndMathml", trust: false, maxExpand: 500 });
  } catch {
    return null;
  }
}

/**
 * Question text with LaTeX formulas and figures in place. `inline` renders
 * figures smaller, for alternatives. KaTeX output is generated from the text
 * with trust disabled, so it cannot carry links, styles or scripts.
 */
export function RichText({ text, figures = [], className, inline = false }: { text: string; figures?: QuestionFigure[]; className?: string; inline?: boolean }) {
  const segments = parseRich(text);
  const Wrapper = inline ? "span" : "div";
  return (
    <Wrapper className={cn("whitespace-pre-line", className)}>
      {segments.map((s, i) => {
        if (s.kind === "text") return <React.Fragment key={i}>{s.text}</React.Fragment>;
        if (s.kind === "math") {
          const html = renderMath(s.tex, s.display);
          if (!html) return <code key={i}>{s.tex}</code>;
          return s.display ? (
            <span key={i} className="my-3 block overflow-x-auto overflow-y-hidden" dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            <span key={i} dangerouslySetInnerHTML={{ __html: html }} />
          );
        }
        const figure = figures[s.index - 1];
        if (!figure?.file) return <span key={i} className="text-fg-subtle">[figura {s.index} indisponível]</span>;
        return (
          // eslint-disable-next-line @next/next/no-img-element -- private, auth-checked files; next/image would proxy them publicly.
          <img
            key={i}
            src={figureUrl(figure.file)}
            alt={figure.description || `Figura ${s.index}`}
            loading="lazy"
            className={cn("rounded-md bg-white p-2", inline ? "inline-block max-h-40 align-middle" : "my-4 block max-h-[28rem] w-auto max-w-full")}
          />
        );
      })}
    </Wrapper>
  );
}
