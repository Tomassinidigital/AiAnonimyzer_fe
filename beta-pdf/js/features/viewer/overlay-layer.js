/* Overlay delle redazioni sulle pagine: un box per riga di ogni occorrenza.

   - redazione attiva → box pieno (o testo mascherato nelle modalità di
     mascheramento); disattivata (clic sul box o casella della lista) →
     contorno tratteggiato ("ghost");
   - rilevamento IA → contorno nel colore del MODULO che l'ha oscurato (GDPR,
     Gare…: lo stesso del suo bottone attivo; ripiego sul colore del ranking) e
     pallino dello score in alto a destra nel colore del ranking;
   - clic su un box → attiva/disattiva quell'occorrenza (azione annullabile) e
     la lista di destra si posiziona sulla sua frase, con la casella allineata;
   - dato a checksum errato → box rosso SENZA riempimento con la dicitura
     dell'errore: è una segnalazione, il dato non viene oscurato. */

import { EV } from "../../core/store.js";
import { toggleOccurrence } from "../../domain/redactions.js";
import { rankColor, rankLabel } from "../../domain/selection.js";

export function createOverlayLayer({ state, bus, pdf }) {
  // Dopo il ridisegno (REDACTIONS) la lista si posiziona sulla stessa frase.
  function toggle(g, occ, oi) {
    toggleOccurrence(g, occ);
    bus.emit(EV.REDACTIONS, { record: true });
    bus.emit(EV.FOCUS_GROUP, { gid: g.id, oi });
  }

  /* Marquee: bordo tratteggiato animato attorno a ogni riga dell'occorrenza
     selezionata, per un paio di secondi. Elemento a parte sopra il box (i box
     mascherati tagliano ciò che sporge). */
  const MARQUEE_MS = 1800;
  let marqueeTimer = null;
  function marquee({ gid, oi = 0 } = {}) {
    document.querySelectorAll(".marquee-ring").forEach((el) => el.remove());
    clearTimeout(marqueeTimer);
    const boxes = document.querySelectorAll(`.redaction-box[data-g="${gid}"][data-o="${oi}"]`);
    boxes.forEach((box) => {
      const ring = document.createElement("div");
      ring.className = "marquee-ring";
      ring.style.cssText = `left:${box.offsetLeft}px;top:${box.offsetTop}px;` +
        `width:${box.offsetWidth}px;height:${box.offsetHeight}px;`;
      box.parentElement.appendChild(ring);
    });
    marqueeTimer = setTimeout(() => document.querySelectorAll(".marquee-ring").forEach((el) => el.remove()), MARQUEE_MS);
  }

  function boxElement(g, occ, oi, b, r, rColor) {
    const masking = occ.on && pdf.isMaskMode(state.mode) && b.masked;
    // Contorno nel colore del modulo che ha oscurato il dato (ripiego: ranking);
    // vale anche per il tratteggio dell'oscuramento annullato.
    const mod = occ.module && state.modules.find((x) => x.key === occ.module);
    const outline = (mod && mod.color) || rColor;
    const div = document.createElement("div");
    div.className = "redaction-box" + (occ.on ? "" : " ghost") + (masking ? " masked rot" + (b.rot || 0) : "") + (rColor ? " ranked" : "");
    div.dataset.g = g.id; div.dataset.o = oi; // per la navigazione ▲▼
    let css = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;`;
    if (rColor) css += `--rank:${rColor};`;
    if (outline) css += `--outline:${outline};`;
    if (!occ.on) css += `--ghost:${outline || g.color};`;
    else if (masking) css += `font-size:${pdf.maskFontSize(b.masked, r.width, r.height, b.rot)}px;`;
    div.style.cssText = css;
    if (masking) div.textContent = b.masked;
    const rankTxt = rColor ? ` · ranking ${occ.rank} (${rankLabel(state, occ.rank)}), score ${Number(occ.score).toFixed(2)}` : "";
    const modTxt = mod ? ` · modulo ${mod.label}` : "";
    div.title = (occ.on ? "Redatto" : "Non redatto") + " · " + g.labelIt + modTxt + rankTxt + " — clic per " + (occ.on ? "annullare" : "ripristinare");
    div.addEventListener("click", (e) => { e.stopPropagation(); toggle(g, occ, oi); });
    return div;
  }

  /* Pallino dello score (una volta per occorrenza). È un fratello del box, non
     un figlio: i box mascherati tagliano il contenuto che sporge. */
  function scoreDot(occ, r, rColor) {
    const dot = document.createElement("span");
    dot.className = "rank-dot";
    dot.style.cssText = `left:${r.left + r.width - 5}px;top:${r.top - 5}px;background:${rColor};`;
    dot.title = `Score ${Number(occ.score).toFixed(2)} · ranking ${occ.rank} (${rankLabel(state, occ.rank)})`;
    return dot;
  }

  /* Segnalazione: contorno rosso + etichetta sopra la prima riga. */
  function flagElements(f, r, first) {
    const div = document.createElement("div");
    div.className = "flag-box";
    div.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;`;
    div.title = `${f.label}: «${f.text}» non viene oscurato. Verifica il dato o oscuralo a mano.`;
    if (!first) return [div];
    const tag = document.createElement("span");
    tag.className = "flag-tag";
    tag.style.cssText = `left:${r.left}px;top:${r.top}px;`;
    tag.textContent = f.label;
    return [div, tag];
  }

  function render() {
    state.pageRenders.forEach((pr) => (pr.overlay.innerHTML = ""));
    (state.flags || []).forEach((f) => {
      if (state.deletedPages.has(f.page)) return;
      const pr = state.pageRenders[f.page];
      if (!pr) return;
      f.boxes.forEach((b, bi) => {
        const r = pdf.boxToViewportRect(b, pr.viewport);
        flagElements(f, r, bi === 0).forEach((el) => {
          pr.overlay.appendChild(el);
          // L'etichetta non deve uscire dal bordo destro della pagina.
          if (el.className === "flag-tag") {
            const maxLeft = pr.overlay.clientWidth - el.offsetWidth - 2;
            el.style.left = Math.max(0, Math.min(r.left, maxLeft)) + "px";
          }
        });
      });
    });
    // Anche i gruppi disattivati: le loro occorrenze restano come box tratteggiati.
    state.groups.forEach((g) => {
      g.occurrences.forEach((occ, oi) => {
        if (state.deletedPages.has(occ.page)) return; // niente box sulle pagine eliminate
        const pr = state.pageRenders[occ.page];
        if (!pr) return;
        const rColor = g.source === "ai" && occ.rank ? rankColor(state, occ.rank) : null;
        occ.boxes.forEach((b, bi) => {
          const r = pdf.boxToViewportRect(b, pr.viewport);
          pr.overlay.appendChild(boxElement(g, occ, oi, b, r, rColor));
          if (rColor && bi === 0) pr.overlay.appendChild(scoreDot(occ, r, rColor));
        });
      });
    });
  }

  function mount() {
    bus.on(EV.PAGES_RENDERED, render);
    bus.on(EV.REDACTIONS, render);
    bus.on(EV.FOCUS_GROUP, marquee);
  }

  return { mount };
}
