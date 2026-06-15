/**
 * Contratti dati al confine con il backend FastAPI.
 * Specchio tipizzato dei DTO Pydantic (web/dto.py) e delle risposte dei servizi.
 */

// ---- Bootstrap / configurazione UI ----
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

// ---- Layer di rilevamento ----
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

// ---- Giudici LLM (approvers) ----
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

// ---- Demo ----
export interface DemoEntry {
  key: string;
  label: string;
  description: string;
}

export interface DemoText {
  key: string;
  label: string;
  text: string;
}

// ---- Render / detection ----
export interface Segment {
  text: string;
  entity_type?: string | null;
  label?: string | null;
  severity?: string | null;
  score?: number | null;
  start: number;
  end: number;
}

export interface ReportRow {
  entity_type: string;
  label: string;
  severity: string;
  count: number;
  samples: string[];
}

export interface Report {
  total: number;
  by_severity: Record<string, number>;
  rows: ReportRow[];
}

export interface RenderResponse {
  doc_id: string;
  segments: Segment[];
  anonymized_text: string;
  report: Report;
  json_export: Record<string, unknown>;
}

export interface LlmCheck {
  status: string; // off | unavailable | active
  scored: number;
  total: number;
  obscured_without_score: number;
  error?: string | null;
}

export interface Timing {
  key: string;
  label: string;
  seconds: number;
}

export interface DetectResponse {
  doc_id: string;
  detections: number;
  render: RenderResponse;
  llm: LlmCheck;
  timings: Timing[];
}

// ---- Job asincroni ----
export interface JobStatus {
  job_id: string;
  state: "pending" | "running" | "done" | "error";
  progress: number;
  message: string;
  doc_id?: string | null;
  error?: string | null;
  result?: Record<string, unknown> | null;
}

// ---- Confronto metodologie ----
export interface CompareMethodInfo {
  score: number;
  entity_type: string;
  label: string;
  count: number;
  processes: string[];
}

export interface CompareEntity {
  text: string;
  severity: string;
  found_by: string[];
  not_found_by: string[];
  by_method: Record<string, CompareMethodInfo>;
}

export interface CompareResponse {
  methods: string[];
  method_labels: Record<string, string>;
  entities: CompareEntity[];
  raw: boolean;
  summary: {
    total_unique: number;
    found_by_all: number;
    partial: number;
  };
}

// ---- Traccia di debug ----
export interface SpanContribution {
  process: string;
  layer: string;
  entity_type: string;
  text: string;
  start: number;
  end: number;
  score: number;
  validated: boolean;
  source: string;
  is_representative: boolean;
}

export interface ClusterTrace {
  text: string;
  entity_type: string;
  label: string;
  severity: string;
  start: number;
  end: number;
  base_score: number;
  agreement_boost: number;
  final_score: number;
  agreement_count: number;
  validated: boolean;
  threshold: number;
  passed_threshold: boolean;
  kept: boolean;
  valid: boolean;
  contributions: SpanContribution[];
  verifier_score?: number | null;
  llm_vote?: number | null;
  llm_prompt?: string | null;
  discarded_reason: string;
}

export interface DebugSummary {
  total_clusters: number;
  kept: number;
  below_threshold: number;
  dropped_overlap: number;
  llm_active: boolean;
  llm_simulated: boolean;
  llm_status: string;
  llm_scored: number;
  llm_prompts: number;
  llm_rejected: number;
}

export interface DebugResponse {
  method: string;
  threshold: number;
  clusters: ClusterTrace[];
  summary: DebugSummary;
  timings?: Timing[];
}

// ---- Stato di sistema (monitor) ----
export interface GpuStats {
  index: number;
  name: string;
  compute_capability: string;
  vram_total_gb: number;
  vram_allocated_gb: number;
  vram_reserved_gb: number;
  utilization_pct: number | null;
}

export interface SystemStats {
  enabled: boolean;
  device: string;
  enable_ml: boolean;
  llm_model: string;
  cuda_available: boolean;
  gpu: GpuStats | null;
}

// ---- PDF ----
export interface PdfLayoutLine {
  start: number;
  end: number;
}

export interface PdfLayoutBlock {
  page: number;
  kind: string;
  region: string; // header | body | footer
  align: string;
  font_scale: number;
  lines: PdfLayoutLine[];
}

export interface PdfLayoutResponse {
  is_scanned: boolean;
  blocks: PdfLayoutBlock[];
}

export interface PdfPageGeom {
  page: number;
  width: number;
  height: number;
}

export interface OverlayBox {
  page: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  severity: string;
  label: string;
  entity_type?: string;
  text?: string;
  masked?: string;
  char_start: number;
  char_end: number;
  gidx?: number;
}

export interface PdfOverlayResponse {
  is_scanned: boolean;
  mode?: string;
  message?: string;
  pages: PdfPageGeom[];
  boxes: OverlayBox[];
}

// ---- Payload di richiesta ----
export interface DetectRequest {
  text: string;
  min_confidence?: number | null;
  method?: string | null;
  layers?: string[] | null;
  verify?: boolean;
  approver?: string | null;
  simulate?: boolean;
}

export interface CompareRequest {
  text?: string;
  doc_id?: string | null;
  min_confidence?: number | null;
  layers?: string[] | null;
}

export interface DebugRequest {
  text?: string;
  doc_id?: string | null;
  min_confidence?: number | null;
  method?: string | null;
  layers?: string[] | null;
  verify?: boolean;
  approver?: string | null;
  simulate?: boolean;
}

export interface RenderRequest {
  doc_id: string;
  mode?: string;
  enabled_severities?: string[] | null;
  manual_ranges?: [number, number][];
  excluded_ranges?: [number, number][];
}
