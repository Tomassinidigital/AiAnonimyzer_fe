/* Rendering a schermo di una pagina: canvas + text-layer selezionabile. */

import { pdfjs } from "./libs.js";

export async function renderCanvas(pageEntry, viewport) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  canvas.className = "page-canvas";
  await pageEntry.page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  return canvas;
}

export async function renderTextLayer(pageEntry, viewport) {
  const container = document.createElement("div");
  container.className = "text-layer";
  container.style.width = viewport.width + "px";
  container.style.height = viewport.height + "px";
  await pdfjs().renderTextLayer({
    textContent: pageEntry.textContent,
    container,
    viewport,
    textDivs: [],
  }).promise;
  return container;
}
