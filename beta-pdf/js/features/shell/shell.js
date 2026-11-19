/* Guscio dell'applicazione: viste (upload / elaborazione / editor), overlay di
   avvio, modale introduttiva, modale "backend non raggiungibile", focus rail
   della colonna opzioni, badge del backend e contatori della barra in alto. */

import { counts } from "../../domain/redactions.js";
import { EV } from "../../core/store.js";
import { $, $$ } from "../../shared/dom.js";

export function createShell({ state, bus, catalogApi }) {
  // L'editor si apre solo con un documento analizzato: l'analisi richiede l'accettazione
  // dei Termini (o un esempio). Senza documento si torna al caricamento.
  function showView(name) {
    if (name === "editor" && !state.docModel) name = "upload";
    $$(".view").forEach((v) => v.classList.toggle("active", v.dataset.view === name));
    $("#topbar").classList.toggle("hidden", name !== "editor");
  }

  function setOptionsCollapsed(c) {
    $("#options-panel").classList.toggle("hidden", c);
    $("#focus-rail").classList.toggle("hidden", !c);
    state.panels.options = !c;
    bus.emit(EV.PANELS);
  }

  // Lista delle frasi (destra): chiusa resta una barra sottile per riaprirla.
  function setSidebarCollapsed(c) {
    $("#side-panel").classList.toggle("hidden", c);
    $("#side-rail").classList.toggle("hidden", !c);
    state.panels.sidebar = !c;
    bus.emit(EV.PANELS);
  }

  const closeIntro = () => $("#intro-modal").classList.add("hidden");

  function showIntro() {
    const v = $("#intro-version");
    if (v) v.textContent = state.cfg && state.cfg.version ? "v." + state.cfg.version : "";
    $("#intro-modal").classList.remove("hidden");
  }

  function updateBackendBadge() {
    const badge = $("#mode-badge");
    if (!badge) return;
    badge.textContent = state.backendUp ? "● backend connesso" : "● backend non raggiungibile";
    badge.className = "mode-badge " + (state.backendUp ? "on" : "off");
  }

  function updateCounters() {
    const c = counts(state);
    $("#count-active").textContent = c.active;
    $("#count-groups").textContent = c.groups;
  }

  function mount() {
    // Anche se la vista viene attivata a mano (console, DOM): senza documento si richiude.
    const editor = $('[data-view="editor"]');
    new MutationObserver(() => {
      if (editor.classList.contains("active") && !state.docModel) showView("upload");
    }).observe(editor, { attributes: true, attributeFilter: ["class"] });
    $("#collapse-options").addEventListener("click", () => setOptionsCollapsed(true));
    $("#reopen-options").addEventListener("click", () => setOptionsCollapsed(false));
    $("#collapse-sidebar").addEventListener("click", () => setSidebarCollapsed(true));
    $("#reopen-sidebar").addEventListener("click", () => setSidebarCollapsed(false));
    $("#intro-ok").addEventListener("click", closeIntro);
    $("#intro-modal").addEventListener("click", (e) => { if (e.target === e.currentTarget) closeIntro(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeIntro(); });
    $("#server-down-close").addEventListener("click", () => $("#server-down-modal").classList.add("hidden"));
    $("#server-down-retry").addEventListener("click", async () => {
      if (await catalogApi.ping()) location.reload(); // backend tornato su → re-init pulito
    });
    bus.on(EV.BACKEND, updateBackendBadge);
    bus.on(EV.REDACTIONS, updateCounters);
  }

  // Fine dell'avvio: via l'overlay, poi intro o avviso "backend giù".
  function finishBoot() {
    const boot = $("#boot-overlay");
    if (boot) { boot.classList.add("fade"); setTimeout(() => boot.classList.add("hidden"), 400); }
    if (state.backendUp) showIntro(); else $("#server-down-modal").classList.remove("hidden");
  }

  return { mount, showView, finishBoot };
}
