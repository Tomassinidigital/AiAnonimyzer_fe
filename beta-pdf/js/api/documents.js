/* Documento analizzato sul backend:
     • GET    /api/pdf/overlay/{doc_id}         → box rilevati (con score e ranking)
     • GET    /api/pdf/search/{doc_id}          → occorrenze di una frase
     • POST   /api/pdf/download/{id}/redact     → PDF redatto lato server
     • GET    /api/pdf/analyzer/{doc_id}       → JSON per l'analizzatore (solo debug)
     • DELETE /api/pdf/{doc_id}                 → elimina subito i dati (GDPR)

   `view` = { modules[], base, baseline, ranks[] }: parametri "live" comuni a
   overlay e download, applicati dal server senza nuova analisi. `base=false`
   toglie dalla vista il modulo base (GDPR), che resta analizzato.
   ATTENZIONE: i box arrivano in punti PDF con origine IN ALTO a sinistra. */

function putView(target, { modules, base, baseline, ranks } = {}) {
  const put = (k, v) => (target instanceof FormData ? target.append(k, v) : target.set(k, v));
  if (modules) put("modules", modules.join(","));
  if (base === false) put("base", "false");
  if (baseline != null) put("baseline", String(baseline));
  if (ranks) put("ranks", ranks.join(","));
}

export function createDocumentsApi(http) {
  /* { is_scanned, message, baseline, modules, pages:[{page,width,height}],
       boxes:[{page,x0,y0,x1,y1,label,severity,text,char_start,char_end,masked,score,rank}] } */
  async function getOverlay(docId, { mode = "box", severities, debug, ...view } = {}) {
    const qs = new URLSearchParams();
    qs.set("mode", mode);
    // debug: ogni box porta `debug.clusters` (modulo, layer, processi, score…).
    if (debug) qs.set("debug", "true");
    if (severities && severities.length) qs.set("severities", severities.join(","));
    putView(qs, view);
    return http.get(`/api/pdf/overlay/${docId}?` + qs.toString());
  }

  /* Occorrenze di una frase con la geometria del rilevamento (metrica del font
     del PDF): { covered, matches:[{page, char:[s,e], text, boxes}] }.
     `covered` = pagine presenti nel server (la modalità veloce ne ha meno). */
  async function searchPhrase(docId, query) {
    return http.get(`/api/pdf/search/${docId}?q=` + encodeURIComponent(query));
  }

  /* PDF redatto lato server (hard redaction). GDPR: il server non conserva il
     PDF → va RICARICATO. `excludedRanges` = coppie [start,end] deselezionate. */
  // `purge` false: il server NON cancella subito i dati (scadono da soli).
  async function downloadPdf(docId, file, { mode = "box", severities, excludedRanges, purge = true, termsToken, manualRanges, deletedPages, ...view } = {}) {
    const form = new FormData();
    form.append("file", file);
    form.append("style", "black");
    form.append("purge", purge ? "true" : "false");
    if (termsToken) form.append("terms_token", termsToken); // accettazione dei Termini (non per gli esempi)
    form.append("mode", mode);
    putView(form, view);
    if (severities && severities.length) form.append("severities", severities.join(","));
    // Frasi a mano (intervalli di caratteri) e pagine eliminate (indici da 0): entrano nel PDF.
    if (manualRanges && manualRanges.length) form.append("manual_ranges", manualRanges.map((r) => `${r[0]}-${r[1]}`).join(","));
    if (deletedPages && deletedPages.length) form.append("deleted_pages", deletedPages.join(","));
    if (excludedRanges && excludedRanges.length) {
      form.append("excluded_ranges", excludedRanges.map((r) => `${r[0]}-${r[1]}`).join(","));
    }
    const res = await fetch(http.url(`/api/pdf/download/${docId}/redact`), { method: "POST", body: form });
    if (!res.ok) {
      // Errore leggibile (il `detail` del backend) con lo stato HTTP: 404 =
      // documento non più sul server (scaduto o server riavviato).
      let detail = res.statusText;
      try { detail = (await res.json()).detail || detail; } catch (_e) { /* non JSON */ }
      const err = new Error(detail);
      err.status = res.status;
      throw err;
    }
    return res.blob();
  }

  /* Debug: JSON con i dati per l'analizzatore dei dati (`analizzatore/`): testo, catture dei
     layer con la scomposizione dello score, hit GLiNER. Il server lo concede solo con
     `debug=true`. Lento: rigira GLiNER ed embedding a soglia bassa. Ritorna un Blob. */
  async function analysisExport(docId) {
    const res = await fetch(http.url(`/api/pdf/analyzer/${docId}?debug=true`));
    if (!res.ok) {
      let detail = res.statusText;
      try { detail = (await res.json()).detail || detail; } catch (_e) { /* non JSON */ }
      const err = new Error(detail);
      err.status = res.status;
      throw err;
    }
    return res.blob();
  }

  /* Rinnova la scadenza dei dati sul server: { expires_in, ttl } in secondi,
     null se il documento è già stato cancellato (404). */
  async function keepalive(docId) {
    const res = await fetch(http.url(`/api/pdf/${docId}/keepalive`), { method: "POST" });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  // true se i dati erano ancora presenti, false se già scaduti/eliminati.
  async function deleteDocument(docId) {
    const res = await fetch(http.url(`/api/pdf/${docId}`), { method: "DELETE" });
    if (!res.ok) throw new Error(await res.text());
    return !!(await res.json()).deleted;
  }

  return { getOverlay, searchPhrase, downloadPdf, analysisExport, deleteDocument, keepalive };
}
