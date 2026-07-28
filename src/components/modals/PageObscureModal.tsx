/**
 * Modale "offusca nuove frasi", aperta cliccando un punto libero della pagina
 * PDF (cioè fuori da una sezione già offuscata).
 *
 * Il contenuto è RILETTO DAL SERVER per la pagina indicata a ogni apertura:
 * mostra il testo esatto di quella pagina — comprese le frasi già offuscate,
 * che compaiono col loro testo originale dentro box del colore della gravità —
 * con lo stesso rendering della tab "Evidenziato". Le frasi selezionate restano
 * in attesa finché non si conferma: la conferma le salva e riaggiorna subito
 * tutte le offuscazioni.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { errorDetail } from "@/api/client";
import { getPdfPage } from "@/api/endpoints";
import type { PdfPageContent, Segment } from "@/api/types";
import { useCatalogStore } from "@/store/catalogStore";
import { selectionCharRange } from "@/utils/selection";
import type { Range } from "@/utils/corrections";
import {
  buildFlatNodes,
  buildLayoutNodes,
  pendingSegment,
  type DocSource,
} from "@/components/results/highlightNodes";

interface Props {
  docId: string;
  /** Indice di pagina 0-based. */
  page: number;
  /** Correzioni correnti da applicare alla rilettura (manual/excluded/gravità). */
  params: Record<string, string>;
  onCancel: () => void;
  onConfirm: (ranges: Range[]) => void;
}

interface FloatBtn {
  top: number;
  left: number;
  range: Range;
}

/** Toglie spazi e a-capo ai bordi della selezione (offset assoluti). */
function trimRange(src: DocSource, [a, b]: Range): Range | null {
  let s = a;
  let e = b;
  const at = (i: number) => src.text[i - src.base] ?? "";
  while (s < e && /\s/.test(at(s))) s++;
  while (e > s && /\s/.test(at(e - 1))) e--;
  return e > s ? [s, e] : null;
}

export function PageObscureModal({ docId, page, params, onCancel, onConfirm }: Props) {
  const severityColors = useCatalogStore((s) => s.severityColors);

  const [content, setContent] = useState<PdfPageContent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Range[]>([]);
  const [float, setFloat] = useState<FloatBtn | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Rilettura dal server della pagina indicata (a ogni apertura/cambio pagina).
  useEffect(() => {
    let cancelled = false;
    setContent(null);
    setError(null);
    setPending([]);
    setFloat(null);
    (async () => {
      try {
        const data = await getPdfPage(docId, page, params);
        if (!cancelled) setContent(data);
      } catch (e) {
        if (!cancelled) setError(errorDetail(e));
      }
    })();
    return () => {
      cancelled = true;
    };
    // `params` è ricostruito a ogni render: si dipende dal suo contenuto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, page, JSON.stringify(params)]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (float) setFloat(null);
      else onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [float, onCancel]);

  const src: DocSource | null = useMemo(
    () => (content ? { text: content.text, base: content.char_start } : null),
    [content],
  );

  const pendingSegs: Segment[] = useMemo(
    () => (src ? pending.map(([a, b]) => pendingSegment(src, a, b)) : []),
    [src, pending],
  );

  const dropPending = useCallback((_el: HTMLElement, seg: Segment) => {
    setPending((prev) => prev.filter(([a, b]) => !(a === seg.start && b === seg.end)));
  }, []);

  function onMouseUp() {
    const root = bodyRef.current;
    if (!root || !src) return;
    const picked = selectionCharRange(root);
    if (!picked) return;
    const range = trimRange(src, picked);
    if (!range) return;
    const rect = window.getSelection()!.getRangeAt(0).getBoundingClientRect();
    setFloat({
      top: Math.max(8, rect.top - 34),
      left: Math.min(window.innerWidth - 96, Math.max(8, rect.right - 8)),
      range,
    });
  }

  function addPending() {
    if (!float || !content) return;
    const [a, b] = float.range;
    const clash =
      content.entities.some((e) => a < e.end && e.start < b) ||
      pending.some(([s, t]) => a < t && s < b);
    if (clash) {
      setNotice("Quella porzione è già offuscata o già selezionata.");
    } else {
      setPending((prev) =>
        [...prev, [a, b] as Range].sort((x, y) => x[0] - y[0]),
      );
      setNotice(null);
    }
    window.getSelection()?.removeAllRanges();
    setFloat(null);
  }

  const nodes = !src
    ? null
    : content!.blocks.length
      ? buildLayoutNodes(src, content!.entities, content!.blocks, {
          pending: pendingSegs,
          onPendingClick: dropPending,
          boxed: true,
          severityColors,
        })
      : buildFlatNodes(src, content!.entities, true, {
          pending: pendingSegs,
          onPendingClick: dropPending,
          boxed: true,
          severityColors,
        });

  return (
    <div className="modal-overlay obscure-overlay" role="dialog" aria-modal="true">
      <div className="modal-box obscure-box">
        <h2 className="modal-title obscure-title">
          Pagina {page + 1}
          {content ? ` di ${content.total_pages}` : ""} — aggiungi frasi da offuscare
        </h2>
        <p className="obscure-help">
          Seleziona con il mouse una frase del testo e premi <b>Oscura</b>: ripeti
          per tutte le frasi da aggiungere. Le frasi <b>già offuscate</b> sono nei
          box colorati per gravità; quelle che stai aggiungendo sono tratteggiate
          (clicca per toglierle). Con <b>Conferma</b> le nuove frasi vengono
          salvate e le offuscazioni si aggiornano subito.
        </p>
        {notice && <div className="banner obscure-notice">{notice}</div>}
        {error && <div className="banner banner-error">{error}</div>}
        <div
          ref={bodyRef}
          className="obscure-body doc-view doc-view-pdf"
          onMouseDown={() => setFloat(null)}
          onMouseUp={onMouseUp}
          // Il pulsante è ancorato a coordinate fisse: scrollando il testo
          // resterebbe appeso lontano dalla frase selezionata.
          onScroll={() => setFloat(null)}
        >
          {content ? nodes : !error && <p className="obscure-loading">Lettura della pagina…</p>}
        </div>
        <div className="obscure-foot">
          <span className="obscure-count">
            {pending.length === 0
              ? "Nessuna nuova frase selezionata"
              : `${pending.length} nuove frasi da offuscare`}
          </span>
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onCancel}>
              Annulla
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => onConfirm(pending)}
            >
              Conferma e aggiorna
            </button>
          </div>
        </div>
      </div>
      {float && (
        <button
          type="button"
          className="manual-redact-btn"
          title="Offusca la frase selezionata"
          style={{ position: "fixed", top: float.top, left: float.left }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={addPending}
        >
          Oscura
        </button>
      )}
    </div>
  );
}
