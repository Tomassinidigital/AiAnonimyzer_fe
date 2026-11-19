/* Helper DOM e di formattazione condivisi (nessuno stato). */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }

// Dimensione leggibile di un file (KB / MB).
export const fmtSize = (bytes) => (bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(bytes / 1024)) + " KB");

export function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

// Fa scaricare un Blob al browser con il nome indicato.
/* Salva un file generato. Il link va NELLA pagina al momento del clic
   (Firefox e alcune versioni di Safari ignorano il clic su un link staccato) e
   l'URL resta valido a lungo: alcuni browser avviano il salvataggio in ritardo.
   Se il browser blocca comunque lo scarico (avvenuto dopo un'attesa, non più
   «azione dell'utente»), il messaggio di esito offre «Scarica di nuovo». */
export function saveBlob(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 120000);
}

// Riavvia l'animazione di evidenziazione di un elemento.
export function flash(el) {
  if (!el) return;
  el.classList.remove("flash");
  void el.offsetWidth;
  el.classList.add("flash");
}
