/**
 * Traduzione della selezione del browser in offset di carattere del documento.
 *
 * Il DOM reso non è una copia lineare del testo: contiene le etichette `.tag`
 * (non fanno parte del documento) e, in modalità layout PDF, i blocchi possono
 * essere riordinati o resi solo parzialmente (una singola pagina). Per questo
 * non si può contare il testo dall'inizio del contenitore: ogni porzione resa
 * porta `data-cstart` con l'offset assoluto del suo primo carattere, e qui si
 * ricostruisce l'intervallo sommando lo scarto interno alla porzione.
 */

/** Lunghezza del testo di un range, escluse le etichette `.tag`. */
function textLen(range: Range): number {
  const clone = range.cloneContents();
  clone.querySelectorAll(".tag").forEach((el) => el.remove());
  return clone.textContent?.length ?? 0;
}

/**
 * Intervallo [start, end) di caratteri del documento coperto dalla selezione
 * corrente all'interno di `root`, oppure null se non c'è selezione utile.
 */
export function selectionCharRange(root: HTMLElement): [number, number] | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const selRange = sel.getRangeAt(0);
  if (!root.contains(selRange.commonAncestorContainer)) return null;

  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;

  root.querySelectorAll<HTMLElement>("[data-cstart]").forEach((chunk) => {
    const base = Number(chunk.dataset.cstart);
    if (!Number.isFinite(base)) return;
    if (!selRange.intersectsNode(chunk)) return;

    const chunkRange = document.createRange();
    chunkRange.selectNodeContents(chunk);

    // Intersezione fra selezione e porzione: il boundary più interno dei due.
    const startFromSel =
      selRange.compareBoundaryPoints(Range.START_TO_START, chunkRange) >= 0;
    const endFromSel =
      selRange.compareBoundaryPoints(Range.END_TO_END, chunkRange) <= 0;
    const inter = document.createRange();
    if (startFromSel) inter.setStart(selRange.startContainer, selRange.startOffset);
    else inter.setStart(chunkRange.startContainer, chunkRange.startOffset);
    if (endFromSel) inter.setEnd(selRange.endContainer, selRange.endOffset);
    else inter.setEnd(chunkRange.endContainer, chunkRange.endOffset);
    if (inter.collapsed) return;

    const before = document.createRange();
    before.setStart(chunkRange.startContainer, chunkRange.startOffset);
    before.setEnd(inter.startContainer, inter.startOffset);
    const offset = base + textLen(before);
    lo = Math.min(lo, offset);
    hi = Math.max(hi, offset + textLen(inter));
  });

  if (!Number.isFinite(lo) || hi <= lo) return null;
  return [lo, hi];
}
