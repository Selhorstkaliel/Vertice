import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/*
 * Renders the small markdown subset the Mentor is asked to use: paragraphs,
 * lists, bold, inline code and links. Output is built as React elements (no
 * HTML injection), and links only resolve to known in-app routes.
 */

const INTERNAL_ROUTES = ["/painel", "/plano", "/rotina", "/edital", "/questoes", "/caderno-de-erros", "/flashcards", "/simulados", "/desempenho", "/concursos", "/mentor"];

function safeHref(href: string): string | null {
  if (!href.startsWith("/") || href.startsWith("//") || href.includes("\\")) return null;
  const path = href.split(/[?#]/)[0] ?? "";
  return INTERNAL_ROUTES.some((r) => path === r || path.startsWith(`${r}/`)) ? href : null;
}

const TOKEN = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\))/g;

function inline(text: string, key: string): React.ReactNode[] {
  return text.split(TOKEN).map((part, i) => {
    const k = `${key}-${i}`;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={k} className="font-semibold text-fg">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code key={k} className="rounded-[4px] bg-elevated px-1 py-0.5 font-mono text-[0.9em]">
          {part.slice(1, -1)}
        </code>
      );
    }
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (link) {
      const href = safeHref(link[2]!);
      return href ? (
        <Link key={k} href={href} className="text-info underline-offset-4 hover:underline">
          {link[1]}
        </Link>
      ) : (
        <React.Fragment key={k}>{link[1]}</React.Fragment>
      );
    }
    return <React.Fragment key={k}>{part}</React.Fragment>;
  });
}

type LineKind = "ul" | "ol" | "p";

function classify(line: string): { kind: LineKind; text: string } {
  const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
  if (bullet) return { kind: "ul", text: bullet[1]! };
  const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
  if (numbered) return { kind: "ol", text: numbered[1]! };
  // Headings are not part of the style, but render gracefully as strong lines.
  const heading = /^\s*#{1,6}\s+(.*)$/.exec(line);
  if (heading) return { kind: "p", text: `**${heading[1]!.replace(/\*\*/g, "")}**` };
  return { kind: "p", text: line };
}

export function MessageBody({ text, className }: { text: string; className?: string }) {
  const groups: { kind: LineKind; lines: string[] }[] = [];
  for (const block of text.replace(/\r\n/g, "\n").split(/\n{2,}/)) {
    let current: { kind: LineKind; lines: string[] } | null = null;
    for (const raw of block.split("\n")) {
      if (!raw.trim()) continue;
      const { kind, text: content } = classify(raw);
      if (!current || current.kind !== kind) {
        current = { kind, lines: [] };
        groups.push(current);
      }
      current.lines.push(content);
    }
  }

  return (
    <div className={cn("flex flex-col gap-3 text-base leading-relaxed text-fg-muted", className)}>
      {groups.map((g, gi) => {
        if (g.kind === "ul" || g.kind === "ol") {
          const List = g.kind;
          return (
            <List key={gi} className={cn("flex flex-col gap-1.5 pl-5", g.kind === "ul" ? "list-disc marker:text-fg-faint" : "list-decimal marker:text-fg-subtle")}>
              {g.lines.map((line, li) => (
                <li key={li} className="pl-1">
                  {inline(line, `${gi}-${li}`)}
                </li>
              ))}
            </List>
          );
        }
        return (
          <p key={gi}>
            {g.lines.map((line, li) => (
              <React.Fragment key={li}>
                {li > 0 && <br />}
                {inline(line, `${gi}-${li}`)}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
