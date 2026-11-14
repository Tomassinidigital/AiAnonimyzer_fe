/* Colonna opzioni.

   «subito» (nessuna nuova analisi, il server ricalcola dall'analisi fatta):
     moduli di rilevamento, baseline, ranking, modalità di offuscamento, gravità.
   «nuova analisi» (serve «Riesegui analisi»): verifica LLM, giudice, veloce.

   Gli elenchi di moduli, ranking e gravità arrivano dal server: un modulo o un
   livello nuovo compare senza modificare questo file. */

import { EV } from "../../core/store.js";
import { rankRanges } from "../../domain/selection.js";
import { $, $$, cap, escapeHtml } from "../../shared/dom.js";

export function createOptionsPanel({ state, bus, analysis }) {
  function buildModes() {
    const sel = $("#opt-mode");
    sel.innerHTML = "";
    (state.cfg.modes || []).forEach((m) => {
      const o = document.createElement("option");
      o.value = m.key; o.textContent = m.label; o.title = m.description || "";
      sel.appendChild(o);
    });
    sel.value = state.mode;
    sel.addEventListener("change", () => { state.mode = sel.value; analysis.refresh(); });
  }

  function buildSeverities() {
    const wrap = $("#opt-severities");
    wrap.innerHTML = "";
    const sevs = state.cfg.severities || [];
    if (!sevs.length) $("#opt-sev-field").classList.add("disabled");
    state.severities = sevs.length ? new Set(sevs.map((s) => s.key)) : null;
    sevs.forEach((s) => {
      const lab = document.createElement("label");
      lab.className = "sev-toggle";
      lab.innerHTML = `<input type="checkbox" value="${s.key}" checked><span class="sev-dot" style="background:${s.color}"></span>${escapeHtml(cap(s.key))}`;
      lab.querySelector("input").addEventListener("change", (e) => {
        if (e.target.checked) state.severities.add(s.key); else state.severities.delete(s.key);
        analysis.refresh();
      });
      wrap.appendChild(lab);
    });
  }

  // Baseline: score minimo accettabile. Classifica le catture in ranking.
  function buildBaseline() {
    const conf = $("#opt-conf");
    conf.value = state.baseline;
    $("#opt-conf-val").textContent = Number(conf.value).toFixed(2);
    conf.addEventListener("input", () => {
      $("#opt-conf-val").textContent = Number(conf.value).toFixed(2);
      updateRankRanges(parseFloat(conf.value));
    });
    conf.addEventListener("change", () => { state.baseline = parseFloat(conf.value); analysis.refresh(); });
  }

  // Ranking: una casella per livello. Spuntato = visibile E oscurato nel PDF.
  function buildRanks() {
    const wrap = $("#opt-ranks");
    wrap.innerHTML = "";
    Object.values(state.rankInfo).sort((a, b) => a.rank - b.rank).forEach((r) => {
      const lab = document.createElement("label");
      lab.className = "rank-toggle";
      lab.innerHTML = `<input type="checkbox" value="${r.rank}" ${state.ranks.has(r.rank) ? "checked" : ""}>
        <span class="rank-pill" style="background:${r.color}">${r.rank}</span>
        <span class="rank-name">${escapeHtml(r.label)}</span>
        <span class="rank-range" data-rank="${r.rank}"></span>`;
      lab.querySelector("input").addEventListener("change", (e) => {
        if (e.target.checked) state.ranks.add(r.rank); else state.ranks.delete(r.rank);
        analysis.refresh();
      });
      wrap.appendChild(lab);
    });
    updateRankRanges(state.baseline);
  }

  function updateRankRanges(baseline) {
    const text = rankRanges(baseline, state.rankStep);
    $$("#opt-ranks .rank-range").forEach((el) => { el.textContent = text[el.dataset.rank] || ""; });
  }

  // Moduli: GDPR è la base (sempre attivo); gli altri si aggiungono a richiesta.
  function buildModules() {
    const wrap = $("#opt-modules");
    const hint = $("#opt-modules-hint");
    wrap.innerHTML = "";
    if (!state.modules.length) { wrap.innerHTML = `<p class="hint-sm">Moduli non disponibili.</p>`; return; }
    state.modules.forEach((m) => {
      const lab = document.createElement("label");
      const missing = m.unavailable_layers || [];
      lab.className = "module-check" + (m.available ? "" : " off");
      lab.title = m.description || "";
      lab.innerHTML = `<input type="checkbox" value="${escapeHtml(m.key)}" ${m.base ? "checked disabled" : ""} ${m.available ? "" : "disabled"}>
        <span class="module-name">${escapeHtml(m.label)}</span>
        ${m.base ? `<span class="module-tag">sempre attivo</span>` : ""}
        ${missing.length && m.available ? `<span class="module-warn" title="Layer non disponibili: ${escapeHtml(missing.join(", "))}">⚠</span>` : ""}`;
      if (!m.base) {
        lab.querySelector("input").addEventListener("change", (e) =>
          analysis.toggleModule(m, e.target, (msg) => { hint.textContent = msg; }));
      }
      wrap.appendChild(lab);
    });
  }

  // Opzioni che richiedono una nuova analisi.
  function buildAnalysisOptions() {
    $$("#opt-verify .seg").forEach((btn) => btn.addEventListener("click", () => {
      $$("#opt-verify .seg").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.opts.verify = btn.dataset.verify === "on";
      $("#opt-approver-field").classList.toggle("hidden", !(state.opts.verify && state.approvers.length));
      analysis.markStale();
    }));
    const appSel = $("#opt-approver");
    appSel.innerHTML = "";
    state.approvers.forEach((a) => { const o = document.createElement("option"); o.value = a.key; o.textContent = a.label; appSel.appendChild(o); });
    if (state.approvers.length) state.opts.approver = state.approvers[0].key;
    appSel.addEventListener("change", () => { state.opts.approver = appSel.value; analysis.markStale(); });

    const fast = $("#opt-fast");
    fast.checked = state.opts.fast;
    fast.addEventListener("change", () => { state.opts.fast = fast.checked; analysis.markStale(); });

    $("#btn-rerun").addEventListener("click", () => { if (state.file) analysis.run(); });
  }

  function updateStaleBanner() {
    const banner = $("#stale-banner");
    if (banner) banner.classList.toggle("hidden", !(state.stale && state.docModel));
  }

  // Da chiamare dopo il caricamento della configurazione dal backend.
  function mount() {
    buildModes();
    buildSeverities();
    buildBaseline();
    buildRanks();
    buildModules();
    buildAnalysisOptions();
    // Backend giù: avviso nella colonna (i controlli restano attivi, si riprova).
    if (!state.backendUp) $("#opt-detection-note").classList.remove("hidden");
    bus.on(EV.STALE, updateStaleBanner);
  }

  return { mount };
}
