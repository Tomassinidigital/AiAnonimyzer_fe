import { useEffect, useMemo, useRef, useState } from "react";
import type { Segment } from "@/api/types";
import { useSessionStore } from "@/store/sessionStore";
import { applyReRender } from "@/features/runner";
import { buildFlatNodes, buildLayoutNodes, docSourceOf } from "./highlightNodes";
import { selectionCharRange } from "@/utils/selection";

interface ActionBtn {
  top: number;
  left: number;
  label: string;
  title: string;
  onConfirm: () => void;
}

export function HighlightView() {
  const render = useSessionStore((s) => s.render);
  const isPdf = useSessionStore((s) => s.isPdf);
  const pdfLayout = useSessionStore((s) => s.pdfLayout);
  const manualRanges = useSessionStore((s) => s.manualRanges);
  const removeManualRange = useSessionStore((s) => s.removeManualRange);
  const addManualRange = useSessionStore((s) => s.addManualRange);
  const addExcludedRange = useSessionStore((s) => s.addExcludedRange);
  const setStatus = useSessionStore((s) => s.setStatus);

  const viewRef = useRef<HTMLDivElement>(null);
  const [action, setAction] = useState<ActionBtn | null>(null);

  const segments = render?.segments ?? [];

  // Chiusura del pulsante fluttuante su click fuori / scroll / Esc.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (action && (e.target as HTMLElement)?.className !== "manual-redact-btn") {
        setAction(null);
      }
    };
    const onScroll = () => setAction(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAction(null);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScroll, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [action]);

  function onEntityClick(el: HTMLElement, seg: Segment) {
    const rect = el.getBoundingClientRect();
    const label = seg.text.trim() || seg.label || "";
    setAction({
      top: Math.max(8, rect.top - 34),
      left: Math.min(window.innerWidth - 84, Math.max(8, rect.right - 8)),
      label: "Ripristina",
      title: `Non offuscare "${label}" (${seg.start}–${seg.end})`,
      onConfirm: () => {
        const idx = manualRanges.findIndex(
          ([s, e]) => s === seg.start && e === seg.end,
        );
        if (idx >= 0) {
          removeManualRange([seg.start, seg.end]);
          setStatus(`Offuscamento manuale rimosso (${seg.start}–${seg.end}).`);
        } else {
          addExcludedRange([seg.start, seg.end]);
          setStatus(`"${label}" ripristinato: non sarà offuscato.`);
        }
        setAction(null);
        applyReRender();
      },
    });
  }

  function onMouseUp() {
    const root = viewRef.current;
    if (!root) return;
    const picked = selectionCharRange(root);
    if (!picked) return;
    const [start, end] = picked;
    const rect = window.getSelection()!.getRangeAt(0).getBoundingClientRect();
    setAction({
      top: Math.max(8, rect.top - 34),
      left: Math.min(window.innerWidth - 84, Math.max(8, rect.right - 8)),
      label: "Oscura",
      title: "Offusca manualmente la selezione",
      onConfirm: () => {
        addManualRange([start, end]);
        window.getSelection()?.removeAllRanges();
        setStatus(`Offuscamento manuale aggiunto (${start}–${end}).`, "ok");
        setAction(null);
        applyReRender();
      },
    });
  }

  const src = useMemo(() => docSourceOf(segments), [segments]);
  const nodes =
    isPdf && pdfLayout
      ? buildLayoutNodes(src, segments, pdfLayout, { onEntityClick })
      : buildFlatNodes(src, segments, isPdf, { onEntityClick });

  return (
    <>
      <div
        ref={viewRef}
        id="highlight-view"
        className={`doc-view${isPdf ? " doc-view-pdf" : ""}`}
        tabIndex={0}
        onMouseUp={onMouseUp}
      >
        {nodes}
      </div>
      {action && (
        <button
          type="button"
          className="manual-redact-btn"
          title={action.title}
          style={{ position: "fixed", top: action.top, left: action.left }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={action.onConfirm}
        >
          {action.label}
        </button>
      )}
    </>
  );
}
