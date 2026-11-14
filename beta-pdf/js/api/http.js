/* Trasporto HTTP verso il backend: URL base, gestione errori, polling dei job.
   I client per risorsa (catalog, analysis, documents) dipendono da questo
   oggetto, non da `fetch` né dalla configurazione. */

export function createHttp(base) {
  const url = (path) => base + path;

  async function json(res) {
    if (!res.ok) {
      let msg = res.statusText;
      try { msg = (await res.json()).detail || msg; } catch (_e) { /* risposta non JSON */ }
      throw new Error(msg);
    }
    return res.json();
  }

  const get = async (path) => json(await fetch(url(path)));
  const post = async (path, form) => json(await fetch(url(path), { method: "POST", body: form }));

  // Attende la fine di un job (upload / aggiunta moduli). Ritorna il doc_id.
  async function pollJob(jobId, onProgress) {
    for (;;) {
      const job = await get("/api/pdf/job/" + jobId);
      if (onProgress && typeof job.progress === "number") onProgress(job.progress, job.message || "");
      if (job.state === "done") return job.doc_id;
      if (job.state === "error") throw new Error(job.error || "Analisi fallita.");
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return { url, json, get, post, pollJob };
}
