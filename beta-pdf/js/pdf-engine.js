/* ============================================================================
   beta PDF — Motore PDF (SOLO front-end)
   ----------------------------------------------------------------------------
   Ricrea fedelmente la parte client di redactpdf.io, SENZA alcuna logica di
   back office: niente upload a server, niente modelli AI remoti, niente task
   API. Tutto avviene nel browser.

   Responsabilità di questo modulo:
     • Rendering delle pagine con PDF.js (canvas + text-layer selezionabile).
     • Indicizzazione del testo di ogni pagina con mappatura carattere→glifo,
       così una frase può essere cercata in TUTTO il documento e localizzata
       geometricamente (bounding box in coordinate PDF).
     • Ricerca "search in tutto il documento" di una frase → elenco di
       occorrenze, ognuna con i propri box.
     • Generazione del "PDF protetto": ogni pagina viene rasterizzata con i box
       neri già impressi e riassemblata con pdf-lib. Così il livello di testo
       sottostante NON è più presente nel file (redazione irreversibile), come
       promette il prodotto di riferimento.

   Le coordinate dei box sono tenute in SPAZIO PDF (origine in basso a sinistra,
   unità = punti), identico a pdf-lib: la generazione diventa una copia diretta.
   Per l'overlay a schermo si convertono con il viewport di PDF.js.
   ========================================================================== */
(function () {
  "use strict";

  const PDFJS_VER = "3.11.174";
  let _pdfjs = null;

  function _lib() {
    if (!_pdfjs) {
      _pdfjs = window.pdfjsLib;
      if (_pdfjs) {
        _pdfjs.GlobalWorkerOptions.workerSrc =
          `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VER}/pdf.worker.min.js`;
      }
    }
    return _pdfjs;
  }

  /* --------------------------------------------------------------------------
     Caricamento del documento. Ritorna { pdf, numPages, pages } dove ogni
     `pages[i]` è { page, viewport1, index } con `index` = indice del testo per
     la ricerca (vedi _buildPageIndex). Il viewport a scala 1 serve da sistema
     di riferimento stabile (punti PDF).
     ------------------------------------------------------------------------ */
  async function load(arrayBuffer) {
    const pdfjs = _lib();
    if (!pdfjs) throw new Error("PDF.js non disponibile.");
    // getDocument consuma l'ArrayBuffer: passiamo una copia così l'originale
    // resta intatto per la generazione con pdf-lib.
    const data = arrayBuffer.slice(0);
    const pdf = await pdfjs.getDocument({ data }).promise;
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport1 = page.getViewport({ scale: 1 });
      const textContent = await page.getTextContent();
      const index = _buildPageIndex(textContent, viewport1);
      pages.push({ page, viewport1, textContent, index, pageNumber: i });
    }
    return { pdf, numPages: pdf.numPages, pages };
  }

  /* --------------------------------------------------------------------------
     Indice di ricerca per una pagina.

     Concateniamo lo `str` di ogni item inserendo UNO spazio separatore tra un
     item e il successivo (i gap tipografici diventano spazi). Manteniamo un
     array `map` parallelo alla stringa: per ogni carattere reale segna
     { it: indice item, c: offset nel testo dell'item }; i separatori inseriti
     hanno map = null. Questo permette, dato un intervallo [start,end) trovato
     nella stringa, di risalire ai glifi coinvolti e ai loro box.

     Ogni item porta con sé la sua geometria in SPAZIO PDF (origine in basso a
     sinistra): x0 = e, baseline = f, larghezza = width, altezza = height.
     ------------------------------------------------------------------------ */
  function _buildPageIndex(textContent, viewport1) {
    const items = [];
    let text = "";
    const map = [];

    textContent.items.forEach((raw) => {
      const str = raw.str || "";
      // Trasformiamo la matrice dell'item nello spazio del viewport a scala 1.
      // Con rotazione 0 equivale ai punti PDF, con origine in basso a sinistra.
      const t = window.pdfjsLib.Util.transform(viewport1.transform, raw.transform);
      // t = [a,b,c,d,e,f]. Altezza del glifo ≈ modulo della colonna verticale.
      const height = Math.hypot(t[2], t[3]) || raw.height || 10;
      const width = raw.width; // già in unità del viewport a scala 1
      // Il viewport ha origine in alto: convertiamo la baseline (t[5]) in
      // coordinate con origine in basso per uniformarci a pdf-lib.
      const pageH = viewport1.height;
      const baselineBottom = pageH - t[5];
      const x0 = t[4];
      const itemIndex = items.length;
      items.push({
        str,
        x0,
        baseline: baselineBottom, // y della baseline, origine in basso
        width,
        height,
        len: str.length,
      });

      // Se c'è già del testo, inseriamo un separatore (spazio) non mappato.
      if (text.length > 0) {
        text += " ";
        map.push(null);
      }
      for (let c = 0; c < str.length; c++) {
        text += str[c];
        map.push({ it: itemIndex, c });
      }
    });

    return { text, lower: text.toLowerCase(), map, items, pageH: viewport1.height, pageW: viewport1.width };
  }

  function _escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /* --------------------------------------------------------------------------
     Dato l'intervallo [start,end) di caratteri nella stringa di pagina, calcola
     i box (in spazio PDF) raggruppando i caratteri per item: ogni item toccato
     dal match produce un box proporzionale ai caratteri coinvolti (i glifi non
     monospaziati sono approssimati per proporzione: fedeltà più che sufficiente
     per un prototipo, e comunque coprente).
     ------------------------------------------------------------------------ */
  function _rangeToBoxes(pi, start, end) {
    const byItem = new Map(); // itemIndex -> {min, max}
    for (let k = start; k < end; k++) {
      const m = pi.map[k];
      if (!m) continue; // separatore inserito
      const rec = byItem.get(m.it);
      if (!rec) byItem.set(m.it, { min: m.c, max: m.c });
      else { rec.min = Math.min(rec.min, m.c); rec.max = Math.max(rec.max, m.c); }
    }
    const boxes = [];
    const PAD_Y = 0.22; // scende un po' sotto la baseline (discendenti)
    byItem.forEach((rec, it) => {
      const item = pi.items[it];
      const len = Math.max(1, item.len);
      const fx = item.width / len; // larghezza media per carattere
      const bx0 = item.x0 + rec.min * fx;
      const bx1 = item.x0 + (rec.max + 1) * fx;
      const by0 = item.baseline - item.height * PAD_Y;
      const by1 = item.baseline + item.height * (1 - PAD_Y);
      boxes.push({ x0: bx0, y0: by0, x1: bx1, y1: by1 });
    });
    return boxes;
  }

  /* --------------------------------------------------------------------------
     RICERCA IN TUTTO IL DOCUMENTO.
     Normalizza gli spazi interni della query in `\s+`, così un match può
     attraversare più item / righe. Ritorna un array di occorrenze:
       { page: 0-based, boxes: [ {x0,y0,x1,y1}... ], snippet }
     ------------------------------------------------------------------------ */
  function search(pagesIndex, query) {
    const norm = String(query || "").trim().replace(/\s+/g, " ");
    if (norm.length < 2) return [];
    const parts = norm.split(" ").map(_escapeRe);
    const re = new RegExp(parts.join("\\s+"), "gi");
    const out = [];
    pagesIndex.forEach((pi, page) => {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(pi.text))) {
        const start = m.index;
        const end = start + m[0].length;
        const boxes = _rangeToBoxes(pi, start, end);
        if (boxes.length) out.push({ page, boxes, snippet: m[0] });
        if (m.index === re.lastIndex) re.lastIndex++; // evita loop su match vuoti
      }
    });
    return out;
  }

  /* --------------------------------------------------------------------------
     Testo completo del documento (per il rilevamento euristico dei PII).
     Ritorna { text, perPage:[...] } con separatori di pagina.
     ------------------------------------------------------------------------ */
  function fullText(pagesIndex) {
    const perPage = pagesIndex.map((pi) => pi.text);
    return { text: perPage.join("\n"), perPage };
  }

  /* --------------------------------------------------------------------------
     Conversione box spazio-PDF → rettangolo canvas per l'overlay a schermo,
     dato un viewport PDF.js (scala corrente). Il viewport ha origine in alto,
     quindi ribaltiamo la y.
     ------------------------------------------------------------------------ */
  function boxToViewportRect(box, viewport) {
    const scale = viewport.scale;
    const pageH = viewport.viewBox[3] - viewport.viewBox[1];
    // box.y è con origine in basso: top canvas = (pageH - y1) * scale
    const left = box.x0 * scale;
    const top = (pageH - box.y1) * scale;
    const width = (box.x1 - box.x0) * scale;
    const height = (box.y1 - box.y0) * scale;
    return { left, top, width, height };
  }

  /* --------------------------------------------------------------------------
     GENERAZIONE DEL PDF PROTETTO (solo front-end).

     Strategia "flatten": ogni pagina viene rasterizzata su canvas ad alta
     risoluzione con i box neri già disegnati sopra, poi reimpaginata con
     pdf-lib come immagine. Risultato: il testo sensibile (e ogni altro testo)
     NON è più estraibile dal file — il livello di testo ricercabile sparisce,
     esattamente come dichiara il prodotto di riferimento ("rimuove sia il testo
     visibile sia il livello di testo sottostante… irreversibile").

     activeOccurrences: array di { page, boxes:[{x0,y0,x1,y1}] } in spazio PDF.
     onProgress(done, total) opzionale.
     ------------------------------------------------------------------------ */
  const MASK_MODES = new Set(["initial", "last_chars", "full_mask"]);

  async function generateProtectedPdf(docModel, activeOccurrences, onProgress, opts) {
    const PDFLib = window.PDFLib;
    if (!PDFLib) throw new Error("pdf-lib non disponibile.");
    const RASTER_SCALE = 2.2; // qualità di stampa
    const o = opts || {};
    const deleted = o.deletedPages instanceof Set ? o.deletedPages : new Set();
    const masking = MASK_MODES.has(o.mode); // offuscamento con caratteri mascherati

    // Raggruppa i box per pagina.
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

      // Imprime le redazioni (DISTRUTTIVE, prima della rasterizzazione):
      //  • modalità di mascheramento → copre l'originale e ci scrive i caratteri
      //    offuscati (es. "M••••"), coerente con l'anteprima;
      //  • altrimenti (segnaposto/redazione) → box nero pieno.
      const boxes = boxesByPage.get(i) || [];
      ctx.textBaseline = "middle";
      boxes.forEach((b) => {
        const r = boxToViewportRect(b, viewport);
        if (masking && b.masked) {
          ctx.fillStyle = "#ffffff"; // copre il testo originale sottostante
          ctx.fillRect(r.left, r.top, r.width, r.height);
          ctx.fillStyle = "#111111";
          const fs = Math.max(6, Math.min(r.height * 0.82, r.height));
          ctx.font = `${fs}px Helvetica, Arial, sans-serif`;
          ctx.save();
          ctx.beginPath();
          ctx.rect(r.left, r.top, r.width, r.height);
          ctx.clip();
          ctx.fillText(b.masked, r.left + 1, r.top + r.height / 2);
          ctx.restore();
        } else {
          ctx.fillStyle = "#000000";
          ctx.fillRect(r.left, r.top, r.width, r.height);
        }
      });

      const jpg = canvas.toDataURL("image/jpeg", 0.9);
      const jpgBytes = _dataUrlToBytes(jpg);
      const img = await outDoc.embedJpg(jpgBytes);
      // Dimensione pagina = punti PDF originali (viewport scala 1).
      const w = pageEntry.viewport1.width;
      const h = pageEntry.viewport1.height;
      const outPage = outDoc.addPage([w, h]);
      outPage.drawImage(img, { x: 0, y: 0, width: w, height: h });

      if (onProgress) onProgress(i + 1, total);
    }

    outDoc.setTitle("Documento protetto — beta PDF");
    outDoc.setProducer("beta PDF (prototipo front-end)");
    const bytes = await outDoc.save();
    return new Blob([bytes], { type: "application/pdf" });
  }

  function _dataUrlToBytes(dataUrl) {
    const b64 = dataUrl.split(",")[1];
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  async function renderTextLayer(pageEntry, viewport, container) {
    const pdfjs = _lib();
    container.innerHTML = "";
    container.style.width = viewport.width + "px";
    container.style.height = viewport.height + "px";
    await pdfjs.renderTextLayer({
      textContent: pageEntry.textContent,
      container,
      viewport,
      textDivs: [],
    }).promise;
  }

  window.BetaPdfEngine = {
    load,
    search,
    fullText,
    boxToViewportRect,
    generateProtectedPdf,
    renderTextLayer,
  };
})();
