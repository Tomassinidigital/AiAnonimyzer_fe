/* Ricerca di una frase in tutto il documento (lato client).

   Normalizza gli spazi interni della query in `\s+`, così un match può
   attraversare più item / righe. Ritorna le occorrenze:
     { page: 0-based, boxes: [ {x0,y0,x1,y1}... ], snippet } */

import { rangeToBoxes } from "./geometry.js";

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function search(pagesIndex, query) {
  const norm = String(query || "").trim().replace(/\s+/g, " ");
  if (norm.length < 2) return [];
  const re = new RegExp(norm.split(" ").map(escapeRe).join("\\s+"), "gi");
  const out = [];
  pagesIndex.forEach((pi, page) => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(pi.text))) {
      const boxes = rangeToBoxes(pi, m.index, m.index + m[0].length);
      if (boxes.length) out.push({ page, boxes, snippet: m[0] });
      if (m.index === re.lastIndex) re.lastIndex++; // evita loop su match vuoti
    }
  });
  return out;
}

