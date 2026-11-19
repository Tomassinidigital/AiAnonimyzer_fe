/* Analisi dei documenti sul backend:
     • POST /api/pdf/upload            → avvia l'analisi (job) → doc_id
     • POST /api/pdf/{doc_id}/modules  → aggiunge moduli senza rieseguire gli altri
   Il rilevamento è sempre lato server: qui c'è solo il trasporto. */

// Token di accettazione dei Termini (monouso, da api.terms.accept): assente per i documenti d'esempio.
const putTerms = (form, token) => { if (token) form.append("terms_token", token); };

export function createAnalysisApi(http) {
  /* Carica il PDF e avvia l'analisi. `opts` = { fast, modules[], verify, approver, termsToken }.
     `modules` = moduli aggiuntivi oltre a GDPR (che gira sempre). Baseline e
     ranking non servono qui: si applicano per richiesta (overlay/download). */
  async function analyze(file, opts, onProgress) {
    const form = new FormData();
    form.append("file", file);
    form.append("fast", opts.fast ? "true" : "false");
    form.append("extractor", "");
    form.append("modules", (opts.modules || []).join(","));
    form.append("verify", opts.verify ? "true" : "false");
    // Il giudice conta solo con la verifica attiva: altrimenti non si invia.
    form.append("approver", opts.verify ? opts.approver || "" : "");
    form.append("force", "true");
    putTerms(form, opts.termsToken);
    const started = await http.post("/api/pdf/upload", form);
    return http.pollJob(started.job_id, onProgress);
  }

  // Aggiunge moduli a un documento già analizzato: stesso doc_id.
  async function addModules(docId, modules, onProgress, { termsToken } = {}) {
    const form = new FormData();
    form.append("modules", (modules || []).join(","));
    putTerms(form, termsToken);
    const started = await http.post(`/api/pdf/${docId}/modules`, form);
    return http.pollJob(started.job_id, onProgress);
  }

  return { analyze, addModules };
}
