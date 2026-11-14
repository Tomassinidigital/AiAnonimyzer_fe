/* Analisi del documento sul backend.

   - run():          upload + analisi (job) + caricamento del PDF nel browser,
                     poi apertura dell'editor (evento DOCUMENT_READY);
   - refresh():      cambio "live" (moduli, baseline, ranking, gravità, modalità):
                     nessuna nuova analisi, si ricarica solo l'overlay;
   - toggleModule(): attiva/disattiva un modulo; uno non ancora analizzato viene
                     eseguito dal server da solo (GDPR non rigira);
   - markStale():    le opzioni di analisi (verifica LLM, veloce) sono cambiate:
                     serve «Riesegui analisi». */

import { EV } from "../../core/store.js";
import { groupsFromOverlay } from "../../domain/redactions.js";
import { sevArray, viewParams } from "../../domain/selection.js";
import { $ } from "../../shared/dom.js";

const REMOVED_MSG = "Dati rimossi dal server: premi «Riesegui analisi» per applicare la modifica.";

export function createAnalysis({ state, bus, api, pdf, shell, notice, toast }) {
  const toClientBox = (b) => pdf.serverBoxToClient(state.docModel, state.pagesIndex, b);

  // Rilevamenti IA dall'overlay del backend (le redazioni manuali restano).
  async function loadDetections() {
    const overlay = await api.documents.getOverlay(state.docId, {
      mode: state.mode, severities: sevArray(state), ...viewParams(state),
    });
    const res = groupsFromOverlay(state, overlay, toClientBox);
    state.scanned = res.scanned;
    if (res.scanned) state.scannedMsg = res.scannedMsg;
    else state.analyzedPages = res.analyzedPages; // la modalità veloce analizza solo le prime
    state.groups = res.groups;
  }

  function setStale(on) { state.stale = on; bus.emit(EV.STALE); }

  async function run() {
    shell.showView("processing");
    const bar = $("#proc-bar > span");
    const label = $("#proc-label");
    setStale(false);
    try {
      label.textContent = "Caricamento e analisi lato server…";
      // I moduli spuntati entrano già nella prima analisi; quelli spuntati dopo
      // si aggiungono senza rieseguire il resto (toggleModule).
      const modules = Array.from(state.activeModules);
      state.docId = await api.analysis.analyze(state.file, { ...state.opts, modules }, (frac, msg) => {
        bar.style.width = Math.max(8, Math.round(frac * 100)) + "%";
        if (msg) label.textContent = msg;
      });
      state.analyzedModules = new Set(modules);
      setBackend(true);
    } catch (err) {
      setBackend(false);
      await notice("Backend non raggiungibile", "Impossibile analizzare il documento.\n\n" + err.message);
      shell.showView(state.docModel ? "editor" : "upload");
      return;
    }
    try {
      // GDPR: il PDF resta nel browser, il server non lo conserva.
      state.docModel = await pdf.load(await state.file.arrayBuffer());
      state.pagesIndex = state.docModel.pages.map((p) => p.index);
      await loadDetections();
    } catch (err) {
      await notice("Documento non elaborabile", "Impossibile elaborare il documento.\n\n" + err.message);
      shell.showView(state.docModel ? "editor" : "upload");
      return;
    }
    bar.style.width = "100%";
    label.textContent = "Fatto.";
    setTimeout(openEditor, 250);
  }

  function openEditor() {
    shell.showView("editor");
    bus.emit(EV.DOCUMENT_READY);
    bus.emit(EV.REDACTIONS, { record: false, reset: true });
    bus.emit(EV.STALE);
  }

  function setBackend(up) { state.backendUp = up; bus.emit(EV.BACKEND); }

  async function refresh() {
    if (!state.docModel) return;
    if (!state.docId) { setStale(true); toast(REMOVED_MSG); return; }
    try { await loadDetections(); }
    catch (err) { toast("Aggiornamento non riuscito: " + err.message); return; }
    // Il set IA è stato ri-derivato: nuovo punto di partenza per undo/redo.
    bus.emit(EV.REDACTIONS, { record: false, reset: true });
  }

  /* `module` = { key, label }; `input` = la casella; `onBusy(msg)` mostra
     l'avanzamento (stringa vuota = fine). */
  async function toggleModule(module, input, onBusy) {
    if (!input.checked) { state.activeModules.delete(module.key); refresh(); return; }
    state.activeModules.add(module.key);
    if (!state.docModel) return; // nessun documento: il modulo entrerà nella prima analisi
    if (!state.docId) { setStale(true); toast(REMOVED_MSG); return; }
    if (!state.analyzedModules.has(module.key)) {
      input.disabled = true;
      onBusy(`Analisi del modulo ${module.label} in corso…`);
      try {
        await api.analysis.addModules(state.docId, [module.key], (_frac, msg) => { if (msg) onBusy(msg); });
        state.analyzedModules.add(module.key);
      } catch (err) {
        state.activeModules.delete(module.key); input.checked = false;
        toast(`Modulo ${module.label} non applicato: ` + err.message);
        return;
      } finally {
        input.disabled = false; onBusy("");
      }
    }
    refresh();
  }

  return { run, refresh, toggleModule, markStale: () => setStale(true) };
}
