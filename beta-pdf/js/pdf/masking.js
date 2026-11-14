/* Mascheramento per-carattere: il box mostra i caratteri offuscati (es. "M••••")
   invece della barra piena. Condiviso da anteprima e PDF generato. */

// Modalità che disegnano il testo mascherato (le altre coprono con un box pieno).
export const MASK_MODES = new Set(["initial", "last_chars", "full_mask"]);
export const MASK_FONT = "'JetBrains Mono', ui-monospace, Menlo, monospace";
const MASK_CHAR_W = 0.62; // larghezza di un carattere monospazio, in frazione del corpo

export const isMaskMode = (mode) => MASK_MODES.has(mode);

/* Corpo (px) del testo mascherato perché stia TUTTO nel box: limitato sia dallo
   spessore del box sia dalla sua lunghezza. Sulle pagine ruotate di 90°/270° il
   testo corre in verticale: `rot` scambia i due lati. */
export function maskFontSize(text, width, height, rot) {
  const vertical = rot === 90 || rot === 270;
  const along = vertical ? height : width, thick = vertical ? width : height;
  const n = Math.max(1, String(text || "").length);
  return Math.max(3, Math.min(thick * 0.72, (along - 2) / (n * MASK_CHAR_W)));
}
