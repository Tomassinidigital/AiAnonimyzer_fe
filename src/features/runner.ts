/**
 * Orchestrazione delle run (Analizza / Traccia di Debug, testo e PDF).
 * Porting imperativo di public/js/app.js: legge gli store (ui/session/catalog),
 * pilota i canali di feedback (feedbackStore) e applica i risultati a
 * sessionStore. Tenuto fuori da React come l'app originale: i componenti
 * reagiscono allo stato.
 */
import { errorDetail } from "@/api/client";
import {
  detect,
  detectDebug,
  getDetectTimings,
  getPdfJob,
  getPdfLayout,
  render as renderApi,
  startCompare,
  startDebug,
  startDetect,
  uploadPdf,
} from "@/api/endpoints";
import { runJob } from "@/api/jobs";
import type {
  CompareResponse,
  DebugResponse,
  DetectRequest,
  DetectResponse,
  Timing,
} from "@/api/types";
import { INNER_MODES } from "@/constants";
import { isSimulating, selectedApprover, useUiStore } from "@/store/uiStore";
import { useSessionStore } from "@/store/sessionStore";
import { useFeedbackStore, type RunStatRow } from "@/store/feedbackStore";
import { useCatalogStore } from "@/store/catalogStore";
import { configSnapshot } from "@/utils/snapshot";
import { fmtElapsed } from "@/utils/format";

const ui = () => useUiStore.getState();
const session = () => useSessionStore.getState();
const fb = () => useFeedbackStore.getState();

// ---- Etichette / riepiloghi ----
function activeLayersLabel(): string {
  const sel = ui().selectedLayers;
  const ml = sel.filter((k) => k !== "rules");
  if (!ml.length) return "solo regole (veloce)";
  const slow = ml.some((k) => ["zero_shot", "embedding", "llm"].includes(k));
  return `layer attivi: ${sel.join(", ")}` + (slow ? " — alcuni lenti, attendere" : "");
}

function runStatsEntries(): RunStatRow[] {
  const sel = new Set(ui().selectedLayers);
  const entries: RunStatRow[] = useCatalogStore
    .getState()
    .layers.filter((l) => sel.has(l.key))
    .map((l) => ({ key: l.key, label: l.label, value: "—" }));
  if (!entries.length) entries.push({ key: "rules", label: "Regole", value: "—" });
  if (ui().verify) entries.push({ key: "giudice", label: "Giudice LLM", value: "—" });
  return entries;
}

// ---- Canali di Run unificati ----
let runPrefix = "";

const Run = {
  begin(label: string, text: string, sub: string) {
    runPrefix = "";
    fb().loadingShow(text, sub, label === "DEBUG" ? "debug" : "analyze");
    fb().activityShow(label, text);
    fb().sysMonStart(text);
    fb().runStatsStart(runStatsEntries());
    fb().runStatsSetPhase(text);
  },
  step(text?: string | null, sub?: string | null, p?: number | null) {
    if (text) {
      const msg = runPrefix + text;
      fb().loadingStep(msg, sub ?? null, p ?? null);
      fb().activityUpdate(p ?? null, msg);
      fb().sysMonSetState(msg);
      fb().runStatsSetPhase(msg);
    } else {
      fb().loadingStep(null, sub ?? null, p ?? null);
      if (p != null) fb().activityUpdate(p, null);
    }
  },
  setPrefix(p: string) {
    runPrefix = p;
  },
  end() {
    runPrefix = "";
    fb().loadingHide();
    fb().activityHide();
    fb().sysMonStop();
  },
};

function setStatus(msg: string, kind: "info" | "ok" | "error" = "info") {
  session().setStatus(msg, kind);
}

function setTimings(timings: Timing[] | undefined) {
  if (timings) {
    session().setTimings(timings);
    fb().runStatsSetTimings(timings);
  }
}

// ---- Re-render economico (cambio modalità / gravità / correzioni) ----
export async function reRender(): Promise<void> {
  const s = session();
  if (!s.docId) return;
  const mode = ui().mode;
  const base = {
    doc_id: s.docId,
    enabled_severities: ui().enabledSeverities,
    manual_ranges: s.manualRanges,
    excluded_ranges: s.excludedRanges,
  };

  if (mode === "all") {
    const renders = await Promise.all(
      INNER_MODES.map((m) => renderApi({ ...base, mode: m.key })),
    );
    const map = Object.fromEntries(INNER_MODES.map((m, i) => [m.key, renders[i]]));
    session().setRender(renders[0]);
    session().setMultiRender(map);
    session().showTabs(["highlight", "anon", "report", "json", "confronto"]);
  } else {
    const data = await renderApi({ ...base, mode });
    session().setRender(data);
    session().setMultiRender(null);
    session().hideTab("confronto");
    session().showTabs(["highlight", "anon", "report", "json"]);
  }
  session().ensureActiveVisible();
}

/**
 * Variante "fire-and-forget" di reRender per i trigger della UI (cambio
 * modalità/gravità, correzioni manuali). A differenza di reRender — usata nei
 * flussi che gestiscono già l'errore e a cui l'eccezione deve propagare per
 * interrompere la run — qui un fallimento (documento uscito dalla cache, backend
 * irraggiungibile) viene riportato nella status-line invece di restare una
 * promise rejection silenziosa.
 */
export function applyReRender(): void {
  void reRender().catch((e) => {
    setStatus("Errore nell'aggiornamento dell'anteprima: " + errorDetail(e), "error");
  });
}

// ---- Analizza ----
export function runAnalyze(): void {
  if (ui().source === "text") void analyzeText();
  else void analyzePdf();
}

function detectBaseBody(): DetectRequest {
  return {
    text: ui().docText.trim(),
    min_confidence: ui().minConfidence,
    layers: ui().selectedLayers,
    approver: selectedApprover(),
    simulate: isSimulating(),
  };
}

async function analyzeText(): Promise<void> {
  if (ui().docText.trim() === "") {
    setStatus("Inserisci del testo da analizzare.");
    return;
  }
  const runId = session().bumpRunId();
  fb().activityHide();
  if (ui().verify) {
    await analyzeTextThenJudge(runId);
    return;
  }
  Run.begin("ANALISI", "Rilevamento dei dati sensibili…", activeLayersLabel());
  try {
    await analyzeCore();
    ui().setSettingsCollapsed(true);
  } catch (e) {
    setStatus("Errore: " + errorDetail(e), "error");
  } finally {
    Run.end();
    fb().runStatsFinish();
  }
}

async function analyzeCore(): Promise<void> {
  const text = ui().docText.trim();
  if (!text) throw new Error("Inserisci del testo da analizzare.");
  session().setRender(null);
  session().setMultiRender(null);
  session().setLlm(null);
  session().hideTabs(["pdf", "metodi", "debug"]);
  const body: DetectRequest = { ...detectBaseBody(), verify: ui().verify };
  let data: DetectResponse;
  if (body.verify) {
    data = (await runJob(() => startDetect(body), (p, msg) =>
      Run.step(msg || null, null, p),
    )) as unknown as DetectResponse;
  } else {
    data = await detect(body);
  }
  session().setDoc(data.doc_id, false);
  setTimings(data.timings);
  setStatus(`${data.detections} rilevamenti trovati.`, "ok");
  session().setLlm(data.llm ?? null);
  // reset correzioni manuali per la nuova analisi
  useSessionStore.setState({ manualRanges: [], excludedRanges: [] });
  await reRender();
  session().markAnalyzed(configSnapshot());
}

// Verifica LLM attiva → due fasi (risultati subito + giudice in background).
async function analyzeTextThenJudge(runId: number): Promise<void> {
  session().setLlm(null);
  session().hideTabs(["pdf", "metodi", "debug"]);
  useSessionStore.setState({ manualRanges: [], excludedRanges: [] });
  const baseBody = detectBaseBody();

  Run.begin("ANALISI", "Rilevamento dei dati sensibili…", activeLayersLabel());
  try {
    const data = await detect({ ...baseBody, verify: false });
    if (runId !== session().runId) return;
    session().setDoc(data.doc_id, false);
    setTimings(data.timings);
    setStatus(`${data.detections} rilevamenti — giudice in corso…`);
    await reRender();
    ui().setSettingsCollapsed(true);
    session().markAnalyzed(configSnapshot());
  } catch (e) {
    setStatus("Errore: " + errorDetail(e), "error");
    Run.end();
    fb().runStatsFinish();
    return;
  }
  Run.end();
  if (runId !== session().runId) return;
  void runJudgeInBackground(baseBody, runId);
}

async function runJudgeInBackground(
  baseBody: DetectRequest,
  runId: number,
): Promise<void> {
  fb().activityShow("GIUDICE", "avvio…");
  fb().sysMonStart("Giudice LLM in corso…");
  try {
    const data = (await runJob(
      () => startDetect({ ...baseBody, verify: true }),
      (p, msg) => {
        if (runId === session().runId) fb().activityUpdate(p, msg);
      },
    )) as unknown as DetectResponse;
    if (runId !== session().runId) return;
    session().setDoc(data.doc_id, false);
    setTimings(data.timings);
    setStatus(`${data.detections} rilevamenti — verificati dal giudice.`, "ok");
    session().setLlm(data.llm ?? null);
    await reRender();
    fb().activityHide();
  } catch (e) {
    if (runId === session().runId) fb().activityError("errore: " + errorDetail(e));
  } finally {
    fb().sysMonStop();
    if (runId === session().runId) fb().runStatsFinish();
  }
}

// ---- PDF ----
async function analyzePdf(): Promise<void> {
  session().bumpRunId();
  Run.begin("PDF", "Caricamento e analisi del PDF…", activeLayersLabel());
  try {
    await analyzePdfCore();
  } catch (e) {
    setStatus("Errore: " + errorDetail(e), "error");
  } finally {
    Run.end();
    fb().runStatsFinish();
  }
}

async function analyzePdfCore(): Promise<void> {
  const file = ui().pdfFile;
  if (!file) throw new Error("Seleziona un file PDF.");
  useSessionStore.setState({ manualRanges: [], excludedRanges: [] });
  session().hideTabs(["metodi", "debug"]);
  const form = new FormData();
  form.append("file", file);
  form.append("fast", ui().pdfFast ? "true" : "false");
  form.append("min_confidence", String(ui().minConfidence));
  form.append("layers", ui().selectedLayers.join(","));
  form.append("verify", ui().verify ? "true" : "false");
  form.append("approver", selectedApprover() || "");
  form.append("force", "true");
  Run.step("Caricamento…", null, 0.05);
  const job = await uploadPdf(form);
  await pollPdfJob(job.job_id);
}

async function pollPdfJob(jobId: string): Promise<void> {
  for (;;) {
    const job = await getPdfJob(jobId);
    Run.step(job.message, null, job.progress);
    if (job.state === "done" && job.doc_id) {
      session().setDoc(job.doc_id, true);
      Run.step("Completato", null, 1);
      try {
        const timings = await getDetectTimings(job.doc_id);
        setTimings(timings);
      } catch {
        /* riepilogo tempi: best effort */
      }
      session().setPdfLayout(null);
      try {
        const layout = await getPdfLayout(job.doc_id);
        session().setPdfLayout(layout.blocks?.length ? layout.blocks : null);
      } catch {
        /* fallback al testo piatto */
      }
      await reRender();
      const total = session().render?.report.total ?? 0;
      setStatus(`${total} rilevamenti nel PDF.`, "ok");
      session().showTab("pdf");
      session().activateTab("pdf");
      ui().setSettingsCollapsed(true);
      session().markAnalyzed(configSnapshot());
      return;
    }
    if (job.state === "error") {
      throw new Error(job.error || "elaborazione fallita");
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
}

// ---- Confronto metodologie + Debug ----
function detectionBody() {
  const layers = ui().selectedLayers;
  const docId = session().docId;
  if (docId) {
    return { doc_id: docId, min_confidence: ui().minConfidence, layers };
  }
  if (ui().source === "text") {
    const text = ui().docText.trim();
    if (!text) throw new Error("Inserisci del testo o analizza un documento prima.");
    return { text, min_confidence: ui().minConfidence, layers };
  }
  throw new Error("Carica e analizza un PDF prima.");
}

async function compareCore(body: ReturnType<typeof detectionBody>): Promise<void> {
  const data = (await runJob(
    () => startCompare(body),
    (p, msg) => {
      if (msg) Run.step(msg, null, p);
      else Run.step(null, null, p);
      setStatus(runPrefix + (msg || ""));
    },
  )) as unknown as CompareResponse;
  session().setCompare(data);
  session().showTab("metodi");
}

async function debugCore(): Promise<void> {
  const body = {
    ...detectionBody(),
    verify: ui().verify,
    approver: selectedApprover(),
    simulate: isSimulating(),
  };
  let payload: DebugResponse;
  if (body.verify) {
    payload = (await runJob(
      () => startDebug(body),
      (p, msg) => {
        if (msg) {
          Run.step(msg, null, p);
          setStatus(runPrefix + msg);
        } else {
          Run.step(null, null, p);
        }
      },
    )) as unknown as DebugResponse;
  } else {
    payload = await detectDebug(body);
  }
  setTimings(payload.timings);
  session().setDebug(payload);
  session().showTab("debug");
}

export function debugTrace(): void {
  void runDebugFlow();
}

async function runDebugFlow(): Promise<void> {
  session().bumpRunId();
  Run.begin("DEBUG", "Analisi completa in corso…", "passo 1 di 3");
  try {
    try {
      await runDebugSteps();
    } catch (e) {
      const msg = errorDetail(e);
      if (!/non in cache/i.test(msg)) throw e;
      setStatus("Documento non più in cache: rianalizzo da zero…");
      session().setDoc(null, session().isPdf);
      await runDebugSteps();
    }
    session().activateTab("debug");
    setStatus("Completato: analisi, confronto metodi e traccia di debug.", "ok");
    ui().setSettingsCollapsed(true);
  } catch (e) {
    setStatus("Errore: " + errorDetail(e), "error");
  } finally {
    Run.end();
    fb().runStatsFinish();
  }
}

async function runDebugSteps(): Promise<void> {
  // 1) Analizza (crea il doc e popola Evidenziato/Anonimizzato/Report/JSON).
  Run.setPrefix("Passo 1/3 · ");
  if (ui().source === "text") {
    Run.step("Rilevamento dei dati sensibili…", activeLayersLabel(), 0.02);
    await analyzeCore();
  } else if (!session().docId) {
    Run.step("Caricamento e analisi del PDF…", activeLayersLabel(), 0.02);
    await analyzePdfCore();
  }
  // 2) Confronta le metodologie (popola Metodi).
  Run.setPrefix("Passo 2/3 · ");
  Run.step(
    "Confronto tra le metodologie…",
    "eseguo ogni layer separatamente (può richiedere tempo)",
    0.02,
  );
  await compareCore(detectionBody());
  // 3) Traccia di debug (popola Debug).
  Run.setPrefix("Passo 3/3 · ");
  Run.step(
    "Costruzione della traccia di debug…",
    "ricostruisco cluster, contributi e boost per ogni frase",
    0.02,
  );
  await debugCore();
}

// ---- helper tempo (per i ticker dei componenti) ----
export { fmtElapsed };
