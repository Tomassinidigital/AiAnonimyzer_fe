/* Redazioni manuali: una frase scritta nel campo «Oscura una frase» o
   selezionata col mouse sul documento viene oscurata in TUTTE le sue occorrenze.

   Occorrenze: geometria del BACKEND (metrica reale del font) per le pagine che il
   server ha analizzato; ricerca nel browser per le altre (modalità veloce) o se
   il documento non è più sul server. */

import { EV } from "../../core/store.js";
import { addManualPhrase } from "../../domain/redactions.js";
import { $, truncate } from "../../shared/dom.js";

export function createManualRedaction({ state, bus, api, pdf, toast }) {
  async function findOccurrences(val) {
    let covered = 0, occ = [];
    if (state.docId) {
      try {
        const res = await api.documents.searchPhrase(state.docId, val);
        covered = res.covered || 0;
        occ = res.matches
          .filter((m) => state.docModel.pages[m.page])
          .map((m) => ({
            page: m.page,
            boxes: m.boxes.map((b) => pdf.serverBoxToClient(state.docModel, state.pagesIndex, { ...b, page: m.page })),
            snippet: m.text,
          }));
      } catch (_e) { covered = 0; occ = []; }
    }
    return occ.concat(pdf.search(state.pagesIndex, val).filter((o) => o.page >= covered));
  }

  async function addPhrase(phrase) {
    const val = String(phrase || "").trim();
    if (val.length < 2) { toast("Digita almeno 2 caratteri."); return; }
    if (!state.pagesIndex.length) { toast("Carica prima un documento."); return; }
    const occ = await findOccurrences(val);
    if (!occ.length) { toast(`Nessuna occorrenza di «${truncate(val, 30)}» nel documento.`); return; }
    addManualPhrase(state, val, occ);
    bus.emit(EV.REDACTIONS, { record: true });
    toast(`«${truncate(val, 24)}» → ${occ.length} occorrenz${occ.length === 1 ? "a" : "e"}.`);
  }

  // Pulsante flottante sopra il testo selezionato nel documento.
  function bindSelection() {
    const viewer = $("#viewer");
    const fab = $("#selection-fab");
    let lastText = "";
    viewer.addEventListener("mouseup", () => {
      setTimeout(() => {
        const sel = window.getSelection();
        const txt = sel && sel.toString().trim();
        if (!txt || txt.length < 2 || !viewer.contains(sel.anchorNode)) { fab.classList.add("hidden"); return; }
        lastText = txt;
        const range = sel.getRangeAt(0).getBoundingClientRect();
        const host = viewer.getBoundingClientRect();
        fab.style.left = (range.left - host.left + viewer.scrollLeft + range.width / 2) + "px";
        fab.style.top = (range.top - host.top + viewer.scrollTop - 44) + "px";
        fab.querySelector(".fab-text").textContent = truncate(txt, 22);
        fab.classList.remove("hidden");
      }, 10);
    });
    fab.addEventListener("mousedown", (e) => e.preventDefault());
    fab.addEventListener("click", () => { addPhrase(lastText); fab.classList.add("hidden"); window.getSelection().removeAllRanges(); });
    document.addEventListener("scroll", () => fab.classList.add("hidden"), true);
  }

  function mount() {
    $("#search-form").addEventListener("submit", (e) => {
      e.preventDefault();
      addPhrase($("#search-input").value);
      $("#search-input").value = "";
    });
    bindSelection();
  }

  return { mount };
}
