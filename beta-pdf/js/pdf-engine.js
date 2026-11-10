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

     Ogni item porta con sé la sua geometria nello spazio del viewport a scala 1
     (origine in alto, già ruotato come la pagina a schermo): origine della
     baseline (ox, oy), direzione del testo (ux, uy), larghezza e corpo.
     ------------------------------------------------------------------------ */
  function _buildPageIndex(textContent, viewport1) {
    const items = [];
    let text = "";
    const map = [];
    const styles = textContent.styles || {};

    textContent.items.forEach((raw) => {
      const str = raw.str || "";
      // Matrice dell'item nello spazio del viewport a scala 1: t = [a,b,c,d,e,f].
      const t = window.pdfjsLib.Util.transform(viewport1.transform, raw.transform);
      const height = Math.hypot(t[2], t[3]) || raw.height || 10; // corpo del font
      const dirLen = Math.hypot(t[0], t[1]);
      const itemIndex = items.length;
      items.push({
        str,
        ox: t[4], oy: t[5],
        ux: dirLen ? t[0] / dirLen : 1, uy: dirLen ? t[1] / dirLen : 0,
        width: raw.width, // già in unità del viewport a scala 1
        height,
        len: str.length,
        family: (styles[raw.fontName] || {}).fontFamily || "sans-serif",
        cum: null, // avanzamenti cumulativi dei caratteri (calcolati su richiesta)
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

  /* --------------------------------------------------------------------------
     Geometria dei box. Estensione verticale FISSA rispetto alla baseline
     (ascendenti/discendenti tipici) + un padding minimo uniforme: così i box
     hanno la stessa altezza per ogni parola della riga, da qualunque sorgente
     (backend o ricerca client).
     ------------------------------------------------------------------------ */
  const ASC = 0.76;  // sopra la baseline, in frazione del corpo
  const DESC = 0.22; // sotto la baseline
  const _pad = (h) => Math.max(0.8, Math.min(2, (h || 10) * 0.1)); // punti PDF

  let _measureCtx = null;
  // Frazione [0..1] della larghezza dell'item a cui inizia il carattere k.
  // Misura i glifi con il font di ripiego di PDF.js (lo stesso del text-layer):
  // molto più fedele della media "larghezza / n. caratteri" sui font proporzionali.
  function _charFrac(item, k) {
    if (!item.cum) {
      if (!_measureCtx) _measureCtx = document.createElement("canvas").getContext("2d");
      _measureCtx.font = "20px " + item.family;
      const total = _measureCtx.measureText(item.str).width;
      item.cum = [0];
      for (let c = 1; c <= item.len; c++) {
        item.cum.push(total > 0 ? _measureCtx.measureText(item.str.slice(0, c)).width / total : c / item.len);
      }
    }
    return item.cum[Math.max(0, Math.min(item.len, k))];
  }

  // Box (spazio PDF, origine in basso) della porzione [f0,f1] di un item.
  function _itemBox(pi, item, f0, f1) {
    const nx = item.uy, ny = -item.ux; // "verso l'alto" rispetto al testo
    const xs = [], ys = [];
    [f0 * item.width, f1 * item.width].forEach((a) => {
      [-DESC * item.height, ASC * item.height].forEach((b) => {
        xs.push(item.ox + item.ux * a + nx * b);
        ys.push(item.oy + item.uy * a + ny * b);
      });
    });
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: pi.pageH - Math.max(...ys), y1: pi.pageH - Math.min(...ys) };
  }

  function _padBox(b, p) { return { x0: b.x0 - p, y0: b.y0 - p, x1: b.x1 + p, y1: b.y1 + p }; }

  /* Box del BACKEND → spazio del client. Il backend li fornisce in punti della
     pagina COME VISUALIZZATA (rotazione già applicata), origine in alto a
     sinistra: basta portare l'origine in basso. */
  function serverBoxToPdf(pageEntry, b) {
    const pageH = pageEntry.viewport1.height;
    return { x0: b.x0, x1: b.x1, y0: pageH - b.y1, y1: pageH - b.y0 };
  }

  /* Allinea un box del BACKEND alla riga di testo reale: l'estensione lungo il
     testo resta quella del backend (precisa per parola), quella trasversale
     viene ricalcolata dalla baseline. Senza riga corrispondente aggiunge solo
     il padding. */
  function fitBoxToText(pi, box) {
    if (!pi) return _padBox(box, _pad());
    const out = { x0: box.x0, y0: box.y0, x1: box.x1, y1: box.y1 };
    let lo = Infinity, hi = -Infinity, h = 0, vertical = false;
    pi.items.forEach((item) => {
      if (!item.str.trim()) return;
      const horiz = Math.abs(item.ux) >= 0.99, vert = Math.abs(item.uy) >= 0.99;
      if (!horiz && !vert) return; // testo obliquo: nessun allineamento
      const tb = _itemBox(pi, item, 0, 1);
      const along = horiz ? Math.min(tb.x1, box.x1) - Math.max(tb.x0, box.x0) : Math.min(tb.y1, box.y1) - Math.max(tb.y0, box.y0);
      const mid = horiz ? (tb.y0 + tb.y1) / 2 : (tb.x0 + tb.x1) / 2;
      const inBand = horiz ? mid > box.y0 && mid < box.y1 : mid > box.x0 && mid < box.x1;
      if (along <= 0 || !inBand) return;
      vertical = vert;
      lo = Math.min(lo, horiz ? tb.y0 : tb.x0);
      hi = Math.max(hi, horiz ? tb.y1 : tb.x1);
      h = Math.max(h, item.height);
    });
    if (h) {
      if (vertical) { out.x0 = lo; out.x1 = hi; } else { out.y0 = lo; out.y1 = hi; }
    }
    return _padBox(out, _pad(h));
  }

  function _escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /* --------------------------------------------------------------------------
     Dato l'intervallo [start,end) di caratteri nella stringa di pagina, calcola
     i box (in spazio PDF) raggruppando i caratteri per item: ogni item toccato
     dal match produce un box sui soli caratteri coinvolti (vedi _charFrac).
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
    byItem.forEach((rec, it) => {
      const item = pi.items[it];
      const box = _itemBox(pi, item, _charFrac(item, rec.min), _charFrac(item, rec.max + 1));
      boxes.push(_padBox(box, _pad(item.height)));
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
    const pageH = viewport.height / scale; // altezza a schermo (tiene conto della rotazione)
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
  const MASK_FONT = "'JetBrains Mono', ui-monospace, Menlo, monospace";
  const MASK_CHAR_W = 0.62; // larghezza di un carattere monospazio, in frazione del corpo

  /* Corpo (px) del testo mascherato perché stia TUTTO nel box: limitato sia dallo
     spessore del box sia dalla sua lunghezza. Sulle pagine ruotate di 90°/270° il
     testo corre in verticale: `rot` scambia i due lati. */
  function maskFontSize(text, width, height, rot) {
    const vertical = rot === 90 || rot === 270;
    const along = vertical ? height : width, thick = vertical ? width : height;
    const n = Math.max(1, String(text || "").length);
    return Math.max(3, Math.min(thick * 0.72, (along - 2) / (n * MASK_CHAR_W)));
  }

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
    fitBoxToText,
    serverBoxToPdf,
    fullText,
    boxToViewportRect,
    maskFontSize,
    generateProtectedPdf,
    renderTextLayer,
  };
})();
