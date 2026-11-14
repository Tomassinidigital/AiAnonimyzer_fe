import { http, errorDetail } from "./client.js";
import type {
  AnalyzeOptions,
  ApproversResponse,
  DetectionLayersResponse,
  DetectionModulesResponse,
  DownloadParams,
  JobStatus,
  OverlayParams,
  PdfOverlayResponse,
  PdfSearchResponse,
  UiConfig,
  ViewParams,
} from "./types.js";

// Parametri "live" comuni a overlay e download.
function viewEntries({ modules, baseline, ranks }: ViewParams): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  if (modules) out.push(["modules", modules.join(",")]);
  if (baseline != null) out.push(["baseline", String(baseline)]);
  if (ranks) out.push(["ranks", ranks.join(",")]);
  return out;
}

// ---- Bootstrap ----
export async function getUiConfig(): Promise<UiConfig> {
  return (await http.get<UiConfig>("/api/system/ui-config")).data;
}

export async function getDetectionLayers(): Promise<DetectionLayersResponse> {
  return (await http.get<DetectionLayersResponse>("/api/detection/layers")).data;
}

export async function getDetectionModules(): Promise<DetectionModulesResponse> {
  return (await http.get<DetectionModulesResponse>("/api/detection/modules")).data;
}

export async function getApprovers(): Promise<ApproversResponse> {
  return (await http.get<ApproversResponse>("/api/approvers")).data;
}

// ---- Analisi PDF (upload → job) ----
export async function uploadPdf(file: Blob, opts: AnalyzeOptions = {}): Promise<JobStatus> {
  const form = new FormData();
  form.append("file", file);
  form.append("fast", opts.fast ? "true" : "false");
  form.append("extractor", "");
  form.append("modules", (opts.modules ?? []).join(","));
  form.append("verify", opts.verify ? "true" : "false");
  form.append("approver", opts.approver ?? "");
  form.append("force", "true");
  return (await http.post<JobStatus>("/api/pdf/upload", form)).data;
}

/** Aggiunge moduli a un documento già analizzato (stesso doc_id, GDPR non rigira). */
export async function addPdfModules(docId: string, modules: string[]): Promise<JobStatus> {
  const form = new FormData();
  form.append("modules", modules.join(","));
  return (await http.post<JobStatus>(`/api/pdf/${docId}/modules`, form)).data;
}

export async function getPdfJob(jobId: string): Promise<JobStatus> {
  return (await http.get<JobStatus>(`/api/pdf/job/${jobId}`)).data;
}

const POLL_INTERVAL_MS = 500;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Carica il PDF, attende il job e ritorna il `doc_id`. */
export async function analyzePdf(
  file: Blob,
  opts: AnalyzeOptions = {},
  onProgress?: (fraction: number, message: string) => void,
): Promise<string> {
  let started: JobStatus;
  try {
    started = await uploadPdf(file, opts);
  } catch (e) {
    throw new Error(errorDetail(e, "Caricamento non riuscito"));
  }
  for (;;) {
    const job = await getPdfJob(started.job_id);
    if (typeof job.progress === "number") onProgress?.(job.progress, job.message || "");
    if (job.state === "done" && job.doc_id) return job.doc_id;
    if (job.state === "error") throw new Error(job.error || "Analisi fallita.");
    await sleep(POLL_INTERVAL_MS);
  }
}

// ---- Box di redazione ----
export async function getPdfOverlay(
  docId: string,
  { mode = "placeholder", severities, ...view }: OverlayParams = {},
): Promise<PdfOverlayResponse> {
  const params: Record<string, string> = { mode, ...Object.fromEntries(viewEntries(view)) };
  if (severities?.length) params.severities = severities.join(",");
  return (await http.get<PdfOverlayResponse>(`/api/pdf/overlay/${docId}`, { params })).data;
}

/** Ricerca di una frase nel testo estratto: box con la stessa geometria del rilevamento. */
export async function searchPdfPhrase(docId: string, query: string): Promise<PdfSearchResponse> {
  return (await http.get<PdfSearchResponse>(`/api/pdf/search/${docId}`, { params: { q: query } })).data;
}

/**
 * PDF redatto lato server (hard redaction). GDPR: il server non conserva il PDF,
 * quindi va RICARICATO; lato server vive solo in un file temporaneo distrutto subito.
 */
export async function downloadPdf(
  docId: string,
  file: Blob,
  { mode = "placeholder", severities, excludedRanges, ...view }: DownloadParams = {},
): Promise<Blob> {
  const form = new FormData();
  form.append("file", file);
  form.append("style", "black");
  form.append("mode", mode);
  viewEntries(view).forEach(([k, v]) => form.append(k, v));
  if (severities?.length) form.append("severities", severities.join(","));
  if (excludedRanges?.length) {
    form.append("excluded_ranges", excludedRanges.map(([a, b]) => `${a}-${b}`).join(","));
  }
  // arraybuffer + Blob: stesso risultato nel browser e in Node (dove "blob" darebbe un Buffer).
  const res = await http.post<ArrayBuffer>(`/api/pdf/download/${docId}/redact`, form, {
    responseType: "arraybuffer",
  });
  return new Blob([res.data], { type: "application/pdf" });
}

/** GDPR: elimina subito dal server i dati del documento. `true` se erano ancora presenti. */
export async function deletePdfDocument(docId: string): Promise<boolean> {
  return (await http.delete<{ deleted: boolean }>(`/api/pdf/${docId}`)).data.deleted;
}
