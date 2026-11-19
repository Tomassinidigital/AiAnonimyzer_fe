/* Scadenza dei dati sul server: anello in fondo alla toolbar del PDF.

   Il server conserva il documento solo finché lo si usa: ogni richiesta rinnova
   la scadenza (`ttl` secondi dall'ultimo utilizzo). L'overlay ne comunica il
   valore (state.expiry, aggiornato da analysis); qui l'anello si svuota ogni
   secondo. Clic = rinnovo (POST keepalive) + popup informativo. Allo scadere il
   documento non è più sul server: niente download né rielaborazione senza
   «Riesegui analisi». A WARN_AT secondi dalla scadenza si apre da solo un
   avviso (una volta per ciclo) che chiede se continuare: sì = rinnovo. */

import { EV } from "../../core/store.js";
import { $ } from "../../shared/dom.js";

const RING = 2 * Math.PI * 8; // circonferenza del cerchio (r = 8)
const WARN_AT = 60;           // secondi alla scadenza in cui compare l'avviso

const fmt = (sec) => {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function createExpiry({ state, bus, api, dialog }) {
  const remaining = () => (state.expiry ? (state.expiry.at - Date.now()) / 1000 : 0);
  let warned = false;   // avviso già mostrato per questa scadenza
  let dialogOpen = false;

  function expire() {
    state.docId = null;          // il server ha cancellato i dati
    state.expiry = null;
    state.stale = true;
    bus.emit(EV.STALE);
  }

  function update() {
    const btn = $("#tb-expiry");
    if (!btn) return;
    const live = !!(state.docModel && state.docId && state.expiry);
    btn.classList.toggle("gone", !!state.docModel && !live);
    if (live && remaining() <= 0) { expire(); return update(); }
    if (live && remaining() <= WARN_AT && !warned && !dialogOpen) { warned = true; warn(); }
    const left = live ? remaining() : 0;
    const frac = live ? Math.min(1, left / state.expiry.ttl) : 0;
    btn.style.setProperty("--ring-color", frac > 0.5 ? "var(--blue)" : frac > 0.2 ? "#f59e0b" : "#dc2626");
    btn.querySelector(".ring").style.strokeDashoffset = String(RING * (1 - frac));
    $("#tb-expiry-time").textContent = live ? fmt(left) : "—";
    const tip = live
      ? `Dati conservati sul server ancora per ${fmt(left)} (il tempo si rinnova a ogni operazione). Fai clic per i dettagli e per rinnovarlo.`
      : "I dati del documento non sono più presenti sul server.";
    btn.title = tip; btn.setAttribute("aria-label", tip);
  }

  function setExpiry(expiresIn, ttl) {
    state.expiry = { at: Date.now() + expiresIn * 1000, ttl };
    if (expiresIn > WARN_AT) warned = false; // nuovo ciclo: l'avviso potrà ricomparire
    update();
  }

  const INFO = [
    "I dati del tuo documento sono mantenuti sul nostro server soltanto per il tempo minimo necessario all'analisi.",
    "Allo scadere del termine ogni riferimento viene eliminato dal server. Per scaricare o rielaborare ancora il documento occorrerà «Riesegui analisi»: il file sarà trasmesso nuovamente dal tuo browser, dove resta disponibile finché la pagina non viene chiusa o ricaricata.",
  ];
  const minutes = () => (state.expiry ? Math.round(state.expiry.ttl / 60) : null);
  const renewInfo = () => `Tempo rinnovato: i dati restano disponibili per ${fmt(remaining())}` +
    (minutes() ? ` (sono eliminati dopo ${minutes()} minuti di inattività sul documento; ogni operazione rinnova il termine).` : ".");
  const GONE = "I dati di questo documento sono già stati eliminati dal server. Per riprendere il lavoro, premi «Riesegui analisi».";

  // Rinnovo come un'azione qualsiasi: il documento NON viene toccato.
  async function renew() {
    if (!state.docId) return false;
    try {
      const res = await api.documents.keepalive(state.docId);
      if (res) { setExpiry(res.expires_in, res.ttl); return true; }
      expire();
    } catch (_e) { /* server non raggiungibile: la scadenza resta quella nota */ }
    update();
    return false;
  }

  async function show(opts) {
    dialogOpen = true;
    try { return await dialog(opts); } finally { dialogOpen = false; }
  }

  // Clic sul bottone: rinnovo + informazioni.
  async function onClick() {
    const renewed = await renew();
    const text = [...INFO];
    if (renewed) text.push(renewInfo());
    else if (state.docModel) text.push(GONE);
    await show({ icon: "ℹ", title: "Conservazione dei dati", text });
  }

  // A un minuto dalla scadenza: avviso con la scelta di continuare.
  async function warn() {
    const choice = await show({
      icon: "⚠",
      title: "Il documento sta per essere cancellato",
      text: [
        `Tra ${fmt(remaining())} i dati di questo documento saranno eliminati dal server: da quel momento nessuna operazione successiva (download, modifica dei moduli, nuova analisi) sarà più possibile.`,
        ...INFO,
        "Vuoi continuare a lavorare sul documento?",
      ],
      buttons: [
        { label: "Lascia scadere", value: false },
        { label: "Continua a lavorare", value: true, primary: true },
      ],
    });
    if (!choice) return;
    const renewed = await renew();
    await show({ icon: "ℹ", title: "Conservazione dei dati", text: [renewed ? renewInfo() : GONE] });
  }

  function mount() {
    $("#tb-expiry").addEventListener("click", onClick);
    bus.on(EV.EXPIRY, ({ expiresIn, ttl } = {}) => { if (expiresIn != null) setExpiry(expiresIn, ttl); else update(); });
    bus.on(EV.DOCUMENT_READY, update);
    setInterval(update, 1000);
    update();
  }

  return { mount };
}
