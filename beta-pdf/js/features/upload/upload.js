/* Caricamento del PDF: drag & drop, selezione file ed esempio. Un nuovo file
   azzera lo stato del documento precedente e avvia l'analisi. */

import { SAMPLES_MANIFEST } from "../../core/config.js";
import { $, escapeHtml, fmtSize } from "../../shared/dom.js";

const OPENED_KEY = "beta.samples.opened"; // esempi già aperti in questo browser

// Memoria per-browser (comodità): se lo storage non è disponibile gli esempi
// restano tutti selezionabili, solo senza il segno «già aperto».
function readOpened() {
  try { return new Set(JSON.parse(localStorage.getItem(OPENED_KEY) || "[]")); } catch (_e) { return new Set(); }
}
function markOpened(file) {
  try {
    const opened = readOpened(); opened.add(file);
    localStorage.setItem(OPENED_KEY, JSON.stringify([...opened]));
  } catch (_e) { /* storage bloccato */ }
}

export function createUpload({ state, analysis, notice, consent }) {
  function resetDocument(file, sample = false) {
    state.fileName = (file.name || "documento").replace(/\.pdf$/i, "");
    state.file = file;
    state.isSample = sample;
    state.zoom = 1; state.currentPage = 0; state.deletedPages = new Set();
    state.docModel = null; state.docId = null; state.groups = []; state.pagesIndex = []; state.pageRenders = [];
    state.navIdx = -1; state.listFilter = "type"; state.scanned = false;
    state.analyzedModules = new Set();
  }

  // Testo del contesto nella finestra di accettazione.
  const sendLead = (file) => [`Il file «${file.name || "documento.pdf"}» (${fmtSize(file.size)}) sarà trasmesso al server, tramite connessione cifrata, al solo fine dell'analisi.`];

  // Ogni file inviato richiede l'accettazione dei Termini (anche se trascinato): senza,
  // il server rifiuta la richiesta. Fanno eccezione i documenti d'esempio (dati inventati).
  // Il documento precedente resta com'è finché l'utente non accetta.
  async function handleFile(file, { sample = false } = {}) {
    if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) { notice("File non valido", "Seleziona un file in formato PDF."); return; }
    const termsToken = sample ? null : await consent.ensure({ lead: sendLead(file), confirmLabel: "Accetto e invia il file" });
    if (!sample && !termsToken) return;
    resetDocument(file, sample);
    analysis.run({ termsToken });
  }

  let manifest = null;
  async function samples() {
    if (!manifest) {
      const res = await fetch(SAMPLES_MANIFEST);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      manifest = await res.json();
    }
    return manifest;
  }

  /* Finestra di scelta: in cima gli esempi semplici (1 pagina), in fondo un
     riquadro chiuso «Esempi complessi» con gli altri; in entrambi raggruppati per
     categoria (Gare, GDPR, Sanitario…, nell'ordine del manifesto). Un riquadro per
     esempio con titolo ed ente (dal contenuto del PDF), pagine e segno «già
     aperto». Risolve con il file scelto, o null se si annulla. */
  function chooseSample(list) {
    return new Promise((resolve) => {
      const modal = $("#sample-modal"), wrap = $("#sample-list");
      const opened = readOpened();
      wrap.innerHTML = "";
      const close = (file) => {
        modal.classList.add("hidden");
        document.removeEventListener("keydown", onKey, true);
        resolve(file);
      };
      const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); close(null); } };
      // Senza `level` (manifesti vecchi) decide il numero di pagine.
      const isSimple = (s) => (s.level ? s.level === "semplice" : s.pages === 1);
      const simple = list.filter(isSimple), complex = list.filter((s) => !isSimple(s));
      addGroups(wrap, simple, opened, close);
      if (complex.length) {
        const more = document.createElement("details");
        more.className = "sample-more";
        more.innerHTML = `<summary>Esempi complessi <span>${complex.length}</span>
          <small>documenti di più pagine</small></summary>`;
        const body = document.createElement("div");
        body.className = "sample-more-body";
        addGroups(body, complex, opened, close);
        more.appendChild(body);
        wrap.appendChild(more);
      }
      $("#sample-cancel").onclick = () => close(null);
      document.addEventListener("keydown", onKey, true);
      modal.classList.remove("hidden");
      wrap.querySelector(".sample-card")?.focus();
    });
  }

  // Esempi raggruppati per categoria, ognuno sotto la sua intestazione.
  function addGroups(target, list, opened, close) {
    const groups = new Map();
    list.forEach((s) => {
      const cat = s.category || "Altri";
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat).push(s);
    });
    groups.forEach((items, cat) => {
      const head = document.createElement("h3");
      head.className = "sample-cat";
      head.innerHTML = `${escapeHtml(cat)} <span>${items.length}</span>`;
      target.appendChild(head);
      items.forEach((s) => target.appendChild(card(s, opened, close)));
    });
  }

  // Riquadro di un esempio: ente, titolo, pagine e segno «già aperto».
  function card(s, opened, close) {
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "sample-card";
    btn.dataset.file = s.file; btn.dataset.category = s.category || "";
    btn.innerHTML = `
      <span class="sample-issuer">${escapeHtml(s.issuer || "")}</span>
      <span class="sample-name">${escapeHtml(s.title)}</span>
      <span class="sample-meta">${s.pages} ${s.pages === 1 ? "pagina" : "pagine"}${opened.has(s.file) ? ` · <b>già aperto</b>` : ""}</span>`;
    btn.addEventListener("click", () => close(s.file));
    return btn;
  }

  /* «Prova con un esempio»: `?sample=<file>` lo fissa (test, link condivisi);
     altrimenti l'utente sceglie dall'elenco. */
  async function loadSample() {
    try {
      const list = await samples();
      const forced = new URLSearchParams(location.search).get("sample");
      const name = list.some((s) => s.file === forced) ? forced : await chooseSample(list);
      if (!name) return;
      const res = await fetch("sample/" + name);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      markOpened(name);
      handleFile(new File([await res.blob()], name, { type: "application/pdf" }), { sample: true });
    } catch (err) { notice("Esempio non disponibile", "Impossibile caricare l'esempio: " + err.message); }
  }

  function mount() {
    const drop = $("#dropzone");
    const input = $("#file-input");
    // «Carica un PDF»: prima la finestra con le informazioni e l'accettazione, poi la scelta del file.
    $("#btn-pick").addEventListener("click", async () => {
      const ok = await consent.ask({
        lead: ["Al passo successivo sceglierai il PDF da trasmettere al server per l'analisi."],
        confirmLabel: "Accetto e scegli il file",
      });
      if (ok) input.click();
    });
    input.addEventListener("cancel", () => consent.reset()); // scelta del file annullata
    // Solo gesti dell'utente: un file «iniettato» da script (evento non attendibile) viene ignorato.
    input.addEventListener("change", (e) => {
      if (!e.isTrusted) { input.value = ""; return; }
      const f = input.files[0];
      input.value = ""; // permette di scegliere di nuovo lo stesso file
      if (f) handleFile(f);
    });
    ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("drag"); }));
    ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("drag"); }));
    drop.addEventListener("drop", (e) => { if (!e.isTrusted) return; const f = e.dataTransfer.files[0]; if (f) handleFile(f); });
    $("#btn-sample").addEventListener("click", loadSample);
  }

  return { mount };
}
