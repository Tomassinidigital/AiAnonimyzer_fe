/* Guscio dell'applicazione: viste (upload / elaborazione / editor), overlay di
   avvio, modale introduttiva, modale "backend non raggiungibile", focus rail
   della colonna opzioni, badge del backend e contatori della barra in alto. */

import { counts } from "../../domain/redactions.js";
import { EV } from "../../core/store.js";
import { $, $$ } from "../../shared/dom.js";

export function createShell({ state, bus, catalogApi }) {
  function showView(name) {
    $$(".view").forEach((v) => v.classList.toggle("active", v.dataset.view === name));
    $("#topbar").classList.toggle("hidden", name !== "editor");
    const srv = $("#btn-download-server");
    if (srv) srv.classList.remove("hidden"); // redazione server sempre disponibile
  }

  function setOptionsCollapsed(c) {
    $("#options-panel").classList.toggle("hidden", c);
    $("#focus-rail").classList.toggle("hidden", !c);
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
    $("#collapse-options").addEventListener("click", () => setOptionsCollapsed(true));
    $("#reopen-options").addEventListener("click", () => setOptionsCollapsed(false));
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
