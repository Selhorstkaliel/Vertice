"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/overlay";
import { cropFigureAction } from "@/modules/exam-papers/actions";

type Box = [number, number, number, number];

const clamp = (v: number) => Math.max(0, Math.min(1000, Math.round(v)));

/**
 * Shows a page of the imported exam and lets the reviewer drag a rectangle
 * around the figure. Arrow keys nudge the selection for fine adjustments.
 */
export function CropDialog({
  open,
  onOpenChange,
  draftId,
  paperId,
  index,
  pageCount,
  initialPage,
  initialBox,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draftId: string;
  paperId: string;
  index: number;
  pageCount: number | null;
  initialPage: number;
  initialBox: Box | null;
}) {
  const router = useRouter();
  const [page, setPage] = React.useState(initialPage);
  const [box, setBox] = React.useState<Box | null>(initialBox);
  const [loaded, setLoaded] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const surface = React.useRef<HTMLDivElement>(null);
  const drag = React.useRef<{ x: number; y: number } | null>(null);

  React.useEffect(() => {
    if (open) {
      setPage(initialPage);
      setBox(initialBox);
    }
  }, [open, initialPage, initialBox]);

  const point = (e: React.PointerEvent) => {
    const rect = surface.current!.getBoundingClientRect();
    return { x: clamp(((e.clientX - rect.left) / rect.width) * 1000), y: clamp(((e.clientY - rect.top) / rect.height) * 1000) };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = point(e);
    drag.current = p;
    setBox([p.y, p.x, p.y, p.x]);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const start = drag.current;
    const p = point(e);
    setBox([Math.min(start.y, p.y), Math.min(start.x, p.x), Math.max(start.y, p.y), Math.max(start.x, p.x)]);
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!box) return;
    const step = e.shiftKey ? 10 : 2;
    const move: Record<string, [number, number]> = { ArrowUp: [-step, 0], ArrowDown: [step, 0], ArrowLeft: [0, -step], ArrowRight: [0, step] };
    const delta = move[e.key];
    if (!delta) return;
    e.preventDefault();
    const [dy, dx] = delta;
    // Alt resizes the bottom-right corner; otherwise the whole box moves.
    setBox(e.altKey ? [box[0], box[1], clamp(box[2] + dy), clamp(box[3] + dx)] : [clamp(box[0] + dy), clamp(box[1] + dx), clamp(box[2] + dy), clamp(box[3] + dx)]);
  };

  const valid = !!box && box[2] - box[0] >= 5 && box[3] - box[1] >= 5;

  const save = () => {
    if (!box || !valid) return;
    startTransition(async () => {
      const r = await cropFigureAction(draftId, index, page, box);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(r.message);
      onOpenChange(false);
      router.refresh();
    });
  };

  const goTo = (next: number) => {
    setLoaded(false);
    setPage(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`Recortar figura ${index + 1}`}
        description="Arraste sobre a página para marcar só a figura. Setas movem a seleção; Alt + setas mudam o tamanho."
        className="max-h-[94dvh] max-w-3xl"
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={() => goTo(page - 1)} disabled={page <= 1}>
              <ChevronLeft /> Anterior
            </Button>
            <span className="text-sm text-fg-muted tabular-nums">
              Página {page}
              {pageCount ? ` de ${pageCount}` : ""}
            </span>
            <Button variant="ghost" size="sm" onClick={() => goTo(page + 1)} disabled={pageCount !== null && page >= pageCount}>
              Próxima <ChevronRight />
            </Button>
          </div>
          <div
            ref={surface}
            role="application"
            aria-label={`Página ${page} da prova. Arraste para selecionar a figura.`}
            tabIndex={0}
            onKeyDown={onKeyDown}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className="relative mx-auto w-full max-w-2xl cursor-crosshair touch-none overflow-hidden rounded-md bg-white select-none focus-visible:outline-2 focus-visible:outline-info"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- admin-only rendered page */}
            <img
              src={`/api/admin/provas/${paperId}/paginas/${page}`}
              alt=""
              draggable={false}
              onLoad={() => setLoaded(true)}
              className="block w-full"
            />
            {!loaded && <p className="absolute inset-0 flex items-center justify-center text-sm text-neutral-500">Carregando a página…</p>}
            {box && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute border-2 border-info bg-info/10 shadow-[0_0_0_9999px_rgb(0_0_0/0.35)]"
                style={{ top: `${box[0] / 10}%`, left: `${box[1] / 10}%`, height: `${(box[2] - box[0]) / 10}%`, width: `${(box[3] - box[1]) / 10}%` }}
              />
            )}
          </div>
        </div>
        <DialogFooter className="px-0 pt-4 pb-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={save} loading={pending} disabled={!valid}>
            Salvar recorte
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
