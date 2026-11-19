/* Analisi del documento sul backend.

   - run({termsToken}): upload + analisi (job) + caricamento del PDF nel browser,
                     poi apertura dell'editor (evento DOCUMENT_READY);
   - refresh():      cambio "live" (moduli, baseline, ranking, gravità, modalità):
                     nessuna nuova analisi, si ricarica solo l'overlay;
   - toggleModule(): attiva/disattiva un modulo; uno non ancora analizzato viene
                     eseguito dal server da solo (GDPR non rigira);
   - markStale():    le opzioni di analisi (verifica LLM, veloce) sono cambiate:
                     serve «Riesegui analisi». */

import { EV } from "../../core/store.js";
import { groupsFromOverlay } from "../../domain/redactions.js";
import { baseModuleKey, sevArray, viewParams } from "../../domain/selection.js";
import { $ } from "../../shared/dom.js";

/* L'analizzatore (stessa origine, /analizzatore/) legge da qui l'id dell'ultimo documento per la «Sessione corrente».
   Solo l'id opaco e l'ora: il documento resta sul server per pochi minuti (CACHE_TTL). */
function rememberDoc(docId) {
  try { localStorage.setItem("aia.lastDoc", JSON.stringify({ id: docId, at: Date.now() })); } catch (_e) { /* storage bloccato */ }
}

const REMOVED_MSG = "I dati sono stati rimossi dal server: premi «Riesegui analisi» per applicare la modifica.";

export function createAnalysis({ state, bus, api, pdf, shell, notice, toast, consent }) {
  const toClientBox = (b) => pdf.serverBoxToClient(state.docModel, state.pagesIndex, b);

  // Rilevamenti IA dall'overlay del backend (le redazioni manuali restano).
  async function loadDetections() {
    const overlay = await api.documents.getOverlay(state.docId, {
      mode: state.mode, severities: sevArray(state), debug: state.debug, ...viewParams(state),
    });
    // Ogni richiesta rinnova la scadenza sul server: l'overlay dice quanto manca.
    if (overlay.expires_in != null) bus.emit(EV.EXPIRY, { expiresIn: overlay.expires_in, ttl: overlay.ttl });
    const res = groupsFromOverlay(state, overlay, toClientBox);
    state.scanned = res.scanned;
    if (res.scanned) state.scannedMsg = res.scannedMsg;
    else state.analyzedPages = res.analyzedPages; // la modalità veloce analizza solo le prime
    state.groups = res.groups;
    state.flags = res.flags;
  }

  function setStale(on) { state.stale = on; bus.emit(EV.STALE); }

  // `termsToken`: token di accettazione dei Termini (assente solo per gli esempi).
  async function run({ termsToken } = {}) {
    shell.showView("processing");
    const bar = $("#proc-bar > span");
    const label = $("#proc-label");
    setStale(false);
    try {
      label.textContent = "Caricamento e analisi sul server…";
      // I moduli spuntati entrano già nella prima analisi; quelli spuntati dopo
      // si aggiungono senza rieseguire il resto (toggleModule).
      // Il base (GDPR) gira sempre: si invia solo ciò che si aggiunge.
      const base = baseModuleKey(state);
      const modules = Array.from(state.activeModules).filter((k) => k !== base);
      state.docId = await api.analysis.analyze(state.file, { ...state.opts, modules, termsToken }, (frac, msg) => {
        bar.style.width = Math.max(8, Math.round(frac * 100)) + "%";
        if (msg) label.textContent = msg;
      });
      state.analyzedModules = new Set(base ? [base, ...modules] : modules);
      rememberDoc(state.docId);
      setBackend(true);
    } catch (err) {
      if (err.status === 403) { // Termini non accettati o non aggiornati: il backend c'è
        await notice("Termini d'uso", err.message);
        shell.showView(state.docModel ? "editor" : "upload");
        return;
      }
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
    label.textContent = "Completato.";
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

  /* `module` = { key, label }; `input` = la casella; `onBusy(msg, frac)`
     mostra l'avanzamento (frac in [0,1]; stringa vuota = fine). Vale anche per
     il base (GDPR): è sempre analizzato, quindi si mostra/nasconde subito. */
  // Etichette dei moduli già analizzati (esclusi `skipKey`), per la finestra di accettazione.
  const analyzedLabels = (skipKey) => {
    const labels = (state.modules || []).filter((m) => m.key !== skipKey && state.analyzedModules.has(m.key)).map((m) => m.label);
    return labels.length ? labels.join(", ") : "nessuno";
  };

  async function toggleModule(module, input, onBusy) {
    if (!input.checked) { state.activeModules.delete(module.key); refresh(); return; }
    state.activeModules.add(module.key);
    if (!state.docModel) return; // nessun documento: il modulo entrerà nella prima analisi
    if (!state.docId) { setStale(true); toast(REMOVED_MSG); return; }
    if (!state.analyzedModules.has(module.key)) {
      // Il server rielabora i dati del documento: serve l'accettazione dei Termini.
      const termsToken = state.isSample ? null : await consent.ensure({
        showFile: true,
        fileNote: "Il documento risiede unicamente nella memoria di questo browser e non sarà trasmesso nuovamente: " +
          "il server opererà soltanto sui dati dell'analisi già eseguita.",
        lead: [
          `L'analisi già eseguita sarà estesa con il modulo ${module.label}:\n` +
          `• Modulo da aggiungere: ${module.label}\n` +
          `• Moduli già analizzati: ${analyzedLabels(module.key)}`,
          "I risultati esistenti restano invariati: viene elaborato esclusivamente il nuovo modulo.",
        ],
        confirmLabel: "Accetto e aggiungi il modulo",
      });
      if (!state.isSample && !termsToken) { state.activeModules.delete(module.key); input.checked = false; return; }
      input.disabled = true;
      const busyMsg = `Analisi del modulo ${module.label} in corso…`;
      onBusy(busyMsg, 0);
      try {
        await api.analysis.addModules(state.docId, [module.key], (frac, msg) => onBusy(msg || busyMsg, frac), { termsToken });
        state.analyzedModules.add(module.key);
      } catch (err) {
        state.activeModules.delete(module.key); input.checked = false;
        toast(`Impossibile applicare il modulo ${module.label}: ` + err.message);
        return;
      } finally {
        input.disabled = false; onBusy("", 1);
      }
    }
    refresh();
  }

  return { run, refresh, toggleModule, markStale: () => setStale(true) };
}
