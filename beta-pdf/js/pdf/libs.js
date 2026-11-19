/* Accesso alle librerie PDF caricate in index.html come script classici
   (PDF.js → window.pdfjsLib, pdf-lib → window.PDFLib). Unico punto che le
   legge da `window`: il resto del motore riceve gli oggetti da qui. */

let workerSrc = "";
let configured = false;

export function configurePdfJs(src) { workerSrc = src; configured = false; }

export function pdfjs() {
  const lib = window.pdfjsLib;
  if (!lib) throw new Error("PDF.js non disponibile.");
  if (!configured) { lib.GlobalWorkerOptions.workerSrc = workerSrc; configured = true; }
  return lib;
}

export function pdfLib() {
  const lib = window.PDFLib;
  if (!lib) throw new Error("pdf-lib non disponibile.");
  return lib;
}
