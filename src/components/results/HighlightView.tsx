import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import type { Segment } from "@/api/types";
import { useSessionStore } from "@/store/sessionStore";
import { applyReRender } from "@/features/runner";

const MD_SECTION_RE = /^(ARTICOLO|ART\.?|CAPO|TITOLO|SEZIONE|PARTE|ALLEGATO)\b/i;
const MD_NUMBERED_RE = /^\d+(\.\d+){0,3}[.)]?\s+\S.{0,90}$/;

function isHeadingLine(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 90) return false;
  if (MD_SECTION_RE.test(t)) return true;
  if (MD_NUMBERED_RE.test(t) && !/[.,;:]$/.test(t)) return true;
  const letters = t.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, "");
  return (
    letters.length >= 4 &&
    t.length <= 80 &&
    t === t.toUpperCase() &&
    /[A-ZÀ-Ö]/.test(t)
  );
}

interface EntitySpanProps {
  seg: Segment;
  text: string;
  onClick: (el: HTMLElement, seg: Segment) => void;
}

function EntitySpan({ seg, text, onClick }: EntitySpanProps) {
  return (
    <span
      className="ent"
      data-sev={seg.severity ?? undefined}
      data-start={seg.start}
      data-end={seg.end}
      title={`${seg.label} · ${seg.severity} · score ${seg.score} · clic per ripristinare`}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e.currentTarget, seg);
      }}
    >
      {text}
      <span className="tag" aria-hidden="true">
        {seg.label}
      </span>
    </span>
  );
}

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

  // Offset di carattere della selezione, escludendo i nodi .tag (etichette).
  function textOffset(root: Node, node: Node, offset: number): number {
    const range = document.createRange();
    range.selectNodeContents(root);
    range.setEnd(node, offset);
    const clone = range.cloneContents();
    clone.querySelectorAll(".tag").forEach((el) => el.remove());
    return clone.textContent?.length ?? 0;
  }

  function onMouseUp() {
    const root = viewRef.current;
    if (!root) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return;
    const start = textOffset(root, range.startContainer, range.startOffset);
    const end = textOffset(root, range.endContainer, range.endOffset);
    if (end <= start) return;
    const rect = range.getBoundingClientRect();
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

  const nodes =
    isPdf && pdfLayout
      ? buildLayoutNodes(segments, pdfLayout, onEntityClick)
      : buildFlatNodes(segments, isPdf, onEntityClick);

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

// ---- Costruzione nodi: testo piatto ----
function renderTextWithHeadings(text: string, keyBase: string): ReactNode[] {
  const lines = text.split("\n");
  if (lines.length < 2) return [text];
  const out: ReactNode[] = [];
  lines.forEach((line, i) => {
    if (i > 0) out.push("\n");
    if (isHeadingLine(line)) {
      out.push(
        <strong className="md-heading" key={`${keyBase}-h${i}`}>
          {line}
        </strong>,
      );
    } else {
      out.push(line);
    }
  });
  return out;
}

function buildFlatNodes(
  segments: Segment[],
  isPdf: boolean,
  onClick: (el: HTMLElement, seg: Segment) => void,
): ReactNode[] {
  return segments.map((seg, i) => {
    if (seg.entity_type) {
      return <EntitySpan key={i} seg={seg} text={seg.text} onClick={onClick} />;
    }
    if (isPdf) {
      return <Fragment key={i}>{renderTextWithHeadings(seg.text, `t${i}`)}</Fragment>;
    }
    return <Fragment key={i}>{seg.text}</Fragment>;
  });
}

// ---- Costruzione nodi: layout PDF (blocchi/righe) ----
function buildLayoutNodes(
  segments: Segment[],
  blocks: import("@/api/types").PdfLayoutBlock[],
  onClick: (el: HTMLElement, seg: Segment) => void,
): ReactNode[] {
  const fullText = segments.map((s) => s.text).join("");
  const entities = segments
    .filter((s) => s.entity_type)
    .map((s) => ({ start: s.start, end: s.end, seg: s }))
    .sort((a, b) => a.start - b.start);

  // Separatore di pagina dopo l'ultimo blocco di ogni pagina (tranne l'ultima).
  const lastBlockOfPage = new Map<number, number>();
  const orderedPages: number[] = [];
  blocks.forEach((b, i) => {
    if (!lastBlockOfPage.has(b.page)) orderedPages.push(b.page);
    lastBlockOfPage.set(b.page, i);
  });
  const sepAfter = new Map<number, number>();
  orderedPages.forEach((pg, idx) => {
    if (idx === orderedPages.length - 1) return;
    sepAfter.set(lastBlockOfPage.get(pg)!, orderedPages[idx + 1] + 1);
  });

  const renderRange = (a: number, b: number, keyBase: string): ReactNode[] => {
    const out: ReactNode[] = [];
    let p = a;
    let k = 0;
    while (p < b) {
      const e = entities.find((en) => en.start <= p && p < en.end);
      if (e) {
        const ce = Math.min(b, e.end);
        out.push(
          <EntitySpan
            key={`${keyBase}-e${k++}`}
            seg={e.seg}
            text={fullText.slice(p, ce)}
            onClick={onClick}
          />,
        );
        p = ce;
      } else {
        let next = b;
        for (const en of entities) {
          if (en.start > p && en.start < next) next = en.start;
        }
        out.push(<Fragment key={`${keyBase}-t${k++}`}>{fullText.slice(p, next)}</Fragment>);
        p = next;
      }
    }
    return out;
  };

  const out: ReactNode[] = [];
  blocks.forEach((block, i) => {
    out.push(
      <div
        key={`b${i}`}
        className="pdf-block"
        data-kind={block.kind}
        data-region={block.region}
        data-align={block.align}
        style={{ ["--font-scale" as string]: block.font_scale }}
      >
        {block.lines.map((line, j) => (
          <Fragment key={j}>
            {renderRange(line.start, line.end, `b${i}l${j}`)}
            {j < block.lines.length - 1 && <br />}
          </Fragment>
        ))}
      </div>,
    );
    if (sepAfter.has(i)) {
      out.push(
        <div
          key={`sep${i}`}
          className="pdf-page-break"
          aria-hidden="true"
          data-page={sepAfter.get(i)}
        />,
      );
    }
  });
  return out;
}
