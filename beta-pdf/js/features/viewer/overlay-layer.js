/* Overlay delle redazioni sulle pagine: un box per riga di ogni occorrenza.

   - redazione attiva → box pieno (o testo mascherato nelle modalità di
     mascheramento); disattivata → contorno tratteggiato ("ghost");
   - rilevamento IA → contorno nel colore del ranking e pallino dello score in
     alto a destra;
   - clic su un box → attiva/disattiva quell'occorrenza (azione annullabile). */

import { EV } from "../../core/store.js";
import { rankColor, rankLabel } from "../../domain/selection.js";

export function createOverlayLayer({ state, bus, pdf }) {
  function toggle(occ) {
    occ.on = !occ.on;
    bus.emit(EV.REDACTIONS, { record: true });
  }

  function boxElement(g, occ, oi, b, r, rColor) {
    const masking = occ.on && pdf.isMaskMode(state.mode) && b.masked;
    const div = document.createElement("div");
    div.className = "redaction-box" + (occ.on ? "" : " ghost") + (masking ? " masked rot" + (b.rot || 0) : "") + (rColor ? " ranked" : "");
    div.dataset.g = g.id; div.dataset.o = oi; // per la navigazione ▲▼
    let css = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;`;
    if (rColor) css += `--rank:${rColor};`;
    if (!occ.on) css += `--ghost:${rColor || g.color};`;
    else if (masking) css += `font-size:${pdf.maskFontSize(b.masked, r.width, r.height, b.rot)}px;`;
    div.style.cssText = css;
    if (masking) div.textContent = b.masked;
    const rankTxt = rColor ? ` · ranking ${occ.rank} (${rankLabel(state, occ.rank)}), score ${Number(occ.score).toFixed(2)}` : "";
    div.title = (occ.on ? "Redatto" : "Non redatto") + " · " + g.labelIt + rankTxt + " — clic per " + (occ.on ? "annullare" : "ripristinare");
    div.addEventListener("click", (e) => { e.stopPropagation(); toggle(occ); });
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

  function render() {
    state.pageRenders.forEach((pr) => (pr.overlay.innerHTML = ""));
    state.groups.forEach((g) => {
      if (!g.active) return;
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
  }

  return { mount };
}
