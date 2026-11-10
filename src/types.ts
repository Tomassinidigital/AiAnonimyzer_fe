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

export interface UiConfig {
  version: string;
  default_min_confidence: number;
  gpu_monitor: boolean;
  modes: UiMode[];
  severities: UiSeverityColor[];
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
  /** Layer di rilevamento (chiavi di /api/detection/layers). */
  layers?: string[];
  minConfidence?: number | null;
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
}

export interface PdfOverlayResponse {
  is_scanned: boolean;
  mode?: string;
  message?: string;
  pages: PdfPageGeom[];
  boxes: OverlayBox[];
}

export interface OverlayParams {
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
