/* Documento analizzato sul backend:
     • GET    /api/pdf/overlay/{doc_id}         → box rilevati (con score e ranking)
     • GET    /api/pdf/search/{doc_id}          → occorrenze di una frase
     • POST   /api/pdf/download/{id}/redact     → PDF redatto lato server
     • DELETE /api/pdf/{doc_id}                 → elimina subito i dati (GDPR)

   `view` = { modules[], baseline, ranks[] }: parametri "live" comuni a overlay e
   download, applicati dal server senza nuova analisi.
   ATTENZIONE: i box arrivano in punti PDF con origine IN ALTO a sinistra. */

function putView(target, { modules, baseline, ranks } = {}) {
  const put = (k, v) => (target instanceof FormData ? target.append(k, v) : target.set(k, v));
  if (modules) put("modules", modules.join(","));
  if (baseline != null) put("baseline", String(baseline));
  if (ranks) put("ranks", ranks.join(","));
}

export function createDocumentsApi(http) {
  /* { is_scanned, message, baseline, modules, pages:[{page,width,height}],
       boxes:[{page,x0,y0,x1,y1,label,severity,text,char_start,char_end,masked,score,rank}] } */
  async function getOverlay(docId, { mode = "placeholder", severities, ...view } = {}) {
    const qs = new URLSearchParams();
    qs.set("mode", mode);
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
  async function downloadPdf(docId, file, { mode = "placeholder", severities, excludedRanges, ...view } = {}) {
    const form = new FormData();
    form.append("file", file);
    form.append("style", "black");
    form.append("mode", mode);
    putView(form, view);
    if (severities && severities.length) form.append("severities", severities.join(","));
    if (excludedRanges && excludedRanges.length) {
      form.append("excluded_ranges", excludedRanges.map((r) => `${r[0]}-${r[1]}`).join(","));
    }
    const res = await fetch(http.url(`/api/pdf/download/${docId}/redact`), { method: "POST", body: form });
    if (!res.ok) throw new Error(await res.text());
    return res.blob();
  }

  // true se i dati erano ancora presenti, false se già scaduti/eliminati.
  async function deleteDocument(docId) {
    const res = await fetch(http.url(`/api/pdf/${docId}`), { method: "DELETE" });
    if (!res.ok) throw new Error(await res.text());
    return !!(await res.json()).deleted;
  }

  return { getOverlay, searchPhrase, downloadPdf, deleteDocument };
}
