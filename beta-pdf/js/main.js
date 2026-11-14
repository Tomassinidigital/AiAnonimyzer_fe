/* ============================================================================
   AiAnonimyzer — editor beta PDF: punto di composizione.

   Unico modulo che conosce tutte le parti: crea stato, bus, client API e motore
   PDF, e li passa alle funzionalità (dependency injection). Le funzionalità non
   si importano a vicenda: comunicano con gli eventi del bus (core/store.js).

     core/      configurazione di deploy, stato condiviso, eventi
     api/       client HTTP del backend, una risorsa per file
     pdf/       motore PDF nel browser (caricamento, geometria, ricerca, export)
     domain/    regole dell'editor senza DOM (redazioni, selezione, cronologia)
     shared/    helper DOM, modali, toast
     features/  un'area dell'interfaccia per cartella

   Il rilevamento dei dati è sempre quello del backend (upload → job → overlay).
   ========================================================================== */

import { createApi } from "./api/index.js";
import { config, FALLBACK_UI_CONFIG } from "./core/config.js";
import { createBus, createState, EV } from "./core/store.js";
import { createHistory } from "./domain/history.js";
import { createAnalysis } from "./features/analysis/analysis.js";
import { createExport } from "./features/export/export.js";
import { createOptionsPanel } from "./features/options/options-panel.js";
import { createManualRedaction } from "./features/redaction/manual-redaction.js";
import { loadBackendConfig } from "./features/shell/backend.js";
import { createShell } from "./features/shell/shell.js";
import { createSidebar } from "./features/sidebar/sidebar.js";
import { createUpload } from "./features/upload/upload.js";
import { createNavigator } from "./features/viewer/navigator.js";
import { createOverlayLayer } from "./features/viewer/overlay-layer.js";
import { createViewer } from "./features/viewer/viewer.js";
import { createPdfEngine } from "./pdf/index.js";
import { dialog, notice, toast } from "./shared/dialogs.js";
import { $ } from "./shared/dom.js";

const state = createState(FALLBACK_UI_CONFIG);
const bus = createBus();
const api = createApi(config.apiBase);
const pdf = createPdfEngine({ workerSrc: config.pdfWorkerSrc });

// Cronologia undo/redo: registra le azioni dell'utente, riparte a ogni nuovo
// set di rilevamenti, e dopo undo/redo fa ridisegnare tutto.
const history = createHistory(state, {
  onRestore: () => bus.emit(EV.REDACTIONS, { record: false }),
  onChange: ({ canUndo, canRedo }) => { $("#tb-undo").disabled = !canUndo; $("#tb-redo").disabled = !canRedo; },
});
bus.on(EV.REDACTIONS, ({ record, reset } = {}) => {
  if (reset) history.seed();
  else if (record) history.push();
});

const shell = createShell({ state, bus, catalogApi: api.catalog });
const analysis = createAnalysis({ state, bus, api, pdf, shell, notice, toast });
const viewer = createViewer({ state, bus, pdf, history, toast });

// L'ordine di montaggio è l'ordine in cui reagiscono agli eventi: prima il
// viewer (pagine), poi chi disegna sopra e chi elenca.
const features = [
  shell,
  createUpload({ state, analysis, notice }),
  viewer,
  createOverlayLayer({ state, bus, pdf }),
  createSidebar({ state, bus, viewer }),
  createNavigator({ state, bus, viewer }),
  createManualRedaction({ state, bus, api, pdf, toast }),
  createExport({ state, bus, api, pdf, dialog, notice, toast }),
];
features.forEach((f) => f.mount());

// La colonna opzioni si costruisce dagli elenchi del backend (moduli, ranking…).
await loadBackendConfig({ state, bus, catalogApi: api.catalog });
createOptionsPanel({ state, bus, analysis }).mount();
shell.finishBoot();
