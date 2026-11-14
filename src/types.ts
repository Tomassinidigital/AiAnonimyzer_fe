/**
 * Contratti dati al confine con il backend FastAPI: SOLO i DTO delle API usate
 * dal frontend beta PDF (specchio delle risposte di web/routers).
 */

// ---- GET /api/system/ui-config ----
export interface UiMode {
  key: string;
  label: string;
  description: string;
}

export interface UiSeverityColor {
  key: string;
  color: string;
}

/** Ranking dello score rispetto alla baseline (1 = massima … 4 = minima). */
export interface UiRanking {
  rank: number;
  label: string;
  color: string;
}

export interface UiConfig {
  version: string;
  /** Baseline di default: score minimo accettabile (classifica, non scarta). */
  default_min_confidence: number;
  gpu_monitor: boolean;
  modes: UiMode[];
  severities: UiSeverityColor[];
  rankings: UiRanking[];
  /** Ranking visibili (= oscurati) all'apertura. */
  default_ranks: number[];
  /** Ampiezza di ogni fascia di ranking sotto la baseline. */
  rank_step: number;
}

// ---- GET /api/detection/modules ----
export interface DetectionModule {
  key: string;
  label: string;
  description: string;
  /** true = modulo base (GDPR), sempre attivo. */
  base: boolean;
  layers: string[];
  available: boolean;
  unavailable_layers: string[];
}

export interface DetectionModulesResponse {
  modules: DetectionModule[];
}

// ---- GET /api/detection/layers ----
export interface DetectionLayer {
  key: string;
  label: string;
  description: string;
  priority: number;
  requires_ml: boolean;
  models: string[];
  cost: string;
  available: boolean;
  unavailable_reason: string | null;
}

export interface DetectionLayersResponse {
  layers: DetectionLayer[];
}

// ---- GET /api/approvers (giudici LLM) ----
export interface Approver {
  key: string;
  label: string;
  description: string;
  model: string;
  vram_hint: string;
  default: boolean;
}

export interface ApproversResponse {
  default: string;
  approvers: Approver[];
}

// ---- POST /api/pdf/upload · GET /api/pdf/job/{id} ----
export interface JobStatus {
  job_id: string;
  state: "pending" | "running" | "done" | "error";
  progress: number;
  message: string;
  doc_id?: string | null;
  error?: string | null;
}

/** Parametri dell'analisi (campi del form di /api/pdf/upload). */
export interface AnalyzeOptions {
  /** Analizza solo le prime pagine (anteprima veloce). */
  fast?: boolean;
  /** Moduli aggiuntivi oltre a GDPR (sempre attivo), es. ["gare"]. */
  modules?: string[];
  /** Verifica con il giudice LLM. */
  verify?: boolean;
  approver?: string;
}

// ---- GET /api/pdf/overlay/{doc_id} ----
/** Pagina nello spazio VISUALIZZATO (rotazione /Rotate già applicata). */
export interface PdfPageGeom {
  page: number;
  width: number;
  height: number;
  rotation: number;
}

/** Box in punti PDF, origine in ALTO a sinistra, spazio della pagina visualizzata. */
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface OverlayBox extends Box {
  page: number;
  severity: string;
  label: string;
  entity_type?: string;
  /** Testo originale coperto dal box (per il mascheramento). */
  text?: string;
  /** Testo mascherato secondo la modalità richiesta. */
  masked?: string;
  /** Range dello span sorgente nel testo del documento. */
  char_start: number;
  char_end: number;
  /** Score dello span e suo ranking rispetto alla baseline della richiesta. */
  score: number;
  rank: number;
}

export interface PdfOverlayResponse {
  is_scanned: boolean;
  mode?: string;
  message?: string;
  /** Baseline usata per il ranking e moduli analizzati per il documento. */
  baseline?: number;
  modules?: string[];
  pages: PdfPageGeom[];
  boxes: OverlayBox[];
}

/** Selezione "live" (nessuna nuova analisi): moduli attivi, baseline, ranking. */
export interface ViewParams {
  /** Moduli aggiuntivi attivi (già analizzati); assente = tutti quelli analizzati. */
  modules?: string[];
  /** Baseline per il ranking; assente = soglia dell'analisi. */
  baseline?: number;
  /** Ranking da tenere; assente = default del server (1 e 2). */
  ranks?: number[];
}

export interface OverlayParams extends ViewParams {
  /** Regola di mascheramento (chiavi di UiConfig.modes). Default: "placeholder". */
  mode?: string;
  /** Gravità abilitate; vuoto/assente = tutte. */
  severities?: string[];
}

// ---- GET /api/pdf/search/{doc_id} ----
export interface PdfSearchMatch {
  page: number;
  char: [number, number];
  text: string;
  boxes: Box[];
}

export interface PdfSearchResponse {
  /** Pagine presenti sul server: la modalità veloce ne analizza solo le prime. */
  covered: number;
  matches: PdfSearchMatch[];
}

// ---- POST /api/pdf/download/{doc_id}/redact ----
export interface DownloadParams extends OverlayParams {
  /** Range [inizio, fine] di span deselezionati dall'utente. */
  excludedRanges?: Array<[number, number]>;
}
