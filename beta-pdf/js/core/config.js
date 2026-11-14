/* Configurazione dell'editor: valori di deploy + costanti di interfaccia.

   I valori di deploy arrivano da `window.BETA_CONFIG` (blocco in index.html, che
   il workflow Pages riscrive) e da `window.BETA_API_BASE` (override storico,
   iniettato prima di main.js): nessun modulo legge `window` per la configurazione. */

const deploy = window.BETA_CONFIG || {};

export const config = Object.freeze({
  // Base delle API: "" = stessa origine (beta servito dal backend su /beta).
  apiBase: String(window.BETA_API_BASE || deploy.apiBase || "").replace(/\/$/, ""),
  // Worker di PDF.js (stessa versione della libreria caricata in index.html).
  pdfWorkerSrc: deploy.pdfWorkerSrc || "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js",
});

// Scala di rendering delle pagine a zoom 100% e limiti dello zoom.
export const RENDER_SCALE = 1.45;
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 3;
export const ZOOM_STEP = 0.15;

// Usata se il backend non risponde: stessi campi di GET /api/system/ui-config.
export const FALLBACK_UI_CONFIG = Object.freeze({
  version: "beta",
  default_min_confidence: 0.82,
  modes: [{ key: "placeholder", label: "Segnaposto tipizzato", description: "Copre con un box." }],
  severities: [],
  rankings: [
    { rank: 1, label: "Massima", color: "#16a34a" }, { rank: 2, label: "Media", color: "#f59e0b" },
    { rank: 3, label: "Bassa", color: "#92400e" }, { rank: 4, label: "Minima", color: "#dc2626" },
  ],
  default_ranks: [1, 2],
  rank_step: 0.1,
});
