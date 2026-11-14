/* Motore PDF del client (nessuna chiamata al backend): caricamento, geometria,
   ricerca, rendering a schermo e generazione del PDF protetto. Le funzionalità
   dell'interfaccia ricevono questo oggetto da main.js. */

import { boxToViewportRect, serverBoxToClient } from "./geometry.js";
import { configurePdfJs } from "./libs.js";
import { load } from "./loader.js";
import { isMaskMode, maskFontSize } from "./masking.js";
import { generateProtectedPdf } from "./protected-pdf.js";
import { renderCanvas, renderTextLayer } from "./rendering.js";
import { search } from "./search.js";

export function createPdfEngine({ workerSrc }) {
  configurePdfJs(workerSrc);
  return {
    load,
    search,
    serverBoxToClient,
    boxToViewportRect,
    isMaskMode,
    maskFontSize,
    renderCanvas,
    renderTextLayer,
    generateProtectedPdf,
  };
}
