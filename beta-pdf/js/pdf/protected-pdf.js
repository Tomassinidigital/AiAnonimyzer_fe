/* Generazione del PDF protetto, tutta nel browser.

   Strategia "flatten": ogni pagina viene rasterizzata ad alta risoluzione con le
   redazioni già impresse, poi reimpaginata con pdf-lib come immagine. Il testo
   sensibile (e ogni altro testo) NON è più estraibile: spariscono sia il testo
   visibile sia il livello di testo sottostante (irreversibile).

   activeOccurrences: [{ page, boxes:[{x0,y0,x1,y1,masked?,rot?}] }] in spazio PDF.
   onProgress(done, total) opzionale. opts: { deletedPages: Set, mode }. */

import { boxToViewportRect } from "./geometry.js";
import { pdfLib } from "./libs.js";
import { isMaskMode, MASK_FONT, maskFontSize } from "./masking.js";

const RASTER_SCALE = 2.2; // qualità di stampa

export async function generateProtectedPdf(docModel, activeOccurrences, onProgress, opts) {
  const PDFLib = pdfLib();
  const o = opts || {};
  const deleted = o.deletedPages instanceof Set ? o.deletedPages : new Set();
  const masking = isMaskMode(o.mode);

  const boxesByPage = new Map();
  activeOccurrences.forEach((occ) => {
    const arr = boxesByPage.get(occ.page) || [];
    occ.boxes.forEach((b) => arr.push(b));
    boxesByPage.set(occ.page, arr);
  });

  const outDoc = await PDFLib.PDFDocument.create();
  const total = docModel.pages.length;

  for (let i = 0; i < total; i++) {
    // Le pagine eliminate non entrano nel PDF finale.
    if (deleted.has(i)) { if (onProgress) onProgress(i + 1, total); continue; }
    const pageEntry = docModel.pages[i];
    const viewport = pageEntry.page.getViewport({ scale: RASTER_SCALE });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await pageEntry.page.render({ canvasContext: ctx, viewport }).promise;
    burnRedactions(ctx, boxesByPage.get(i) || [], viewport, masking);

    const img = await outDoc.embedJpg(dataUrlToBytes(canvas.toDataURL("image/jpeg", 0.9)));
    // Dimensione pagina = punti PDF originali (viewport scala 1).
    const w = pageEntry.viewport1.width, h = pageEntry.viewport1.height;
    outDoc.addPage([w, h]).drawImage(img, { x: 0, y: 0, width: w, height: h });
    if (onProgress) onProgress(i + 1, total);
  }

  outDoc.setTitle("Documento protetto — beta PDF");
  outDoc.setProducer("beta PDF (prototipo front-end)");
  return new Blob([await outDoc.save()], { type: "application/pdf" });
}

/* Imprime le redazioni (DISTRUTTIVE, prima della rasterizzazione):
   • modalità di mascheramento → copre l'originale e scrive i caratteri offuscati
     (es. "M••••"), coerente con l'anteprima;
   • altrimenti (segnaposto/redazione) → box nero pieno. */
function burnRedactions(ctx, boxes, viewport, masking) {
  ctx.textBaseline = "middle";
  boxes.forEach((b) => {
    const r = boxToViewportRect(b, viewport);
    if (masking && b.masked) {
      ctx.fillStyle = "#ffffff"; // copre il testo originale sottostante
      ctx.fillRect(r.left, r.top, r.width, r.height);
      ctx.fillStyle = "#111111";
      const rot = b.rot || 0;
      const vertical = rot === 90 || rot === 270;
      ctx.font = `600 ${maskFontSize(b.masked, r.width, r.height, rot)}px ${MASK_FONT}`;
      ctx.save();
      ctx.beginPath();
      ctx.rect(r.left, r.top, r.width, r.height);
      ctx.clip();
      // Origine al centro del box, ruotata come la pagina: il testo segue la riga.
      ctx.translate(r.left + r.width / 2, r.top + r.height / 2);
      ctx.rotate((rot * Math.PI) / 180);
      ctx.fillText(b.masked, -(vertical ? r.height : r.width) / 2 + 1, 0);
      ctx.restore();
    } else {
      ctx.fillStyle = "#000000";
      ctx.fillRect(r.left, r.top, r.width, r.height);
    }
  });
}

function dataUrlToBytes(dataUrl) {
  const bin = atob(dataUrl.split(",")[1]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
