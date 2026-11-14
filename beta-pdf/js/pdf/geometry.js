/* Geometria dei box di redazione.

   I box sono tenuti in SPAZIO PDF (origine in basso a sinistra, unità = punti),
   identico a pdf-lib: la generazione del PDF è una copia diretta. Per l'overlay
   a schermo si convertono con il viewport di PDF.js (boxToViewportRect).

   Estensione verticale FISSA rispetto alla baseline (ascendenti/discendenti
   tipici) + un padding minimo uniforme: i box hanno la stessa altezza per ogni
   parola della riga, da qualunque sorgente (backend o ricerca client). */

const ASC = 0.76;  // sopra la baseline, in frazione del corpo
const DESC = 0.22; // sotto la baseline
const pad = (h) => Math.max(0.8, Math.min(2, (h || 10) * 0.1)); // punti PDF

let measureCtx = null;

/* Frazione [0..1] della larghezza dell'item a cui inizia il carattere k.
   Misura i glifi con il font di ripiego di PDF.js (lo stesso del text-layer):
   molto più fedele della media "larghezza / n. caratteri" sui font proporzionali. */
export function charFrac(item, k) {
  if (!item.cum) {
    if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
    measureCtx.font = "20px " + item.family;
    const total = measureCtx.measureText(item.str).width;
    item.cum = [0];
    for (let c = 1; c <= item.len; c++) {
      item.cum.push(total > 0 ? measureCtx.measureText(item.str.slice(0, c)).width / total : c / item.len);
    }
  }
  return item.cum[Math.max(0, Math.min(item.len, k))];
}

// Box (spazio PDF, origine in basso) della porzione [f0,f1] di un item.
function itemBox(pi, item, f0, f1) {
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

function padBox(b, p) { return { x0: b.x0 - p, y0: b.y0 - p, x1: b.x1 + p, y1: b.y1 + p }; }

/* Box del BACKEND → spazio PDF. Il backend li fornisce in punti della pagina
   COME VISUALIZZATA (rotazione già applicata), origine in alto a sinistra:
   basta portare l'origine in basso. */
export function serverBoxToPdf(pageEntry, b) {
  const pageH = pageEntry.viewport1.height;
  return { x0: b.x0, x1: b.x1, y0: pageH - b.y1, y1: pageH - b.y0 };
}

/* Allinea un box del BACKEND alla riga di testo reale: l'estensione lungo il
   testo resta quella del backend (precisa per parola), quella trasversale viene
   ricalcolata dalla baseline. Senza riga corrispondente aggiunge solo il padding. */
export function fitBoxToText(pi, box) {
  if (!pi) return padBox(box, pad());
  const out = { x0: box.x0, y0: box.y0, x1: box.x1, y1: box.y1 };
  let lo = Infinity, hi = -Infinity, h = 0, vertical = false;
  pi.items.forEach((item) => {
    if (!item.str.trim()) return;
    const horiz = Math.abs(item.ux) >= 0.99, vert = Math.abs(item.uy) >= 0.99;
    if (!horiz && !vert) return; // testo obliquo: nessun allineamento
    const tb = itemBox(pi, item, 0, 1);
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
  return padBox(out, pad(h));
}

/* Box del backend → box del client: spazio PDF, allineato alla riga reale con
   padding minimo, e con la rotazione della pagina (orienta il testo mascherato). */
export function serverBoxToClient(docModel, pagesIndex, b) {
  const entry = docModel.pages[b.page];
  const box = fitBoxToText(pagesIndex[b.page], serverBoxToPdf(entry, b));
  box.rot = ((entry.page.rotate % 360) + 360) % 360;
  return box;
}

/* Box (spazio PDF) dell'intervallo [start,end) di caratteri della stringa di
   pagina: un box per ogni item toccato, sui soli caratteri coinvolti. */
export function rangeToBoxes(pi, start, end) {
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
    const box = itemBox(pi, item, charFrac(item, rec.min), charFrac(item, rec.max + 1));
    boxes.push(padBox(box, pad(item.height)));
  });
  return boxes;
}

/* Box spazio-PDF → rettangolo a schermo per il viewport PDF.js dato (scala
   corrente). Il viewport ha origine in alto: la y si ribalta. */
export function boxToViewportRect(box, viewport) {
  const scale = viewport.scale;
  const pageH = viewport.height / scale; // altezza a schermo (tiene conto della rotazione)
  return {
    left: box.x0 * scale,
    top: (pageH - box.y1) * scale,
    width: (box.x1 - box.x0) * scale,
    height: (box.y1 - box.y0) * scale,
  };
}
