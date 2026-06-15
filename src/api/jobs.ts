import axios from "axios";
import { getJob } from "./endpoints";
import { errorDetail } from "./client";
import type { JobStatus } from "./types";

const POLL_INTERVAL_MS = 1500;
// Tolleranza agli errori TRANSITORI durante il polling: un blip di rete o un
// 5xx momentaneo non deve abortire un job lungo (es. il giudice LLM in
// background). Si ritenta fino a questo limite di fallimenti CONSECUTIVI prima
// di rinunciare. Un 404 è invece terminale (gestito a parte): il job non esiste
// più (scaduto o evitto dalla cache lato server), ritentare è inutile.
const MAX_POLL_FAILURES = 5;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type ProgressCallback = (progress: number, message: string) => void;

/**
 * Segue un job già avviato fino a completamento, riportando l'avanzamento.
 * Ritorna `job.result`. Lancia con il messaggio d'errore del job in caso di
 * fallimento. Polling rallentato (1.5s): meno chiamate; l'UI può animare i
 * cronometri localmente. Resiliente ai fallimenti di rete transitori: ritenta
 * il polling invece di abortire l'intero job al primo errore.
 */
export async function pollJob(
  jobId: string,
  onProgress?: ProgressCallback,
): Promise<Record<string, unknown>> {
  let failures = 0;
  for (;;) {
    let job: JobStatus;
    try {
      job = await getJob(jobId);
      failures = 0; // una risposta valida azzera i fallimenti consecutivi
    } catch (e) {
      // 404 = job inesistente: terminale, non ha senso ritentare.
      if (axios.isAxiosError(e) && e.response?.status === 404) {
        throw new Error(errorDetail(e, "Job non trovato"));
      }
      // Errore transitorio (rete o 5xx): ritenta fino al limite consentito.
      if (++failures >= MAX_POLL_FAILURES) {
        throw new Error(errorDetail(e, "Job non raggiungibile"));
      }
      await sleep(POLL_INTERVAL_MS);
      continue;
    }
    onProgress?.(job.progress || 0.02, job.message || "");
    if (job.state === "done") return job.result ?? {};
    if (job.state === "error") throw new Error(job.error || "job fallito");
    await sleep(POLL_INTERVAL_MS);
  }
}

/**
 * Avvia un job (start restituisce `{ job_id }`) e ne segue l'avanzamento.
 */
export async function runJob(
  start: () => Promise<JobStatus>,
  onProgress?: ProgressCallback,
): Promise<Record<string, unknown>> {
  let started: JobStatus;
  try {
    started = await start();
  } catch (e) {
    throw new Error(errorDetail(e, "Errore avvio job"));
  }
  return pollJob(started.job_id, onProgress);
}
