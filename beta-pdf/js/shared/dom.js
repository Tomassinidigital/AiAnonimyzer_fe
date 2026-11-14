/* Helper DOM e di formattazione condivisi (nessuno stato). */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }

export function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

// Fa scaricare un Blob al browser con il nome indicato.
export function saveBlob(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// Riavvia l'animazione di evidenziazione di un elemento.
export function flash(el) {
  if (!el) return;
  el.classList.remove("flash");
  void el.offsetWidth;
  el.classList.add("flash");
}
