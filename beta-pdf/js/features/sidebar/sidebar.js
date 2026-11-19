/* Lista laterale delle redazioni: rilevamenti IA (per tipo, per pagina o di un
   solo tipo) e redazioni manuali. Ogni rilevamento IA porta la pill del suo
   ranking. Casella = oscura/annulla il valore ovunque (annullato resta sul PDF
   tratteggiato), allineata al clic sui box: piena se tutte le occorrenze sono
   oscurate, indeterminata se solo alcune; clic sulla riga = lo mostra sul PDF. Segue la pagina corrente del viewer. In modalità debug ogni
   rilevamento IA ha un menu a tendina con i dati di cattura (debugDetails). */

import { EV } from "../../core/store.js";
import { groupPages, onlyLabel, removeGroup, setAllActive, setGroupActive } from "../../domain/redactions.js";
import { baselineToReach, rankColor, rankLabel, rankOf, rankRanges } from "../../domain/selection.js";
import { $, escapeHtml, truncate } from "../../shared/dom.js";

export function createSidebar({ state, bus, viewer }) {
  const changed = () => bus.emit(EV.REDACTIONS, { record: true });

  function lead(g, manual) {
    // Rilevamenti IA: pill col numero del ranking. Redazioni manuali: pallino.
    if (!manual && g.rank) {
      return `<span class="rank-pill" style="background:${rankColor(state, g.rank)}" title="Ranking ${g.rank} · ${escapeHtml(rankLabel(state, g.rank))}">${g.rank}</span>`;
    }
    return `<span class="grp-dot" style="background:${g.color}"></span>`;
  }

  function showGroup(g) {
    const first = g.occurrences[0]; if (!first) return;
    viewer.reveal(first.page, first.boxes[0], {
      offset: 120, syncList: false, pick: (overlay) => overlay.querySelector(`.redaction-box[data-g="${g.id}"][data-o="0"]`),
    });
    bus.emit(EV.FOCUS_GROUP, { gid: g.id, oi: 0 }); // marquee sul box selezionato
  }

  const num = (v, d = 3) => (v == null ? "—" : Number(v).toFixed(d));
  const yes = (v) => (v ? "sì" : "no");

  /* Ranking della frase: in quale cade lo score finale con la baseline attuale,
     se è tra quelli visibili, e con quale baseline passerebbe in ciascuno. */
  function rankingHtml(score) {
    const step = state.rankStep, T = state.baseline;
    const cur = rankOf(score, T, step);
    const ranges = rankRanges(T, step), reach = baselineToReach(score, step);
    const rows = [1, 2, 3, 4].map((k) => `
      <tr class="${k === cur ? "rep" : ""}">
        <td><span class="rank-pill sm" style="background:${rankColor(state, k)}">${k}</span> ${escapeHtml(rankLabel(state, k))}</td>
        <td>${ranges[k]}</td><td>${reach[k]}</td><td>${state.ranks.has(k) ? "sì" : "no"}</td>
      </tr>`).join("");
    return `
      <dt>Ranking</dt><dd><b>${cur}</b> (${escapeHtml(rankLabel(state, cur))}) con baseline ${num(T, 2)} ·
        ${state.ranks.has(cur) ? "visibile, oscurato" : "nascosto: ranking non attivo"}</dd>
      </dl>
      <table class="dbg-contrib dbg-rank">
        <thead><tr><th>Ranking</th><th>Score (baseline ${num(T, 2)})</th><th>Baseline per entrarci</th><th>Attivo</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <dl>`;
  }

  /* Una traccia di fusione: chi ha catturato la frase e come si arriva allo
     score finale. `c` = cluster dal backend (overlay con debug=true). */
  function clusterHtml(c) {
    const outcome = c.kept ? "tenuto" : (c.discarded_reason || "scartato");
    const rows = (c.contributions || []).map((x) => `
      <tr class="${x.is_representative ? "rep" : ""}">
        <td>${escapeHtml(x.layer)}</td><td>${escapeHtml(x.process)}</td>
        <td>${escapeHtml(x.entity_type)}</td><td class="n">${num(x.score)}</td>
        <td>${yes(x.validated)}</td><td title="${escapeHtml(x.text)}">${escapeHtml(truncate(x.text, 24))}</td>
      </tr>`).join("");
    const judge = c.verifier_score != null || c.llm_vote != null
      ? `<dt>Giudice LLM</dt><dd>voto ${num(c.llm_vote, 2)} · score ${num(c.verifier_score)}</dd>` : "";
    const prompt = c.llm_prompt
      ? `<details class="dbg-prompt"><summary>Prompt del giudice</summary><pre>${escapeHtml(c.llm_prompt)}</pre></details>` : "";
    return `
      <div class="dbg-cluster">
        <dl>
          <dt>Modulo</dt><dd>${escapeHtml(c.module || "—")}</dd>
          <dt>Tipo</dt><dd>${escapeHtml(c.entity_type)} (${escapeHtml(c.label || "")}) · gravità ${escapeHtml(c.severity || "—")}</dd>
          <dt>Testo</dt><dd>«${escapeHtml(c.text)}» [${c.start}–${c.end}]</dd>
          <dt>Score</dt><dd>base ${num(c.base_score)} + accordo ${num(c.agreement_boost)} → <b>${num(c.final_score)}</b></dd>
          <dt>Layer d'accordo</dt><dd>${c.agreement_count}</dd>
          <dt>Soglia</dt><dd>${num(c.threshold, 2)} · superata: ${yes(c.passed_threshold)}</dd>
          <dt>Formato valido</dt><dd>${yes(c.valid)} · validato: ${yes(c.validated)}</dd>
          <dt>Esito</dt><dd>${escapeHtml(outcome)}</dd>
          ${judge}
          ${rankingHtml(c.final_score)}
        </dl>
        ${c.exact === false ? `<p class="dbg-note">Frase unita tra moduli: tracce delle parti sovrapposte.</p>` : ""}
        <table class="dbg-contrib">
          <thead><tr><th>Layer</th><th>Processo</th><th>Tipo</th><th>Score</th><th>Valid.</th><th>Testo</th></tr></thead>
          <tbody>${rows || `<tr><td colspan="6">—</td></tr>`}</tbody>
        </table>
        ${prompt}
      </div>`;
  }

  // Menu di debug di un gruppo: una sezione per occorrenza (pagina + tracce).
  function debugDetails(g) {
    const det = document.createElement("details");
    det.className = "grp-debug";
    const occ = g.occurrences.filter((o) => o.debug);
    const body = occ.length
      ? occ.map((o) => `
          <div class="dbg-occ">
            <div class="dbg-occ-head">Pagina ${o.page + 1} · score ${num(o.score)} · ranking ${o.rank}</div>
            ${(o.debug.clusters || []).map(clusterHtml).join("") || `<p class="dbg-note">Nessuna traccia per questa frase.</p>`}
          </div>`).join("")
      : `<p class="dbg-note">Dati di debug non disponibili.</p>`;
    det.innerHTML = `<summary>Debug</summary>${body}`;
    return det;
  }

  function groupRow(g, manual) {
    const row = document.createElement("div");
    row.className = "grp" + (g.active ? " active" : "");
    row.dataset.g = g.id; // per posizionarsi sulla frase selezionata nel PDF
    row.dataset.pages = groupPages(g).join(" "); // per l'allineamento alla pagina
    const onCount = g.occurrences.filter((o) => o.on).length;
    const allOn = onCount > 0 && onCount === g.occurrences.length;
    row.innerHTML = `
      <label class="grp-main">
        <input type="checkbox" ${allOn ? "checked" : ""} />
        ${lead(g, manual)}
        <span class="grp-val" title="${escapeHtml(g.value)}">${escapeHtml(truncate(g.value, 32))}</span>
      </label>
      <span class="grp-count" title="redatte / totali">${onCount}/${g.occurrences.length}</span>
      ${manual ? `<button class="grp-del" title="Rimuovi">✕</button>` : ""}`;
    const box = row.querySelector("input[type=checkbox]");
    // Solo alcune occorrenze oscurate (clic sui box): stato indeterminato; il
    // clic sulla casella le oscura tutte.
    box.indeterminate = onCount > 0 && !allOn;
    box.addEventListener("change", (e) => { setGroupActive(g, e.target.checked); changed(); });
    // Clic sulla riga (testo, pallino, spazio): solo posizionamento sul PDF. Il
    // <label> altrimenti attiverebbe la casella: l'oscuramento si annulla solo
    // cliccando direttamente la casella.
    row.querySelector(".grp-main").addEventListener("click", (e) => {
      if (e.target.matches("input[type=checkbox]")) return;
      e.preventDefault();
      showGroup(g);
    });
    if (manual) row.querySelector(".grp-del").addEventListener("click", () => { removeGroup(state, g); changed(); });
    if (!manual && state.debug) row.appendChild(debugDetails(g));
    return row;
  }

  function section(title, dotColor, countText, groups, pages) {
    const el = document.createElement("div");
    el.className = "cat";
    if (pages != null) el.dataset.pages = String(pages);
    el.innerHTML = `<div class="cat-head"><span class="dot" style="background:${dotColor}"></span><b>${escapeHtml(title)}</b><span class="cat-count">${countText}</span></div>`;
    groups.forEach((g) => el.appendChild(groupRow(g)));
    return el;
  }

  function renderByType(wrap, ai) {
    const only = onlyLabel(state.listFilter);
    const byLabel = new Map();
    ai.forEach((g) => { if (only && g.label !== only) return; const a = byLabel.get(g.label) || []; a.push(g); byLabel.set(g.label, a); });
    if (!byLabel.size) wrap.innerHTML = `<p class="empty">Nessun elemento per questo filtro.</p>`;
    byLabel.forEach((groups) => {
      const total = groups.reduce((n, g) => n + g.occurrences.length, 0);
      wrap.appendChild(section(groups[0].labelIt, groups[0].color, `${groups.length} valori · ${total} occorrenze`, groups));
    });
  }

  // Sezioni per pagina: ogni pagina elenca i valori con occorrenze su quella pagina.
  function renderByPage(wrap, ai) {
    const n = state.docModel ? state.docModel.pages.length : 0;
    let any = false;
    for (let p = 0; p < n; p++) {
      const groups = ai.filter((g) => g.occurrences.some((o) => o.page === p));
      if (!groups.length) continue;
      any = true;
      const cnt = groups.reduce((k, g) => k + g.occurrences.filter((o) => o.page === p).length, 0);
      wrap.appendChild(section(`Pagina ${p + 1}`, "#94a3b8", `${cnt} occorrenze`, groups, p));
    }
    if (!any) wrap.innerHTML = `<p class="empty">Nessun elemento.</p>`;
  }

  // Selettore del filtro (Per tipo / Per pagina / Solo <tipo>).
  function renderFilter(ai) {
    const sel = $("#ai-filter");
    if (!sel) return;
    const counts = new Map(), names = new Map();
    ai.forEach((g) => { counts.set(g.label, (counts.get(g.label) || 0) + g.occurrences.length); names.set(g.label, g.labelIt); });
    const typeOpts = Array.from(counts.entries())
      .map(([lab, c]) => `<option value="only:${escapeHtml(lab)}">${escapeHtml(names.get(lab))} (${c})</option>`).join("");
    sel.innerHTML = `<option value="type">Per tipo</option><option value="page">Per pagina</option>` +
      (typeOpts ? `<optgroup label="Solo tipo">${typeOpts}</optgroup>` : "");
    sel.value = state.listFilter;
    if (sel.value !== state.listFilter) { state.listFilter = "type"; sel.value = "type"; } // filtro non più valido
  }

  function render() {
    const aiWrap = $("#ai-list"), manualWrap = $("#manual-list");
    aiWrap.innerHTML = ""; manualWrap.innerHTML = "";
    const ai = state.groups.filter((g) => g.source === "ai");
    renderFilter(ai);
    if (!ai.length) aiWrap.innerHTML = `<p class="empty">Nessun dato personale rilevato. Ricorri alla ricerca o seleziona il testo nel documento.</p>`;
    else if (state.listFilter === "page") renderByPage(aiWrap, ai);
    else renderByType(aiWrap, ai);

    const manual = state.groups.filter((g) => g.source === "manual");
    if (!manual.length) manualWrap.innerHTML = `<p class="empty">Nessuna redazione manuale.</p>`;
    else manual.forEach((g) => manualWrap.appendChild(groupRow(g, true)));
  }

  /* Allinea la lista alla pagina corrente: scorre finché la prima sezione/riga
     con occorrenze su quella pagina (data-pages) è in cima. */
  function alignToPage({ page, syncList }) {
    if (!syncList) return;
    const scroller = document.querySelector(".sidebar .side-block.grow");
    const target = scroller && scroller.querySelector(`[data-pages~="${page}"]`);
    if (!target) return;
    const delta = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    scroller.scrollTo({ top: scroller.scrollTop + delta, behavior: "smooth" });
  }

  /* Frase selezionata nel PDF (clic sul box, ▲▼): la lista scorre finché la
     sua riga è al centro e la evidenzia per un istante. */
  function focusGroup({ gid }) {
    const scroller = document.querySelector(".sidebar .side-block.grow");
    const row = scroller && scroller.querySelector(`.grp[data-g="${gid}"]`);
    if (!row) return; // frase esclusa dal filtro della lista
    const box = scroller.getBoundingClientRect(), r = row.getBoundingClientRect();
    const delta = r.top - box.top - (box.height - r.height) / 2;
    scroller.scrollTo({ top: scroller.scrollTop + delta, behavior: "smooth" });
    row.classList.remove("focus");
    void row.offsetWidth; // riavvia l'animazione se la stessa riga è già evidenziata
    row.classList.add("focus");
  }

  function mount() {
    bus.on(EV.FOCUS_GROUP, focusGroup);
    $("#btn-select-all").addEventListener("click", () => { setAllActive(state, true); changed(); });
    $("#btn-deselect-all").addEventListener("click", () => { setAllActive(state, false); changed(); });
    $("#ai-filter").addEventListener("change", (e) => { state.listFilter = e.target.value; bus.emit(EV.LIST_FILTER); });
    bus.on(EV.REDACTIONS, render);
    bus.on(EV.LIST_FILTER, render);
    bus.on(EV.PAGE_SHOWN, alignToPage);
  }

  return { mount };
}
