/* Download del PDF protetto ed eliminazione dei dati dal server (GDPR).

   - «Scarica PDF protetto»: generato nel browser (flatten), include redazioni
     manuali e pagine eliminate;
   - «Scarica e rimuovi i dati»: come sopra, poi elimina subito i dati dal server;
   - redazione server (hard redaction): solo i rilevamenti IA, con gli stessi
     moduli/baseline/ranking dell'anteprima.
   In modalità veloce le pagine non analizzate richiedono una conferma. */

import { EV } from "../../core/store.js";
import { activeOccurrences, counts, excludedRanges, hasActiveManual } from "../../domain/redactions.js";
import { sevArray, viewParams } from "../../domain/selection.js";
import { $, saveBlob } from "../../shared/dom.js";

const DOWNLOAD_BUTTONS = ["#btn-download", "#btn-download-side", "#btn-download-remove", "#btn-download-remove-side"];

export function createExport({ state, bus, api, pdf, dialog, notice, toast }) {
  const outputName = () => state.fileName + "_protetto.pdf";

  function unanalyzedWarning() {
    const total = state.docModel ? state.docModel.pages.length : 0;
    const analyzed = state.analyzedPages || 0;
    if (state.scanned || analyzed >= total) return "";
    let kept = 0;
    for (let i = analyzed; i < total; i++) if (!state.deletedPages.has(i)) kept++;
    if (!kept) return "";
    return `Attenzione: sono state analizzate solo le prime ${analyzed} pagine su ${total}.\n` +
      `Le altre ${kept} entreranno nel PDF SENZA oscuramenti automatici.\n` +
      "Per analizzarle tutte disattiva «Veloce» e riesegui l'analisi.";
  }

  async function confirmUnanalyzedPages() {
    const partial = unanalyzedWarning();
    if (!partial) return true;
    return dialog({
      icon: "⚠", title: "Pagine non analizzate", text: partial,
      buttons: [{ label: "Annulla", value: false }, { label: "Scarica comunque", value: true, primary: true }],
    });
  }

  /* Esito finale dopo il download (non è una conferma).
     outcome: "kept" = dati ancora sul server · "removed" = dati eliminati ·
              "failed" = eliminazione non riuscita (detail = errore). */
  function showOutcome(outcome, detail) {
    const NO_PDF = "Il tuo PDF non viene mai conservato sul server.";
    const CONTINUE = "Puoi continuare le modifiche e scaricare di nuovo.";
    const copy = {
      kept: {
        icon: "✓", title: "PDF scaricato",
        text: [
          "File eliminati: nessun dato dell'analisi. " + NO_PDF,
          "Ancora presenti sul sistema: i dati dell'analisi (testo, entità e posizioni), cancellati automaticamente dopo pochi minuti dall'upload. Per cancellarli subito usa «Scarica e rimuovi i dati».",
          CONTINUE,
        ],
      },
      removed: {
        icon: "🔒", title: "PDF scaricato e dati rimossi",
        text: [
          "File eliminati: i dati dell'analisi (testo, entità e posizioni) sono stati cancellati dal server. " + NO_PDF,
          "Ancora presenti sul sistema: nessun dato di questo documento.",
          CONTINUE + " Le modifiche restano nel browser; per cambiare modalità o gravità, rianalizzare o usare la redazione server premi «Riesegui analisi» (il file viene ricaricato).",
        ],
      },
      failed: {
        icon: "⚠", title: "PDF scaricato, dati non rimossi",
        text: [
          "File eliminati: nessuno. La cancellazione dei dati dal server non è riuscita" + (detail ? " (" + detail + ")" : "") + ".",
          "Ancora presenti sul sistema: i dati dell'analisi, cancellati comunque automaticamente dopo pochi minuti dall'upload. Puoi riprovare con «Scarica e rimuovi i dati».",
          CONTINUE,
        ],
      },
    }[outcome];
    return dialog({ ...copy, buttons: [{ label: "Ho capito", value: true, primary: true }] });
  }

  async function removeServerData() {
    if (!state.docId) return { outcome: "removed" }; // già assente: nulla da cancellare
    try {
      await api.documents.deleteDocument(state.docId);
      state.docId = null; // da ora le modifiche usano solo il client
      return { outcome: "removed" };
    } catch (err) {
      return { outcome: "failed", detail: err.message };
    }
  }

  async function downloadFromServer() {
    if (!state.docId) { toast("Dati già rimossi dal server: premi «Riesegui analisi» per usare la redazione server."); return; }
    if (state.deletedPages.size || hasActiveManual(state)) {
      toast("Pagine eliminate e redazioni manuali non sono supportate dal server: usa «Scarica PDF protetto».");
      return;
    }
    if (!(await confirmUnanalyzedPages())) return;
    try {
      const blob = await api.documents.downloadPdf(state.docId, state.file, {
        mode: state.mode, severities: sevArray(state), excludedRanges: excludedRanges(state), ...viewParams(state),
      });
      saveBlob(blob, outputName());
    } catch (err) {
      notice("Generazione non riuscita", err.message);
      return;
    }
    state.docId = null; // il backend elimina i dati subito dopo la redazione
    showOutcome("removed");
  }

  async function downloadFromBrowser(removeData = false) {
    const occ = activeOccurrences(state);
    if (!occ.length) { toast("Nessuna redazione attiva."); return; }
    if (!(await confirmUnanalyzedPages())) return;
    const overlay = $("#gen-overlay");
    const bar = $("#gen-bar > span");
    const label = $("#gen-label");
    overlay.classList.remove("hidden"); bar.style.width = "0%";
    label.textContent = "Generazione del PDF protetto…";
    try {
      const blob = await pdf.generateProtectedPdf(state.docModel, occ, (done, total) => {
        bar.style.width = Math.round((done / total) * 100) + "%";
        label.textContent = `Impressione redazioni — pagina ${done} / ${total}`;
      }, { deletedPages: state.deletedPages, mode: state.mode });
      saveBlob(blob, outputName());
      label.textContent = "✓ PDF protetto generato.";
      // Eliminazione (se richiesta) mentre l'overlay mostra «generato», poi l'esito.
      const res = removeData ? await removeServerData() : { outcome: "kept" };
      setTimeout(() => { overlay.classList.add("hidden"); showOutcome(res.outcome, res.detail); }, 700);
    } catch (err) {
      label.textContent = "Errore: " + err.message;
      setTimeout(() => overlay.classList.add("hidden"), 2500);
    }
  }

  function updateButtons() {
    const none = counts(state).active === 0;
    DOWNLOAD_BUTTONS.forEach((sel) => ($(sel).disabled = none));
  }

  function mount() {
    $("#btn-download").addEventListener("click", () => downloadFromBrowser(false));
    $("#btn-download-side").addEventListener("click", () => downloadFromBrowser(false));
    $("#btn-download-remove").addEventListener("click", () => downloadFromBrowser(true));
    $("#btn-download-remove-side").addEventListener("click", () => downloadFromBrowser(true));
    $("#btn-restart").addEventListener("click", () => location.reload());
    const srv = $("#btn-download-server");
    if (srv) srv.addEventListener("click", downloadFromServer);
    bus.on(EV.REDACTIONS, updateButtons);
  }

  return { mount };
}
