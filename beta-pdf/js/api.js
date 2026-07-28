/* ============================================================================
   beta PDF — Client delle API del progetto
   ----------------------------------------------------------------------------
   Aggancia il prototipo FE al backend reale di AiAnonimyzer_v3. Usa gli STESSI
   endpoint del frontend principale:

     • GET  /api/system/ui-config      → modalità offuscamento, gravità, versione
     • GET  /api/detection/layers      → catalogo layer (per il profilo "Debug")
     • GET  /api/approvers             → giudici LLM per la verifica
     • POST /api/pdf/upload            → avvia analisi (job) → { job_id, doc_id }
     • GET  /api/pdf/job/{id}          → stato job (poll)
     • GET  /api/pdf/raw/{doc_id}      → byte del PDF originale (per PDF.js)
     • GET  /api/pdf/overlay/{doc_id}  → box di redazione rilevati dall'IA
     • GET  /api/pdf/download/{id}/redact → PDF redatto (hard redaction lato server)

   Nessuna logica di rilevamento è replicata qui: il lavoro pesante resta nel
   backend. Questo modulo è solo il "ponte" HTTP.
   ========================================================================== */
(function () {
  "use strict";

  // Base configurabile: se il prototipo è servito sotto /beta dal backend, le
  // API sono same-origin (base = ""). window.BETA_API_BASE permette override.
  const BASE = (window.BETA_API_BASE || "").replace(/\/$/, "");
  const u = (p) => BASE + p;

  async function _json(res) {
    if (!res.ok) {
      let msg = res.statusText;
      try { msg = (await res.json()).detail || msg; } catch (_e) { /* noop */ }
      throw new Error(msg);
    }
    return res.json();
  }

  // Verifica se il backend è raggiungibile (decide online vs offline).
  async function ping() {
    try {
      const res = await fetch(u("/api/system/ui-config"), { method: "GET" });
      if (!res.ok) return null;
      return await res.json();
    } catch (_e) {
      return null;
    }
  }

  async function getLayers() {
    try { return (await _json(await fetch(u("/api/detection/layers")))).layers || []; }
    catch (_e) { return []; }
  }

  async function getApprovers() {
    try { return await _json(await fetch(u("/api/approvers"))); }
    catch (_e) { return { default: "", approvers: [] }; }
  }

  /* Carica il PDF e avvia l'analisi. `opts` = { fast, layers[], minConfidence,
     verify, approver }. Ritorna il doc_id quando il job è concluso.
     onProgress(fraction, message) opzionale. */
  async function analyze(file, opts, onProgress) {
    const form = new FormData();
    form.append("file", file);
    form.append("fast", opts.fast ? "true" : "false");
    form.append("extractor", "");
    if (opts.layers && opts.layers.length) form.append("layers", opts.layers.join(","));
    if (opts.minConfidence != null) form.append("min_confidence", String(opts.minConfidence));
    form.append("verify", opts.verify ? "true" : "false");
    form.append("approver", opts.approver || "");
    form.append("force", "true");

    const started = await _json(await fetch(u("/api/pdf/upload"), { method: "POST", body: form }));
    return pollJob(started.job_id, onProgress);
  }

  async function pollJob(jobId, onProgress) {
    for (;;) {
      const job = await _json(await fetch(u("/api/pdf/job/" + jobId)));
      if (onProgress && typeof job.progress === "number") onProgress(job.progress, job.message || "");
      if (job.state === "done") return job.doc_id;
      if (job.state === "error") throw new Error(job.error || "Analisi fallita.");
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  /* Box di redazione rilevati. `mode` e `severities` sono "live" (non richiedono
     nuova analisi). Ritorna { is_scanned, message, pages:[{page,width,height}],
     boxes:[{page,x0,y0,x1,y1,label,severity,text,char_start,char_end,masked}] }.
     ATTENZIONE: i box sono in punti PDF con origine IN ALTO a sinistra. */
  async function getOverlay(docId, { mode = "placeholder", severities } = {}) {
    const qs = new URLSearchParams();
    qs.set("mode", mode);
    if (severities && severities.length) qs.set("severities", severities.join(","));
    return _json(await fetch(u(`/api/pdf/overlay/${docId}?` + qs.toString())));
  }

  function rawPdfUrl(docId) { return u("/api/pdf/raw/" + docId); }

  /* URL del PDF redatto lato server (hard redaction). `excludedRanges` sono le
     coppie [start,end] delle entità che l'utente ha deselezionato. */
  function downloadUrl(docId, { mode = "placeholder", severities, excludedRanges } = {}) {
    const qs = new URLSearchParams();
    qs.set("style", "black");
    qs.set("mode", mode);
    if (severities && severities.length) qs.set("severities", severities.join(","));
    if (excludedRanges && excludedRanges.length) {
      qs.set("excluded_ranges", excludedRanges.map((r) => `${r[0]}-${r[1]}`).join(","));
    }
    return u(`/api/pdf/download/${docId}/redact?` + qs.toString());
  }

  window.BetaApi = {
    ping, getLayers, getApprovers, analyze, getOverlay, rawPdfUrl, downloadUrl,
  };
})();
