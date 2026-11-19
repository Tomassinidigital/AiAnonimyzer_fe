/* Download del PDF sicuro ed eliminazione dei dati dal server (GDPR).

   Un solo pulsante, «Scarica PDF», apre la scelta:
   - PDF sicuro: generato nel browser (flatten, ogni pagina è un'immagine), include
     redazioni manuali e pagine eliminate;
   - PDF ricercabile (redazione sul server, hard redaction): include gli stessi
     rilevamenti dell'anteprima (moduli/baseline/ranking), le frasi a mano (come
     intervalli di caratteri) e le pagine eliminate; il testo non oscurato resta
     selezionabile. Le frasi a mano su pagine non analizzate dal server (modalità
     veloce) non si possono includere: si chiede conferma.
   In entrambi i casi l'utente sceglie se cancellare subito i dati dal server
   (altrimenti scadono da soli dopo CACHE_TTL dall'ultima azione).
   In modalità veloce le pagine non analizzate richiedono una conferma. */

import { config } from "../../core/config.js";
import { EV } from "../../core/store.js";
import { activeOccurrences, counts, excludedRanges, manualRanges } from "../../domain/redactions.js";
import { sevArray, viewParams } from "../../domain/selection.js";
import { $, fmtSize, saveBlob } from "../../shared/dom.js";

// Pulsanti di download nella barra in alto (quelli in fondo alla lista erano doppioni).
const DOWNLOAD_BUTTONS = ["#btn-download"];

export function createExport({ state, bus, api, pdf, dialog, notice, toast, consent }) {
  // Nome del file scaricato: «_sicuro» o «_ricercabile» secondo il tipo di PDF.
  const outputName = (kind = "sicuro") => `${state.fileName}_${kind}.pdf`;

  function unanalyzedWarning() {
    const total = state.docModel ? state.docModel.pages.length : 0;
    const analyzed = state.analyzedPages || 0;
    if (state.scanned || analyzed >= total) return "";
    let kept = 0;
    for (let i = analyzed; i < total; i++) if (!state.deletedPages.has(i)) kept++;
    if (!kept) return "";
    return `Attenzione: sono state analizzate soltanto le prime ${analyzed} pagine su ${total}.\n` +
      `Le restanti ${kept} saranno incluse nel PDF PRIVE di oscuramenti automatici.\n` +
      "Per analizzarle integralmente, disattiva «Veloce» e riesegui l'analisi.";
  }

  // Il server oscura le frasi a mano solo nel testo che ha analizzato: quelle trovate dal
  // browser su altre pagine (modalità veloce) non entrerebbero nel PDF ricercabile.
  async function confirmSkippedManual(n) {
    return dialog({
      icon: "⚠", title: "Frasi a mano non incluse",
      text: [
        `${n} occorrenz${n === 1 ? "a" : "e"} di frasi oscurate manualmente si trova${n === 1 ? "" : "no"} in pagine non analizzate dal server (modalità veloce).`,
        "Nel PDF ricercabile resterebbero leggibili. Per includerle, scegli il PDF sicuro oppure disattiva «Veloce» e riesegui l'analisi.",
      ],
      buttons: [{ label: "Annulla", value: false }, { label: "Scarica comunque", value: true, primary: true }],
    });
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
  // `file` = { blob, name } appena salvato: abilita «Scarica di nuovo».
  async function showOutcome(outcome, detail, file) {
    const NO_PDF = "Il tuo PDF non viene mai conservato sul server.";
    const CONTINUE = "Puoi proseguire con le modifiche e scaricare nuovamente il documento.";
    // Durata reale dal server (CACHE_TTL), espressa in minuti.
    const minutes = Math.max(1, Math.round((state.cfg.doc_ttl || 300) / 60));
    const AUTO = `sono eliminati automaticamente entro al massimo ${minutes} minut${minutes === 1 ? "o" : "i"} dall'ultima azione sul documento`;
    const copy = {
      kept: {
        icon: "✓", title: "PDF scaricato",
        text: [
          NO_PDF,
          "Per eliminare subito dal server i dati dell'analisi (testo, entità e posizioni), " +
            `scarica nuovamente il documento selezionando «Cancella subito i dati dal server»; in caso contrario, ${AUTO}.`,
          CONTINUE,
        ],
      },
      removed: {
        icon: "🔒", title: "PDF scaricato e dati rimossi",
        text: [
          "Dati eliminati: testo, entità e posizioni dell'analisi sono stati cancellati dal server. " + NO_PDF,
          "Dati ancora presenti: nessuno, per questo documento.",
          CONTINUE + " Le modifiche restano nel browser; per cambiare modalità o gravità, ripetere l'analisi o scaricare il PDF ricercabile, premi «Riesegui analisi» (il file sarà trasmesso nuovamente).",
        ],
      },
      failed: {
        icon: "⚠", title: "PDF scaricato, dati non rimossi",
        text: [
          "Dati eliminati: nessuno. La cancellazione dal server non è andata a buon fine" + (detail ? " (" + detail + ")" : "") + ".",
          `Dati ancora presenti: quelli dell'analisi, che ${AUTO}. Puoi riprovare selezionando «Cancella subito i dati dal server».`,
          CONTINUE,
        ],
      },
    }[outcome];
    if (!file) return dialog({ ...copy, buttons: [{ label: "Chiudi", value: true, primary: true }] });
    // Il file è appena stato salvato, ma un browser può bloccare lo scarico partito
    // dopo un'attesa: «Scarica di nuovo» è un clic diretto, sempre accettato.
    const again = await dialog({
      ...copy,
      text: [...copy.text, "Se il download non si è avviato, utilizza «Scarica di nuovo»."],
      buttons: [
        { label: "Chiudi", value: false },
        { label: "Scarica di nuovo", value: true },
      ],
    });
    if (again) saveBlob(file.blob, file.name);
    return again;
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

  /* Il server non ha più i dati del documento (scaduti dopo CACHE_TTL di
     inattività, o server riavviato): niente PDF ricercabile senza nuova analisi.
     Il documento è segnato come rimosso (barra «Riesegui analisi»). */
  function documentGone() {
    state.docId = null;
    state.expiry = null;
    state.stale = true;
    bus.emit(EV.STALE);
    notice("Dati non più disponibili sul server", [
      "Il PDF ricercabile è generato sul server, ma i dati di questo documento non sono più disponibili: " +
        "sono scaduti per inattività oppure il server è stato riavviato.",
      "Puoi scaricare subito il PDF sicuro, generato nel tuo browser, oppure premere " +
        "«Riesegui analisi» per trasmettere nuovamente il documento e ottenere il PDF ricercabile.",
    ]);
  }

  // `removeData`: scelta dell'utente nella finestra (cancellare subito o no).
  async function downloadFromServer(removeData) {
    if (!state.docId) { toast("I dati sono già stati rimossi dal server: premi «Riesegui analisi» per ottenere il PDF ricercabile."); return; }
    const manual = manualRanges(state);
    if (manual.skipped && !(await confirmSkippedManual(manual.skipped))) return;
    if (!(await confirmUnanalyzedPages())) return;
    // Il PDF ricercabile si genera sul server: il file viene inviato di nuovo.
    const termsToken = state.isSample ? null : await consent.ensure({
      showFile: true,
      lead: ["Il PDF ricercabile viene generato sul server, che a tal fine riceve nuovamente il documento e lo distrugge al termine dell'elaborazione."],
      confirmLabel: "Accetto e invia il file",
    });
    if (!state.isSample && !termsToken) return;
    let file;
    try {
      file = { name: outputName("ricercabile") };
      file.blob = await api.documents.downloadPdf(state.docId, state.file, {
        mode: state.mode, severities: sevArray(state), excludedRanges: excludedRanges(state),
        manualRanges: manual.ranges, deletedPages: Array.from(state.deletedPages).sort((a, b) => a - b),
        purge: removeData, termsToken, ...viewParams(state),
      });
      saveBlob(file.blob, file.name);
    } catch (err) {
      if (err.status === 404) { documentGone(); return; }
      notice("Generazione non riuscita", err.message);
      return;
    }
    if (!removeData) { showOutcome("kept", null, file); return; }
    state.docId = null; // il backend ha eliminato i dati subito dopo la redazione
    showOutcome("removed", null, file);
  }

  async function downloadFromBrowser(removeData = false) {
    const occ = activeOccurrences(state);
    if (!occ.length) { toast("Nessun oscuramento attivo."); return; }
    if (!(await confirmUnanalyzedPages())) return;
    const overlay = $("#gen-overlay");
    const bar = $("#gen-bar > span");
    const label = $("#gen-label");
    overlay.classList.remove("hidden"); bar.style.width = "0%";
    label.textContent = "Generazione del PDF sicuro…";
    try {
      const blob = await pdf.generateProtectedPdf(state.docModel, occ, (done, total) => {
        bar.style.width = Math.round((done / total) * 100) + "%";
        label.textContent = `Applicazione degli oscuramenti — pagina ${done} / ${total}`;
      }, { deletedPages: state.deletedPages, mode: state.mode });
      const file = { blob, name: outputName("sicuro") };
      saveBlob(file.blob, file.name);
      label.textContent = "✓ PDF sicuro generato.";
      // Eliminazione (se richiesta) mentre l'overlay mostra «generato», poi l'esito.
      const res = removeData ? await removeServerData() : { outcome: "kept" };
      setTimeout(() => { overlay.classList.add("hidden"); showOutcome(res.outcome, res.detail, file); }, 700);
    } catch (err) {
      label.textContent = "Errore: " + err.message;
      setTimeout(() => overlay.classList.add("hidden"), 2500);
    }
  }

  function updateButtons() {
    const none = counts(state).active === 0;
    DOWNLOAD_BUTTONS.forEach((sel) => ($(sel).disabled = none));
  }

  /* Scelta del PDF (aperta da TUTTI i pulsanti di download): due schede, PDF
     sicuro e ricercabile, preselezionate dal pulsante usato; casella «cancella
     subito i dati» (per il ricercabile è sempre attiva: il server li cancella).
     `preset` = { kind: "protected"|"editable", remove: bool }. Risolve con la
     scelta, o null se si annulla. */
  function chooseDownload(preset) {
    return new Promise((resolve) => {
      const modal = $("#download-modal"), remove = $("#dl-remove"), hint = $("#dl-remove-hint");
      const radios = [...modal.querySelectorAll("input[name=dl-kind]")];
      const minutes = Math.max(1, Math.round((state.cfg.doc_ttl || 300) / 60));
      // Cancellazione dei dati: sempre a scelta dell'utente, per entrambi i PDF.
      remove.disabled = false;
      remove.checked = !!preset.remove;
      hint.textContent = `In caso contrario, sono eliminati automaticamente entro ${minutes} minut${minutes === 1 ? "o" : "i"} dall'ultima azione sul documento.`;
      radios.forEach((r) => { r.checked = r.value === preset.kind; r.onchange = null; });
      const close = (value) => {
        modal.classList.add("hidden");
        document.removeEventListener("keydown", onKey, true);
        resolve(value);
      };
      const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); close(null); } };
      $("#dl-cancel").onclick = () => close(null);
      $("#dl-confirm").onclick = () => close({
        kind: radios.find((r) => r.checked)?.value || preset.kind, remove: remove.checked,
      });
      document.addEventListener("keydown", onKey, true);
      modal.classList.remove("hidden");
      $("#dl-confirm").focus();
    });
  }

  async function startDownload(preset) {
    const choice = await chooseDownload(preset);
    if (!choice) return;
    if (choice.kind === "editable") return downloadFromServer(choice.remove);
    return downloadFromBrowser(choice.remove);
  }

  /* Debug: scarica il JSON per l'analizzatore dei dati. Contiene il testo del documento. */
  let extracting = false;
  async function extractForAnalysis() {
    if (extracting) return;
    if (!state.docId || !state.debug) { toast("Estrazione disponibile solo con il debug attivo e un documento sul server."); return; }
    const btn = $("#tb-an-export");
    extracting = true; btn.disabled = true;
    toast("Estrazione in corso: rigira i modelli a soglia bassa, può richiedere un minuto…");
    try {
      const blob = await api.documents.analysisExport(state.docId);
      saveBlob(blob, `${state.fileName}_analisi.json`);
      toast("File per l'analizzatore scaricato (contiene il testo del documento).");
    } catch (err) {
      toast(err.status === 404 ? "Documento non più sul server: ricarica il file." : `Estrazione non riuscita: ${err.message}`);
    } finally { extracting = false; btn.disabled = false; }
  }

  /* Apre l'analizzatore (analizzatore/, servito dal backend su /analizzatore/) in una nuova scheda. Con un documento sul
     server la pagina scarica da sola i dati di questa sessione (`#doc=<id>`); altrimenti si apre vuota, con le tre scelte
     (sessione corrente, JSON, demo). */
  function openAnalyzer() {
    const a = document.createElement("a");
    a.href = `${config.apiBase}/analizzatore/${state.docId ? `#doc=${state.docId}` : ""}`;
    a.target = "_blank"; a.rel = "noopener"; a.style.display = "none";
    document.body.appendChild(a); a.click(); a.remove();
  }

  function mount() {
    $("#tb-an-open").addEventListener("click", openAnalyzer);
    $("#tb-an-export").addEventListener("click", extractForAnalysis);
    // Un solo pulsante: apre la scelta del PDF (sicuro preselezionato) e della
    // cancellazione dei dati (non spuntata: scelta dell'utente).
    $("#btn-download").addEventListener("click", () => startDownload({ kind: "protected", remove: false }));
    $("#btn-restart").addEventListener("click", () => location.reload());
    bus.on(EV.REDACTIONS, updateButtons);
  }

  return { mount };
}
