/* Caricamento del PDF: drag & drop, selezione file ed esempio. Un nuovo file
   azzera lo stato del documento precedente e avvia l'analisi. */

import { $ } from "../../shared/dom.js";

const SAMPLE_URL = "sample/documento_gara_fake.pdf";

export function createUpload({ state, analysis, notice }) {
  function resetDocument(file) {
    state.fileName = (file.name || "documento").replace(/\.pdf$/i, "");
    state.file = file;
    state.zoom = 1; state.currentPage = 0; state.deletedPages = new Set();
    state.docModel = null; state.docId = null; state.groups = []; state.pagesIndex = []; state.pageRenders = [];
    state.navIdx = -1; state.listFilter = "type"; state.scanned = false;
    state.analyzedModules = new Set();
  }

  function handleFile(file) {
    if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) { notice("File non valido", "Carica un file PDF."); return; }
    resetDocument(file);
    analysis.run();
  }

  async function loadSample() {
    try {
      const blob = await (await fetch(SAMPLE_URL)).blob();
      handleFile(new File([blob], "documento_gara_fake.pdf", { type: "application/pdf" }));
    } catch (err) { notice("Esempio non disponibile", "Impossibile caricare l'esempio: " + err.message); }
  }

  function mount() {
    const drop = $("#dropzone");
    const input = $("#file-input");
    $("#btn-pick").addEventListener("click", () => input.click());
    input.addEventListener("change", () => { if (input.files[0]) handleFile(input.files[0]); });
    ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("drag"); }));
    ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("drag"); }));
    drop.addEventListener("drop", (e) => { const f = e.dataTransfer.files[0]; if (f) handleFile(f); });
    $("#btn-sample").addEventListener("click", loadSample);
  }

  return { mount };
}
