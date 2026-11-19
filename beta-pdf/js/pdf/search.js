/* Ricerca di una frase in tutto il documento (lato client, ripiego per le pagine
   che il server non ha analizzato).

   Stesse regole del server (`core/pipeline/propagation.py::find_phrase`): frase
   esatta, maiuscole/minuscole distinte, PAROLA INTERA ("IVA" non trova "privata"
   né "Iva"). Tra le parole vale qualsiasi spaziatura, così un match può attraversare
   più item / righe. Ritorna le occorrenze:
     { page: 0-based, boxes: [ {x0,y0,x1,y1}... ], snippet } */

import { rangeToBoxes } from "./geometry.js";

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Carattere di parola come nel server (`str.isalnum()` o "_"): lettere e cifre Unicode.
const WORD_CHAR = /[\p{L}\p{N}_]/u;

/* Frase come la cerca il sistema: senza spazi ai bordi, spazi interni ridotti a uno. */
export function normalizePhrase(query) {
  return String(query || "").trim().replace(/\s+/g, " ");
}

// true se [start, end) non è dentro una parola più lunga ("Mario Rossi" ≠ "Mario Rossini").
function isWholeWord(text, start, end) {
  const isWord = (i) => i >= 0 && i < text.length && WORD_CHAR.test(text[i]);
  if (isWord(start) && isWord(start - 1)) return false;
  return !(isWord(end - 1) && isWord(end));
}

export function search(pagesIndex, query) {
  const norm = normalizePhrase(query);
  if (norm.length < 2) return [];
  const re = new RegExp(norm.split(" ").map(escapeRe).join("\\s+"), "g"); // niente flag "i"
  const out = [];
  pagesIndex.forEach((pi, page) => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(pi.text))) {
      const end = m.index + m[0].length;
      if (isWholeWord(pi.text, m.index, end)) {
        const boxes = rangeToBoxes(pi, m.index, end);
        if (boxes.length) out.push({ page, boxes, snippet: m[0] });
      }
      re.lastIndex = m.index + 1; // +1: trova anche le occorrenze sovrapposte
    }
  });
  return out;
}
