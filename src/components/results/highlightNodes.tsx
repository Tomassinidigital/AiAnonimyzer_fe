/**
 * Costruzione dei nodi della vista "Evidenziato" (testo del documento con le
 * entità rilevate). Condivisa fra la tab Evidenziato e la modale di
 * offuscamento per pagina della vista PDF, così le due mostrano esattamente lo
 * stesso rendering.
 *
 * Il testo è descritto da un `DocSource` (testo + offset assoluto del primo
 * carattere): la modale ne rende solo una pagina, riletta dal server, ma
 * continua a ragionare in offset ASSOLUTI del documento — gli stessi usati da
 * entità, correzioni manuali e range di esclusione.
 *
 * Ogni porzione di testo resa porta `data-cstart` con l'offset assoluto del suo
 * primo carattere: è ciò che permette di risalire dalla selezione del browser
 * agli offset del documento anche quando si rende un solo sottoinsieme del
 * testo o quando il layout PDF riordina i blocchi (cfr. utils/selection.ts).
 */
import { Fragment, type ReactNode } from "react";
import type { PdfLayoutBlock, Segment } from "@/api/types";

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

/** Testo reso e offset assoluto (nel documento) del suo primo carattere. */
export interface DocSource {
  text: string;
  base: number;
}

/** Documento intero ricomposto dai segmenti del render (base 0). */
export function docSourceOf(segments: Segment[]): DocSource {
  return { text: segments.map((s) => s.text).join(""), base: 0 };
}

/** Porzione [a, b) in offset ASSOLUTI, ritagliata su quanto `src` contiene. */
function cut(src: DocSource, a: number, b: number): string {
  const from = Math.max(0, a - src.base);
  const to = Math.min(src.text.length, b - src.base);
  return to > from ? src.text.slice(from, to) : "";
}

export type EntityClickHandler = (el: HTMLElement, seg: Segment) => void;

export interface HighlightOptions {
  /** Click su un'entità già rilevata (ripristino). Assente ⇒ entità inerti. */
  onEntityClick?: EntityClickHandler;
  /** Click su una frase in attesa di conferma (annulla la selezione). */
  onPendingClick?: EntityClickHandler;
  /** Frasi selezionate manualmente ma non ancora confermate. */
  pending?: Segment[];
  /** Riconoscimento dei titoli nel testo piatto (solo PDF). */
  headings?: boolean;
  /**
   * Entità rese come box pieni nel colore della gravità (come gli overlay sul
   * PDF) invece che con lo sfondo tenue della tab Evidenziato.
   */
  boxed?: boolean;
  /** Mappa gravità → colore, necessaria con `boxed`. */
  severityColors?: Record<string, string>;
}

interface EntitySpanProps {
  seg: Segment;
  /** Offset assoluto del primo carattere reso (l'entità può essere spezzata). */
  cstart: number;
  text: string;
  pending?: boolean;
  onClick?: EntityClickHandler;
  boxed?: boolean;
  severityColors?: Record<string, string>;
}

export function EntitySpan({
  seg,
  cstart,
  text,
  pending,
  onClick,
  boxed,
  severityColors,
}: EntitySpanProps) {
  const cls = [
    "ent",
    pending ? "ent-pending" : "",
    boxed && !pending ? "ent-boxed" : "",
    onClick ? "" : "ent-inert",
  ]
    .filter(Boolean)
    .join(" ");
  const title = pending
    ? `Nuova frase da offuscare: "${text.trim()}" · clic per annullare`
    : `${seg.label} · ${seg.severity} · score ${seg.score}` +
      (onClick ? " · clic per ripristinare" : " · già offuscato");
  const color = boxed && !pending ? severityColors?.[seg.severity ?? ""] : undefined;
  return (
    <span
      className={cls}
      data-sev={seg.severity ?? undefined}
      data-start={seg.start}
      data-end={seg.end}
      data-cstart={cstart}
      title={title}
      style={color ? { background: color, borderColor: color } : undefined}
      onClick={
        onClick
          ? (e) => {
              e.stopPropagation();
              onClick(e.currentTarget, seg);
            }
          : undefined
      }
    >
      {text}
      <span className="tag" aria-hidden="true">
        {seg.label}
      </span>
    </span>
  );
}

/** Segmento sintetico per una frase selezionata e non ancora confermata. */
export function pendingSegment(
  src: DocSource,
  start: number,
  end: number,
): Segment {
  return {
    text: cut(src, start, end),
    entity_type: "MANUAL",
    label: "NUOVO",
    severity: null,
    score: null,
    start,
    end,
  };
}

interface Ent {
  start: number;
  end: number;
  seg: Segment;
  pending: boolean;
}

/**
 * Entità rilevate + frasi in attesa, ordinate per offset. Una frase in attesa
 * che si sovrappone a un'entità già rilevata viene scartata: sarebbe comunque
 * offuscata e renderla spezzerebbe il testo in due box adiacenti.
 */
function collectEntities(segments: Segment[], pending: Segment[]): Ent[] {
  const out: Ent[] = segments
    .filter((s) => s.entity_type)
    .map((s) => ({ start: s.start, end: s.end, seg: s, pending: false }));
  for (const p of pending) {
    if (out.some((e) => p.start < e.end && e.start < p.end)) continue;
    out.push({ start: p.start, end: p.end, seg: p, pending: true });
  }
  return out.sort((a, b) => a.start - b.start);
}

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

/** Rende l'intervallo [a, b) del documento alternando testo ed entità. */
function renderRange(
  src: DocSource,
  ents: Ent[],
  a: number,
  b: number,
  keyBase: string,
  opts: HighlightOptions,
): ReactNode[] {
  const out: ReactNode[] = [];
  let p = Math.max(a, src.base);
  const stop = Math.min(b, src.base + src.text.length);
  let k = 0;
  while (p < stop) {
    const e = ents.find((en) => en.start <= p && p < en.end);
    if (e) {
      const ce = Math.min(stop, e.end);
      out.push(
        <EntitySpan
          key={`${keyBase}-e${k++}`}
          seg={e.seg}
          cstart={p}
          text={cut(src, p, ce)}
          pending={e.pending}
          onClick={e.pending ? opts.onPendingClick : opts.onEntityClick}
          boxed={opts.boxed}
          severityColors={opts.severityColors}
        />,
      );
      p = ce;
    } else {
      let next = stop;
      for (const en of ents) {
        if (en.start > p && en.start < next) next = en.start;
      }
      const chunk = cut(src, p, next);
      const key = `${keyBase}-t${k++}`;
      out.push(
        <span className="txt" data-cstart={p} key={key}>
          {opts.headings ? renderTextWithHeadings(chunk, key) : chunk}
        </span>,
      );
      p = next;
    }
  }
  return out;
}

// ---- Costruzione nodi: testo piatto ----
export function buildFlatNodes(
  src: DocSource,
  segments: Segment[],
  isPdf: boolean,
  opts: HighlightOptions = {},
): ReactNode[] {
  const ents = collectEntities(segments, opts.pending ?? []);
  return renderRange(src, ents, src.base, src.base + src.text.length, "f", {
    ...opts,
    headings: isPdf,
  });
}

// ---- Costruzione nodi: layout PDF (blocchi/righe) ----
/**
 * `blocks` può essere un sottoinsieme (es. i soli blocchi di una pagina): i
 * separatori di pagina compaiono solo fra pagine effettivamente presenti.
 */
export function buildLayoutNodes(
  src: DocSource,
  segments: Segment[],
  blocks: PdfLayoutBlock[],
  opts: HighlightOptions = {},
): ReactNode[] {
  const ents = collectEntities(segments, opts.pending ?? []);

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
            {renderRange(src, ents, line.start, line.end, `b${i}l${j}`, opts)}
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
