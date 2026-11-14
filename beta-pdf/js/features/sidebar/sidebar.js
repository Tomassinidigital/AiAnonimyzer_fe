/* Lista laterale delle redazioni: rilevamenti IA (per tipo, per pagina o di un
   solo tipo) e redazioni manuali. Ogni rilevamento IA porta la pill del suo
   ranking. Casella = attiva/disattiva il valore ovunque; clic sulla riga = lo
   mostra sul PDF. Segue la pagina corrente del viewer. */

import { EV } from "../../core/store.js";
import { groupPages, onlyLabel, removeGroup, setAllActive, setGroupActive } from "../../domain/redactions.js";
import { rankColor, rankLabel } from "../../domain/selection.js";
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
      offset: 120, syncList: false, pick: (overlay) => overlay.querySelector(".redaction-box"),
    });
  }

  function groupRow(g, manual) {
    const row = document.createElement("div");
    row.className = "grp" + (g.active ? " active" : "");
    row.dataset.pages = groupPages(g).join(" "); // per l'allineamento alla pagina
    const onCount = g.occurrences.filter((o) => o.on).length;
    row.innerHTML = `
      <label class="grp-main">
        <input type="checkbox" ${g.active ? "checked" : ""} />
        ${lead(g, manual)}
        <span class="grp-val" title="${escapeHtml(g.value)}">${escapeHtml(truncate(g.value, 32))}</span>
      </label>
      <span class="grp-count" title="redatte / totali">${onCount}/${g.occurrences.length}</span>
      ${manual ? `<button class="grp-del" title="Rimuovi">✕</button>` : ""}`;
    row.querySelector("input[type=checkbox]").addEventListener("change", (e) => { setGroupActive(g, e.target.checked); changed(); });
    // Clic sulla riga (testo, pallino, spazio): solo posizionamento sul PDF. Il
    // <label> altrimenti attiverebbe la casella: l'oscuramento si rimuove solo
    // cliccando direttamente la casella.
    row.querySelector(".grp-main").addEventListener("click", (e) => {
      if (e.target.matches("input[type=checkbox]")) return;
      e.preventDefault();
      showGroup(g);
    });
    if (manual) row.querySelector(".grp-del").addEventListener("click", () => { removeGroup(state, g); changed(); });
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
    if (!ai.length) aiWrap.innerHTML = `<p class="empty">Nessun dato personale rilevato. Usa la ricerca o seleziona il testo.</p>`;
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

  function mount() {
    $("#btn-select-all").addEventListener("click", () => { setAllActive(state, true); changed(); });
    $("#btn-deselect-all").addEventListener("click", () => { setAllActive(state, false); changed(); });
    $("#ai-filter").addEventListener("change", (e) => { state.listFilter = e.target.value; bus.emit(EV.LIST_FILTER); });
    bus.on(EV.REDACTIONS, render);
    bus.on(EV.LIST_FILTER, render);
    bus.on(EV.PAGE_SHOWN, alignToPage);
  }

  return { mount };
}
