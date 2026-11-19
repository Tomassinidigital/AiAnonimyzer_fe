/* Caricamento del PDF con PDF.js e indice del testo di ogni pagina.

   `load` ritorna { pdf, numPages, pages } dove ogni `pages[i]` è
   { page, viewport1, textContent, index, pageNumber }: il viewport a scala 1 è il
   sistema di riferimento stabile (punti PDF), `index` serve alla ricerca. */

import { pdfjs } from "./libs.js";

export async function load(arrayBuffer) {
  const lib = pdfjs();
  // getDocument consuma l'ArrayBuffer: passiamo una copia così l'originale
  // resta intatto per la generazione con pdf-lib.
  const pdf = await lib.getDocument({ data: arrayBuffer.slice(0) }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport1 = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent();
    const index = buildPageIndex(lib, textContent, viewport1);
    pages.push({ page, viewport1, textContent, index, pageNumber: i });
  }
  return { pdf, numPages: pdf.numPages, pages };
}

/* Indice di ricerca per una pagina.

   Concatena lo `str` di ogni item inserendo UNO spazio separatore tra un item e
   il successivo (i gap tipografici diventano spazi). L'array `map` è parallelo
   alla stringa: per ogni carattere reale segna { it: indice item, c: offset nel
   testo dell'item }; i separatori inseriti hanno map = null. Così, dato un
   intervallo [start,end) trovato nella stringa, si risale ai glifi e ai box.

   Ogni item porta la sua geometria nello spazio del viewport a scala 1 (origine
   in alto, già ruotato come a schermo): origine della baseline (ox, oy),
   direzione del testo (ux, uy), larghezza e corpo. */
function buildPageIndex(lib, textContent, viewport1) {
  const items = [];
  let text = "";
  const map = [];
  const styles = textContent.styles || {};

  textContent.items.forEach((raw) => {
    const str = raw.str || "";
    // Matrice dell'item nello spazio del viewport a scala 1: t = [a,b,c,d,e,f].
    const t = lib.Util.transform(viewport1.transform, raw.transform);
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
    if (text.length > 0) { text += " "; map.push(null); } // separatore non mappato
    for (let c = 0; c < str.length; c++) { text += str[c]; map.push({ it: itemIndex, c }); }
  });

  return { text, lower: text.toLowerCase(), map, items, pageH: viewport1.height, pageW: viewport1.width };
}
