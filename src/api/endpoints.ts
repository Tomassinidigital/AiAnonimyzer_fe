import { http } from "./client";
import { apiUrl } from "@/config/runtime";
import type {
  ApproversResponse,
  CompareRequest,
  DebugRequest,
  DebugResponse,
  DemoEntry,
  DemoText,
  DetectRequest,
  DetectResponse,
  DetectionLayersResponse,
  JobStatus,
  PdfLayoutResponse,
  PdfOverlayResponse,
  RenderRequest,
  RenderResponse,
  SystemStats,
  Timing,
  UiConfig,
} from "./types";

// ---- Bootstrap ----
export async function getUiConfig(): Promise<UiConfig> {
  return (await http.get<UiConfig>("/api/system/ui-config")).data;
}

export async function getSystemStats(): Promise<SystemStats> {
  return (await http.get<SystemStats>("/api/system/stats")).data;
}

export async function getDetectionLayers(): Promise<DetectionLayersResponse> {
  return (await http.get<DetectionLayersResponse>("/api/detection/layers")).data;
}

export async function getApprovers(): Promise<ApproversResponse> {
  return (await http.get<ApproversResponse>("/api/approvers")).data;
}

export async function getDemoList(): Promise<DemoEntry[]> {
  return (await http.get<DemoEntry[]>("/api/demo/list")).data;
}

export async function getDemoText(key: string): Promise<DemoText> {
  return (await http.get<DemoText>(`/api/demo/${key}`)).data;
}

// ---- Detection / render ----
export async function detect(body: DetectRequest): Promise<DetectResponse> {
  return (await http.post<DetectResponse>("/api/detect", body)).data;
}

export async function render(body: RenderRequest): Promise<RenderResponse> {
  return (await http.post<RenderResponse>("/api/render", body)).data;
}

export async function detectDebug(body: DebugRequest): Promise<DebugResponse> {
  return (await http.post<DebugResponse>("/api/detect/debug", body)).data;
}

export async function getDetectTimings(docId: string): Promise<Timing[]> {
  const res = await http.get<{ doc_id: string; timings: Timing[] }>(
    `/api/detect/timings/${docId}`,
  );
  return res.data.timings;
}

// ---- Job (avvio) ----
export async function startDetect(body: DetectRequest): Promise<JobStatus> {
  return (await http.post<JobStatus>("/api/detect/start", body)).data;
}

export async function startCompare(body: CompareRequest): Promise<JobStatus> {
  return (await http.post<JobStatus>("/api/detect/compare/start", body)).data;
}

export async function startDebug(body: DebugRequest): Promise<JobStatus> {
  return (await http.post<JobStatus>("/api/detect/debug/start", body)).data;
}

export async function getJob(jobId: string): Promise<JobStatus> {
  return (await http.get<JobStatus>(`/api/job/${jobId}`)).data;
}

// ---- PDF ----
export async function uploadPdf(form: FormData): Promise<JobStatus> {
  const res = await http.post<JobStatus>("/api/pdf/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}

export async function getPdfJob(jobId: string): Promise<JobStatus> {
  return (await http.get<JobStatus>(`/api/pdf/job/${jobId}`)).data;
}

export async function getPdfLayout(docId: string): Promise<PdfLayoutResponse> {
  return (await http.get<PdfLayoutResponse>(`/api/pdf/layout/${docId}`)).data;
}

export async function getPdfOverlay(
  docId: string,
  params: Record<string, string>,
): Promise<PdfOverlayResponse> {
  const res = await http.get<PdfOverlayResponse>(`/api/pdf/overlay/${docId}`, {
    params,
  });
  return res.data;
}

/** URL assoluto al PDF originale (per pdf.js getDocument). */
export function pdfRawUrl(docId: string): string {
  return apiUrl(`/api/pdf/raw/${docId}`);
}

/** URL assoluto al download del PDF redatto/offuscato (apre il file). */
export function pdfDownloadUrl(docId: string, query: string): string {
  const base = `/api/pdf/download/${docId}/redact`;
  return apiUrl(query ? `${base}?${query}` : base);
}
