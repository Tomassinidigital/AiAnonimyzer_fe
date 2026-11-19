/* Stato condiviso dell'editor + bus di eventi.

   Un solo oggetto `state` (letto e scritto dai moduli che ne sono responsabili)
   e un publish/subscribe per notificare i cambiamenti: chi modifica lo stato non
   deve conoscere chi si aggiorna (viewer, lista, contatori, cronologia…).
   Aggiungere un consumatore = una nuova sottoscrizione, nessuna modifica altrove. */

// Eventi dell'editor (unico elenco: evita refusi nelle stringhe).
export const EV = Object.freeze({
  // Redazioni (gruppi/occorrenze) o pagine eliminate cambiate.
  // payload: { record: boolean } — true se è un'azione dell'utente (annullabile).
  REDACTIONS: "redactions:changed",
  // Nuovo documento analizzato e caricato: l'editor si apre.
  DOCUMENT_READY: "document:ready",
  // Le pagine sono state (ri)costruite nel viewer (nuovo documento o zoom).
  PAGES_RENDERED: "pages:rendered",
  // Pagina corrente cambiata. payload: { page, syncList }
  PAGE_SHOWN: "page:shown",
  // Filtro della lista (per tipo / per pagina / solo un tipo) cambiato.
  LIST_FILTER: "list-filter:changed",
  // Le impostazioni di rilevamento non corrispondono più all'analisi fatta.
  STALE: "stale:changed",
  // Stato del backend (raggiungibile o no) cambiato.
  BACKEND: "backend:changed",
  // Modalità debug attivata/disattivata: l'overlay si ricarica con i dati di
  // cattura (layer, processi, score) e la lista mostra il menu di debug.
  DEBUG: "debug:changed",
  // Una redazione è stata selezionata (clic sul box, ▲▼, clic nella lista): la
  // lista si posiziona sulla sua frase e il box fa un breve effetto marquee.
  // payload: { gid, oi? } (oi = occorrenza; assente = la prima)
  FOCUS_GROUP: "group:focus",
  // Pannelli laterali (opzioni a sinistra, lista a destra) aperti/chiusi: il
  // viewer adegua lo zoom. payload: nessuno (stato in state.panels)
  PANELS: "panels:changed",
  // Scadenza dei dati sul server aggiornata. payload: { expiresIn, ttl } (secondi)
  EXPIRY: "expiry:changed",
});

export function createState(uiConfig) {
  return {
    backendUp: false,
    cfg: uiConfig,
    approvers: [],
    // Moduli di rilevamento (GDPR base + aggiuntivi), dal server.
    modules: [],
    activeModules: new Set(),   // moduli spuntati (il base, GDPR, attivo di default)
    analyzedModules: new Set(), // moduli già analizzati dal server per il documento
    // Ranking dello score: chiave → { rank, label, color }.
    rankInfo: {},
    ranks: new Set([1, 2]),     // ranking visibili = oscurati
    baseline: 0.82,             // score minimo accettabile: classifica, non taglia
    rankStep: 0.1,
    // Documento corrente.
    file: null,                 // Blob/File (per rieseguire l'analisi e scaricare)
    isSample: false,            // true = documento d'esempio: non richiede i Termini
    fileName: "documento",
    docId: null,                // id lato backend (null = dati rimossi dal server)
    docModel: null,             // modello PDF.js (pagine, viewport, indice testo)
    pagesIndex: [],
    scanned: false,
    scannedMsg: "",
    analyzedPages: 0,           // pagine analizzate dal server (modalità veloce)
    // Redazioni: gruppi IA e manuali, ognuno con le sue occorrenze.
    groups: [],
    flags: [],                  // dati a checksum errato: segnalati, non oscurati
    debug: false,               // icona debug: dati di cattura nella lista
    expiry: null,               // { at: ms, ttl: s } scadenza dei dati sul server
    seq: 1,
    stale: false,
    // Opzioni dell'analisi.
    opts: { fast: true, verify: false, approver: "" },
    mode: "box",                // modalità di offuscamento nel PDF (box nero = default)
    severities: null,           // Set delle gravità abilitate (null = tutte)
    sevColors: {},
    // Viewer.
    zoom: 1,
    panels: { options: true, sidebar: true }, // pannelli laterali aperti
    currentPage: 0,
    deletedPages: new Set(),
    pageRenders: [],
    // Lista laterale e navigazione tra le redazioni.
    listFilter: "type",
    navList: [],
    navIdx: -1,
  };
}

export function createBus() {
  const subs = new Map();
  return {
    on(topic, fn) {
      if (!subs.has(topic)) subs.set(topic, []);
      subs.get(topic).push(fn);
      return () => subs.set(topic, subs.get(topic).filter((f) => f !== fn));
    },
    emit(topic, payload) {
      (subs.get(topic) || []).forEach((fn) => fn(payload));
    },
  };
}
