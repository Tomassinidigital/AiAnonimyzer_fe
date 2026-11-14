/* Analisi dei documenti sul backend:
     • POST /api/pdf/upload            → avvia l'analisi (job) → doc_id
     • POST /api/pdf/{doc_id}/modules  → aggiunge moduli senza rieseguire gli altri
   Il rilevamento è sempre lato server: qui c'è solo il trasporto. */

export function createAnalysisApi(http) {
  /* Carica il PDF e avvia l'analisi. `opts` = { fast, modules[], verify, approver }.
     `modules` = moduli aggiuntivi oltre a GDPR (che gira sempre). Baseline e
     ranking non servono qui: si applicano per richiesta (overlay/download). */
  async function analyze(file, opts, onProgress) {
    const form = new FormData();
    form.append("file", file);
    form.append("fast", opts.fast ? "true" : "false");
    form.append("extractor", "");
    form.append("modules", (opts.modules || []).join(","));
    form.append("verify", opts.verify ? "true" : "false");
    form.append("approver", opts.approver || "");
    form.append("force", "true");
    const started = await http.post("/api/pdf/upload", form);
    return http.pollJob(started.job_id, onProgress);
  }

  // Aggiunge moduli a un documento già analizzato: stesso doc_id.
  async function addModules(docId, modules, onProgress) {
    const form = new FormData();
    form.append("modules", (modules || []).join(","));
    const started = await http.post(`/api/pdf/${docId}/modules`, form);
    return http.pollJob(started.job_id, onProgress);
  }

  return { analyze, addModules };
}
