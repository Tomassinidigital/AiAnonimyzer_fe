/* Dopo il punto si va a capo se la frase successiva sta in UNA sola riga.

   Ogni paragrafo indicato viene diviso in frasi (<span class="sent">, i grassetti e i link
   restano dentro la propria frase). Una frase dopo la prima va su una riga propria (classe
   `own`) solo se, misurata senza a capo, entra nella larghezza del paragrafo; altrimenti
   continua di seguito. La misura dipende dalla larghezza (desktop, telefono), quindi si
   rifà al ridimensionamento. */

import { $$ } from "./dom.js";

const SELECTOR = ".hero-sub, .protect-item p, .protect-note, .feat p, .flow-step p";
// Fine frase: punto, ! o ? (con eventuale « » di chiusura) seguito da spazio e da una maiuscola.
const BOUNDARY = /([.!?]["»”]?)\s+(?=[A-ZÀ-ÖØ-Þ«"“])/;
// Testo che precede il punto: una lettera sola ("P", "N") o un'abbreviazione comune.
const ABBREVIATION = /(?:^|[\s(])(?:[A-Za-zÀ-ÿ]|art|artt|dott|ing|arch|geom|prof|sig|avv|dr|nn|pag|cfr|ecc|ss|sgg)$/i;
const ENDS_SENTENCE = /[.!?]["»”]?\s*$/;
const STARTS_UPPER = /^[A-ZÀ-ÖØ-Þ«"“]/;

const newSentence = () => { const s = document.createElement("span"); s.className = "sent"; return s; };

// Divide il paragrafo in frasi una volta sola (senza perdere i tag interni).
function wrapSentences(el) {
  if (el.dataset.sentences) return;
  el.dataset.sentences = "1";
  const sentences = [];
  let current = newSentence();
  Array.from(el.childNodes).forEach((node) => {
    if (node.nodeType !== Node.TEXT_NODE) { current.append(node); return; }
    const parts = node.textContent.split(BOUNDARY); // [testo, punteggiatura, testo, punteggiatura, …]
    for (let i = 0; i < parts.length; i += 2) {
      current.append(parts[i] + (parts[i + 1] || ""));
      if (parts[i + 1] === undefined) continue;
      // «P. IVA», «art. 6», «dott. Rossi»: un'abbreviazione non chiude la frase.
      if (ABBREVIATION.test(parts[i])) { current.append(" "); continue; }
      sentences.push(current); current = newSentence();
    }
    // La frase finisce a fine testo e la successiva inizia in un tag (es. un link).
    const next = node.nextSibling;
    if (ENDS_SENTENCE.test(node.textContent) && next && next.nodeType === Node.ELEMENT_NODE
        && STARTS_UPPER.test(next.textContent.trim())) {
      sentences.push(current); current = newSentence();
    }
  });
  sentences.push(current);
  const nodes = [];
  sentences.forEach((s, i) => { if (i) nodes.push(" "); nodes.push(s); });
  el.replaceChildren(...nodes);
}

function layout(el) {
  const sentences = Array.from(el.querySelectorAll(":scope > .sent"));
  sentences.forEach((s) => s.classList.remove("own"));
  const style = getComputedStyle(el);
  const width = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  if (width <= 0) return; // nascosto: si rifà quando compare
  sentences.slice(1).forEach((s) => {
    s.style.whiteSpace = "nowrap";
    const fits = s.getBoundingClientRect().width <= width + 0.5;
    s.style.whiteSpace = "";
    if (fits) s.classList.add("own");
  });
}

export function balanceSentences(root = document) {
  const els = $$(SELECTOR, root);
  els.forEach(wrapSentences);
  els.forEach(layout);
}

// Da chiamare una volta: rifà i calcoli al ridimensionamento e a caricamento dei font.
export function watchSentences() {
  let frame = 0;
  const redo = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => balanceSentences()); };
  window.addEventListener("resize", redo);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(redo);
  balanceSentences();
}
