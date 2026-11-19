/* Accettazione dei Termini prima di OGNI invio o rielaborazione dei dati.

   Finestra con le informazioni sulla gestione del file e due spunte obbligatorie
   (mai preselezionate, azzerate a ogni apertura): 1) accettazione generale di
   Termini e Informativa privacy; 2) approvazione specifica delle clausole
   (artt. 1341-1342 c.c.), riportate per intero. Non si memorizza nulla nel browser.

   All'accettazione il server emette un TOKEN firmato, a scadenza e monouso (api.terms.accept):
   è l'unica prova valida, ogni invio ne presenta uno e senza il server risponde 403.
   - ask(opts):    apre la finestra; ritorna il token (null se si annulla). Se non viene
                   usato subito (es. «Carica un PDF» → scelta del file) resta valido per
                   UNA sola operazione successiva.
   - ensure(opts): ritorna quel token se c'è, altrimenti apre la finestra.
   `opts` = { lead: [paragrafi del contesto], confirmLabel, showFile, fileNote }.
   `showFile` mostra in evidenza il file caricato in precedenza, ancora nella memoria del
   browser (nome e dimensione; il percorso reale non è esposto dal browser). */

import { TERMS } from "../../core/config.js";
import { $, fmtSize } from "../../shared/dom.js";

const VALID_MS = 120000; // un'accettazione non usata decade dopo 2 minuti

export function createConsent({ state, api }) {
  let armed = null; // { token, until }
  const consume = () => { const a = armed; armed = null; return a && Date.now() < a.until ? a.token : null; };

  const FILE_NOTE = "Il documento risiede unicamente nella memoria di questo browser: il server non ne conserva copia.";

  // Box del file in memoria: nascosto se non richiesto o se il file non c'è più.
  function fillFileBox(show, note) {
    const box = $("#consent-file"), f = state.file;
    const visible = !!(show && f);
    box.classList.toggle("hidden", !visible);
    if (!visible) return;
    $("#consent-file-name").textContent = "«" + (f.name || "documento.pdf") + "»";
    $("#consent-file-size").textContent = "(" + fmtSize(f.size) + ")";
    $("#consent-file-note").textContent = note || FILE_NOTE;
  }

  function ask({ lead = [], confirmLabel = "Accetto e continua", showFile = false, fileNote = "" } = {}) {
    return new Promise((resolve) => {
      const modal = $("#consent-modal");
      const general = $("#consent-general"), specific = $("#consent-specific");
      const ok = $("#consent-ok"), cancel = $("#consent-cancel"), err = $("#consent-error");
      const minutes = Math.max(1, Math.round((state.cfg.doc_ttl || 300) / 60));
      const box = $("#consent-lead"); box.innerHTML = "";
      lead.forEach((t) => { const p = document.createElement("p"); p.textContent = t; box.appendChild(p); });
      fillFileBox(showFile, fileNote);
      $("#consent-version").textContent = TERMS.version;
      fillTtl(minutes);
      general.checked = false; specific.checked = false; err.classList.add("hidden");
      ok.textContent = confirmLabel; ok.disabled = true;
      const sync = () => { ok.disabled = !(general.checked && specific.checked); };
      const close = (value) => {
        modal.classList.add("hidden");
        document.removeEventListener("keydown", onKey, true);
        general.onchange = specific.onchange = ok.onclick = cancel.onclick = null;
        armed = value ? { token: value, until: Date.now() + VALID_MS } : null;
        resolve(value);
      };
      const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); close(null); } };
      general.onchange = specific.onchange = sync;
      ok.onclick = async () => {
        if (!(general.checked && specific.checked)) return;
        ok.disabled = true; err.classList.add("hidden");
        try { close(await api.terms.accept()); } // il server registra l'accettazione ed emette il token
        catch (e) { err.textContent = "Impossibile registrare l'accettazione: " + e.message; err.classList.remove("hidden"); sync(); }
      };
      cancel.onclick = () => close(null);
      document.addEventListener("keydown", onKey, true);
      modal.classList.remove("hidden");
      modal.scrollTop = 0;
      general.focus();
    });
  }

  // Minuti di conservazione (dal backend) nelle frasi della finestra.
  function fillTtl(minutes) {
    document.querySelectorAll("#consent-modal .consent-ttl").forEach((el) => { el.textContent = String(minutes); });
  }

  async function ensure(opts) {
    return consume() || (await ask(opts)); // il token appena ottenuto lo usa chi l'ha richiesto
  }

  return { ask, ensure, reset: () => { armed = null; } };
}
