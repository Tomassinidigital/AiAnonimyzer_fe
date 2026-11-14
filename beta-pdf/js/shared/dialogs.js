/* Modali e toast (mai alert/confirm nativi del browser). */

import { $ } from "./dom.js";

/* Modale generico. `text`: stringa o array di paragrafi (testo semplice, \n = a
   capo). `buttons`: [{label, value, primary}]. Esc = primo pulsante non primario
   (annulla) o il primo pulsante. Risolve con il value scelto. */
export function dialog({ icon = "⚠", title = "", text = "", buttons }) {
  return new Promise((resolve) => {
    const modal = $("#dialog-modal"), actions = $("#dialog-actions");
    $("#dialog-icon").textContent = icon;
    $("#dialog-title").textContent = title;
    const box = $("#dialog-text"); box.innerHTML = "";
    (Array.isArray(text) ? text : [text]).forEach((t) => { const p = document.createElement("p"); p.textContent = t; box.appendChild(p); });
    actions.innerHTML = "";
    const btns = buttons && buttons.length ? buttons : [{ label: "Chiudi", value: true, primary: true }];
    const cancel = btns.find((b) => !b.primary) || btns[0];
    const close = (value) => { modal.classList.add("hidden"); document.removeEventListener("keydown", onKey, true); resolve(value); };
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); close(cancel.value); } };
    btns.forEach((b) => {
      const el = document.createElement("button");
      el.type = "button"; el.className = b.primary ? "btn-primary" : "btn-ghost"; el.textContent = b.label;
      el.addEventListener("click", () => close(b.value));
      actions.appendChild(el);
    });
    document.addEventListener("keydown", onKey, true);
    modal.classList.remove("hidden");
    (actions.querySelector(".btn-primary") || actions.firstChild).focus();
  });
}

export const notice = (title, text) => dialog({ title, text });

let toastTimer = null;
export function toast(msg) {
  let t = $("#toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 3200);
}
