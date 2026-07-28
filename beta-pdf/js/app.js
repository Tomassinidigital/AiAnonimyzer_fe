/* ============================================================================
   AiAnonimyzer — Orchestratore UI (editor beta)
   ----------------------------------------------------------------------------
   Usa SEMPRE il backend del progetto: il rilevamento dei PII è quello REALE
   (upload → job → overlay, vedi api.js). La colonna opzioni pilota i parametri
   reali (profilo/layer, confidenza, verifica LLM, modalità, gravità).

   Editing diretto delle frasi (ricerca client in tutto il documento) e
   generazione del PDF protetto lato client (flatten che rimuove il livello di
   testo e include anche le redazioni manuali). Il backend deve essere
   raggiungibile: se serve un host diverso, imposta window.BETA_API_BASE.
   ========================================================================== */
(function () {
  "use strict";

  const RENDER_SCALE = 1.45;
  const E = window.BetaPdfEngine;
  const Api = window.BetaApi;

  // Profili → set di layer (identici al frontend principale).
  const LAYER_PRESETS = {
    gdpr: ["rules", "ner", "ner_comuni"],
    gdpr_plus: ["rules", "ner", "ner_comuni", "embedding", "baseline"],
    gare: ["rules", "ner", "ner_comuni", "embedding", "baseline", "zero_shot"],
  };
  const PRESET_HINTS = {
    gdpr: "Regole + checksum, NER GDPR, NER Comuni/Città.",
    gdpr_plus: "GDPR + Similarità semantica e Presidio generalista.",
    gare: "Tutti i layer tranne l'LLM generativo.",
    debug: "Seleziona manualmente i singoli layer qui sotto.",
  };

  const S = {
    backendUp: false,
    cfg: null, // ui-config
    layers: [],
    approvers: [],
    docModel: null,
    pagesIndex: [],
    docId: null, // id lato backend
    file: null, // Blob/File corrente (per rieseguire l'analisi)
    fileName: "documento",
    groups: [],
    pageRenders: [],
    seq: 1,
    stale: false,
    // Opzioni correnti
    opts: { preset: "gdpr", layers: LAYER_PRESETS.gdpr.slice(), fast: true, minConfidence: null, verify: false, approver: "" },
    mode: "placeholder",
    severities: null, // Set delle gravità abilitate (null = tutte)
    sevColors: {},
    // Toolbar: zoom, pagina corrente, pagine eliminate, cronologia undo/redo.
    zoom: 1,
    currentPage: 0,
    deletedPages: new Set(),
    history: [],
    hIndex: -1,
    // Sidebar: filtro lista ("type" | "page" | "only:<label>") e navigazione redazioni.
    listFilter: "type",
    navList: [],
    navIdx: -1,
  };

  const ZOOM_BASE = RENDER_SCALE;
  const ZOOM_MIN = 0.5, ZOOM_MAX = 3;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* =============================== Boot =============================== */
  document.addEventListener("DOMContentLoaded", async () => {
    bindUpload();
    bindTopbar();
    bindSearch();
    bindShell();
    await probeBackend();
    buildOptionsColumn();
    finishBoot();
  });

  /* ===================== Shell: boot · intro · server-down · focus rail ===================== */
  function bindShell() {
    // Focus rail: comprime/riapre la colonna opzioni.
    $("#collapse-options").addEventListener("click", () => setOptionsCollapsed(true));
    $("#reopen-options").addEventListener("click", () => setOptionsCollapsed(false));
    // Modale introduttiva.
    $("#intro-ok").addEventListener("click", closeIntro);
    $("#intro-modal").addEventListener("click", (e) => { if (e.target === e.currentTarget) closeIntro(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeIntro(); });
    // Modale backend non raggiungibile.
    $("#server-down-close").addEventListener("click", () => $("#server-down-modal").classList.add("hidden"));
    $("#server-down-retry").addEventListener("click", async () => {
      const cfg = Api ? await Api.ping() : null;
      if (cfg) location.reload(); // backend tornato su → re-init pulito
    });
  }

  function setOptionsCollapsed(c) {
    $("#options-panel").classList.toggle("hidden", c);
    $("#focus-rail").classList.toggle("hidden", !c);
  }

  function finishBoot() {
    const boot = $("#boot-overlay");
    if (boot) { boot.classList.add("fade"); setTimeout(() => boot.classList.add("hidden"), 400); }
    if (S.backendUp) showIntro(); else showServerDown();
  }
  function showIntro() {
    const v = $("#intro-version");
    if (v) v.textContent = S.cfg && S.cfg.version ? "v." + S.cfg.version : "";
    $("#intro-modal").classList.remove("hidden");
  }
  function closeIntro() { $("#intro-modal").classList.add("hidden"); }
  function showServerDown() { $("#server-down-modal").classList.remove("hidden"); }

  async function probeBackend() {
    const cfg = Api ? await Api.ping() : null;
    S.backendUp = !!cfg;
    S.cfg = cfg || defaultConfig();
    S.opts.minConfidence = S.cfg.default_min_confidence ?? null;
    (S.cfg.severities || []).forEach((s) => (S.sevColors[s.key] = s.color));
    S.mode = (S.cfg.modes && S.cfg.modes[0] && S.cfg.modes[0].key) || "placeholder";
    if (S.backendUp) {
      [S.layers, S.approvers] = await Promise.all([Api.getLayers(), Api.getApprovers().then((a) => a.approvers || [])]);
    }
    updateBackendBadge();
  }

  function updateBackendBadge() {
    const badge = $("#mode-badge");
    if (!badge) return;
    badge.textContent = S.backendUp ? "● backend connesso" : "● backend non raggiungibile";
    badge.className = "mode-badge " + (S.backendUp ? "on" : "off");
  }

  function defaultConfig() {
    return {
      version: "beta", default_min_confidence: 0.82,
      modes: [{ key: "placeholder", label: "Segnaposto tipizzato", description: "Copre con un box." }],
      severities: [],
    };
  }

  /* =============================== Upload =============================== */
  function bindUpload() {
    const drop = $("#dropzone");
    const input = $("#file-input");
    $("#btn-pick").addEventListener("click", () => input.click());
    input.addEventListener("change", () => { if (input.files[0]) handleFile(input.files[0]); });
    ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("drag"); }));
    ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("drag"); }));
    drop.addEventListener("drop", (e) => { const f = e.dataTransfer.files[0]; if (f) handleFile(f); });
    $("#btn-sample").addEventListener("click", async () => {
      try {
        const res = await fetch("sample/documento_gara_fake.pdf");
        const blob = await res.blob();
        S.fileName = "documento_gara_fake";
        handleFile(new File([blob], "documento_gara_fake.pdf", { type: "application/pdf" }));
      } catch (err) { alert("Impossibile caricare l'esempio: " + err.message); }
    });
  }

  function handleFile(file) {
    if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) { alert("Carica un file PDF."); return; }
    S.fileName = (file.name || "documento").replace(/\.pdf$/i, "");
    S.file = file;
    // Nuovo documento: azzera zoom, pagina ed eliminazioni.
    S.zoom = 1; S.currentPage = 0; S.deletedPages = new Set();
    runAnalysis();
  }

  /* Avvia (o riavvia) l'analisi con le opzioni correnti. */
  async function runAnalysis() {
    showView("processing");
    const bar = $("#proc-bar > span");
    const label = $("#proc-label");
    S.stale = false;

    try {
      label.textContent = "Caricamento e analisi lato server…";
      S.docId = await Api.analyze(S.file, S.opts, (frac, msg) => {
        bar.style.width = Math.max(8, Math.round(frac * 100)) + "%";
        if (msg) label.textContent = msg;
      });
      S.backendUp = true; updateBackendBadge();
      // Renderizza dall'originale servito dal backend.
      const buf = await (await fetch(Api.rawPdfUrl(S.docId))).arrayBuffer();
      S.docModel = await E.load(buf);
      S.pagesIndex = S.docModel.pages.map((p) => p.index);
      await loadServerGroups();
    } catch (err) {
      S.backendUp = false; updateBackendBadge();
      alert("Backend non raggiungibile: impossibile analizzare il documento.\n\n" + err.message);
      showView(S.docModel ? "editor" : "upload");
      return;
    }
    bar.style.width = "100%";
    label.textContent = "Fatto.";
    setTimeout(enterEditor, 250);
  }

  /* Costruisce i gruppi "ai" dai box dell'overlay del BACKEND. I box arrivano in
     punti PDF con origine in alto: qui li convertiamo in origine in basso
     (coerente col motore client e con pdf-lib). Le occorrenze con stesso
     char_start/char_end (redazione multi-riga) sono unite. */
  async function loadServerGroups() {
    const overlay = await Api.getOverlay(S.docId, { mode: S.mode, severities: sevArray() });
    const manual = S.groups.filter((g) => g.source === "manual");
    S.groups = [];
    if (overlay.is_scanned) { S.scanned = true; S.scannedMsg = overlay.message || "PDF scansionato (solo immagine): overlay non disponibile."; S.groups.push(...manual); return; }
    const pageH = {};
    (overlay.pages || []).forEach((p) => (pageH[p.page] = p.height));
    const occMap = new Map();
    S.scanned = false;
    (overlay.boxes || []).forEach((b) => {
      const H = pageH[b.page] || 0;
      // top→bottom + testo mascherato per la modalità corrente (per il rendering).
      const cb = { x0: b.x0, y0: H - b.y1, x1: b.x1, y1: H - b.y0, masked: b.masked || "", severity: b.severity || "" };
      const key = b.page + "|" + b.char_start + "|" + b.char_end;
      let o = occMap.get(key);
      if (!o) { o = { page: b.page, boxes: [], text: b.text || "", label: b.label || "—", severity: b.severity || "", char: [b.char_start, b.char_end] }; occMap.set(key, o); }
      o.boxes.push(cb);
    });
    const gMap = new Map();
    occMap.forEach((o) => {
      const gk = o.label + "|" + o.text.toLowerCase();
      let g = gMap.get(gk);
      if (!g) { g = makeGroup("ai", o.label, prettyLabel(o.label), S.sevColors[o.severity] || "#334155", o.text || o.label, []); g.severity = o.severity; gMap.set(gk, g); }
      g.occurrences.push({ page: o.page, boxes: o.boxes, on: true, char: o.char, severity: o.severity });
    });
    S.groups = Array.from(gMap.values());
    S.groups.push(...manual);
  }

  function prettyLabel(l) {
    const map = { PERSONA: "Nome e cognome", EMAIL: "Indirizzo e-mail", PEC: "PEC", TELEFONO: "Numero di telefono", CF: "Codice fiscale", IBAN: "IBAN / dati bancari", INDIRIZZO: "Indirizzo fisico", IVA: "Partita IVA" };
    return map[l] || (l.charAt(0) + l.slice(1).toLowerCase()).replace(/_/g, " ");
  }

  function makeGroup(source, label, labelIt, color, value, occurrences) {
    return { id: S.seq++, source, label, labelIt: labelIt || label, color: color || "#334155", value, occurrences: occurrences || [], active: true };
  }

  function sevArray() { return S.severities ? Array.from(S.severities) : null; }

  /* =============================== Editor =============================== */
  async function enterEditor() {
    showView("editor");
    await renderAllPages();
    renderOverlays();
    renderSidebar();
    bindSelectionToRedaction();
    setupToolbar();
    seedHistory();
    updateStaleUi();
  }

  /* ======================= Toolbar (pagine · zoom · undo/redo) ======================= */
  function setupToolbar() {
    $("#tb-page-tot").textContent = S.docModel.pages.length;
    if (!S._toolbarBound) {
      S._toolbarBound = true;
      $("#tb-undo").addEventListener("click", undo);
      $("#tb-redo").addEventListener("click", redo);
      $("#tb-zoom-in").addEventListener("click", () => setZoom(S.zoom + 0.15));
      $("#tb-zoom-out").addEventListener("click", () => setZoom(S.zoom - 0.15));
      $("#tb-zoom-level").addEventListener("click", fitWidth);
      $("#tb-prev-page").addEventListener("click", () => gotoPage(S.currentPage - 1));
      $("#tb-next-page").addEventListener("click", () => gotoPage(S.currentPage + 1));
      $("#tb-prev-red").addEventListener("click", () => navGo(-1));
      $("#tb-next-red").addEventListener("click", () => navGo(1));
      $("#tb-del-page").addEventListener("click", toggleDeletePage);
      $("#viewer").addEventListener("scroll", syncCurrentPage, { passive: true });
      document.addEventListener("keydown", onKey);
    }
    updateZoomLabel();
    updatePageControls();
  }

  function updateZoomLabel() { $("#tb-zoom-level").textContent = Math.round(S.zoom * 100) + "%"; }

  async function setZoom(z) {
    z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(z * 100) / 100));
    if (z === S.zoom) return;
    S.zoom = z;
    updateZoomLabel();
    const anchor = S.currentPage;
    await renderAllPages();
    renderOverlays();
    updatePageControls();
    scrollToPage(anchor, "auto");
  }

  function fitWidth() {
    if (!S.docModel) return;
    const viewer = $("#viewer");
    const avail = viewer.clientWidth - 56; // padding
    const pageW = S.docModel.pages[S.currentPage].viewport1.width;
    setZoom(avail / pageW / ZOOM_BASE);
  }

  function gotoPage(i) {
    i = Math.max(0, Math.min(S.docModel.pages.length - 1, i));
    scrollToPage(i, "smooth");
  }

  function scrollToPage(i, behavior) {
    const pr = S.pageRenders[i];
    if (!pr) return;
    $("#viewer").scrollTo({ top: pr.wrapper.offsetTop - 16, behavior: behavior || "smooth" });
    S.currentPage = i;
    updatePageControls();
  }

  function syncCurrentPage() {
    const viewer = $("#viewer");
    const mid = viewer.scrollTop + viewer.clientHeight / 2;
    let best = 0;
    for (let i = 0; i < S.pageRenders.length; i++) {
      const w = S.pageRenders[i].wrapper;
      if (w.offsetTop <= mid) best = i; else break;
    }
    if (best !== S.currentPage) { S.currentPage = best; updatePageControls(); }
  }

  function updatePageControls() {
    $("#tb-page-cur").textContent = S.currentPage + 1;
    $("#tb-prev-page").disabled = S.currentPage <= 0;
    $("#tb-next-page").disabled = S.currentPage >= S.docModel.pages.length - 1;
    const del = S.deletedPages.has(S.currentPage);
    const btn = $("#tb-del-page");
    btn.textContent = del ? "♻ Ripristina pagina" : "🗑 Elimina pagina";
    btn.classList.toggle("tb-danger", !del);
  }

  function toggleDeletePage() {
    const i = S.currentPage;
    if (S.deletedPages.has(i)) S.deletedPages.delete(i); else S.deletedPages.add(i);
    S.pageRenders[i].wrapper.classList.toggle("deleted", S.deletedPages.has(i));
    renderOverlays(); // rimuove/ripristina i box sulla pagina, aggiorna i contatori
    updatePageControls();
    pushHistory();
  }

  function onKey(e) {
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;
    if (!$("[data-view=editor]").classList.contains("active")) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (mod && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
    else if (e.key === "+" || e.key === "=") { setZoom(S.zoom + 0.15); }
    else if (e.key === "-") { setZoom(S.zoom - 0.15); }
  }

  /* ---- Cronologia undo/redo: snapshot dello stato di redazione + pagine ---- */
  function snapshot() {
    return {
      groups: S.groups.map((g) => ({ ...g, occurrences: g.occurrences.map((o) => ({ ...o, boxes: o.boxes })) })),
      deleted: Array.from(S.deletedPages),
    };
  }
  function seedHistory() { S.history = [snapshot()]; S.hIndex = 0; updateUndoRedo(); }
  function pushHistory() {
    S.history = S.history.slice(0, S.hIndex + 1);
    S.history.push(snapshot());
    if (S.history.length > 50) S.history.shift();
    S.hIndex = S.history.length - 1;
    updateUndoRedo();
  }
  function restore(snap) {
    // Clona i gruppi (i box sono condivisi: sola lettura, non mutati).
    S.groups = snap.groups.map((g) => ({ ...g, occurrences: g.occurrences.map((o) => ({ ...o })) }));
    const newDeleted = new Set(snap.deleted);
    // Aggiorna la classe "deleted" solo dove cambia.
    S.pageRenders.forEach((pr, i) => pr.wrapper.classList.toggle("deleted", newDeleted.has(i)));
    S.deletedPages = newDeleted;
    renderOverlays();
    renderSidebar();
    updatePageControls();
  }
  function undo() { if (S.hIndex <= 0) return; S.hIndex--; restore(S.history[S.hIndex]); updateUndoRedo(); }
  function redo() { if (S.hIndex >= S.history.length - 1) return; S.hIndex++; restore(S.history[S.hIndex]); updateUndoRedo(); }
  function updateUndoRedo() {
    $("#tb-undo").disabled = S.hIndex <= 0;
    $("#tb-redo").disabled = S.hIndex >= S.history.length - 1;
  }

  async function renderAllPages() {
    const host = $("#viewer");
    const fab = host.querySelector("#selection-fab");
    host.innerHTML = "";
    if (fab) host.appendChild(fab);
    // PDF scansionato: nessun testo estraibile → nessun rilevamento automatico.
    if (S.scanned) {
      const bn = document.createElement("div");
      bn.className = "scan-banner";
      bn.textContent = "⚠ " + (S.scannedMsg || "PDF scansionato: rilevamento automatico non disponibile. Puoi comunque oscurare manualmente selezionando il testo o disegnando redazioni.");
      host.appendChild(bn);
    }
    S.pageRenders = [];
    const scale = ZOOM_BASE * S.zoom;
    for (let i = 0; i < S.docModel.pages.length; i++) {
      const entry = S.docModel.pages[i];
      const viewport = entry.page.getViewport({ scale });
      const wrapper = document.createElement("div");
      wrapper.className = "page-wrapper" + (S.deletedPages.has(i) ? " deleted" : "");
      wrapper.style.width = viewport.width + "px";
      wrapper.style.height = viewport.height + "px";
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      canvas.className = "page-canvas";
      wrapper.appendChild(canvas);
      await entry.page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      const textLayer = document.createElement("div");
      textLayer.className = "text-layer";
      wrapper.appendChild(textLayer);
      await E.renderTextLayer(entry, viewport, textLayer);
      const overlay = document.createElement("div");
      overlay.className = "redaction-layer";
      wrapper.appendChild(overlay);
      const badge = document.createElement("div");
      badge.className = "page-badge";
      badge.textContent = "Pag. " + (i + 1) + " / " + S.docModel.pages.length;
      wrapper.appendChild(badge);
      host.appendChild(wrapper);
      S.pageRenders.push({ wrapper, overlay, viewport, page: i });
    }
  }

  const MASK_MODES = new Set(["initial", "last_chars", "full_mask"]);

  function renderOverlays() {
    S.pageRenders.forEach((pr) => (pr.overlay.innerHTML = ""));
    const maskMode = MASK_MODES.has(S.mode);
    S.groups.forEach((g) => {
      if (!g.active) return;
      g.occurrences.forEach((occ) => {
        if (S.deletedPages.has(occ.page)) return; // niente box sulle pagine eliminate
        const pr = S.pageRenders[occ.page];
        if (!pr) return;
        const oi = g.occurrences.indexOf(occ);
        occ.boxes.forEach((b) => {
          const r = E.boxToViewportRect(b, pr.viewport);
          const div = document.createElement("div");
          // Modalità di mascheramento: il box mostra i caratteri offuscati (es.
          // "M••••") invece della barra piena — l'offuscamento diventa visibile.
          const masking = occ.on && maskMode && b.masked;
          div.className = "redaction-box" + (occ.on ? "" : " ghost") + (masking ? " masked" : "");
          div.dataset.g = g.id; div.dataset.o = oi; // per la navigazione ▲▼
          let css = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;`;
          if (!occ.on) css += `--ghost:${g.color};`;
          else if (masking) css += `font-size:${Math.max(7, Math.min(r.height * 0.72, 20))}px;`;
          div.style.cssText = css;
          if (masking) div.textContent = b.masked;
          div.title = (occ.on ? "Redatto" : "Non redatto") + " · " + g.labelIt + " — clic per " + (occ.on ? "annullare" : "ripristinare");
          div.addEventListener("click", (e) => { e.stopPropagation(); occ.on = !occ.on; renderOverlays(); renderSidebar(); pushHistory(); });
          pr.overlay.appendChild(div);
        });
      });
    });
    updateCounters();
    refreshNav();
  }

  /* ============== Navigazione redazioni (▲▼) — rispetta il filtro ============== */
  function buildNavList() {
    const onlyLabel = S.listFilter.startsWith("only:") ? S.listFilter.slice(5) : null;
    const list = [];
    S.groups.forEach((g) => {
      if (!g.active) return;
      if (onlyLabel && g.label !== onlyLabel) return;
      g.occurrences.forEach((occ, oi) => {
        if (!occ.on || S.deletedPages.has(occ.page) || !occ.boxes.length) return;
        const top = Math.max(...occ.boxes.map((b) => b.y1)); // origine in basso: y1 = alto
        const left = Math.min(...occ.boxes.map((b) => b.x0));
        list.push({ gid: g.id, oi, page: occ.page, top, left });
      });
    });
    // Ordine di lettura: pagina, poi dall'alto in basso, poi da sinistra.
    list.sort((a, b) => a.page - b.page || b.top - a.top || a.left - b.left);
    return list;
  }

  function refreshNav() {
    S.navList = buildNavList();
    if (S.navIdx >= S.navList.length) S.navIdx = S.navList.length - 1;
    updateNavCounter();
  }

  function updateNavCounter() {
    const tot = S.navList.length;
    $("#tb-red-cur").textContent = S.navIdx >= 0 ? S.navIdx + 1 : "–";
    $("#tb-red-tot").textContent = tot || "–";
    $("#tb-prev-red").disabled = tot === 0 || S.navIdx <= 0;
    $("#tb-next-red").disabled = tot === 0 || S.navIdx >= tot - 1;
  }

  function navGo(delta) {
    const n = S.navList.length;
    if (!n) return;
    S.navIdx = S.navIdx < 0 ? (delta > 0 ? 0 : n - 1) : Math.max(0, Math.min(n - 1, S.navIdx + delta));
    const e = S.navList[S.navIdx];
    focusOcc(e.gid, e.oi);
    updateNavCounter();
  }

  function focusOcc(gid, oi) {
    const g = S.groups.find((x) => x.id === gid); if (!g) return;
    const occ = g.occurrences[oi]; if (!occ) return;
    const pr = S.pageRenders[occ.page]; if (!pr) return;
    const r = E.boxToViewportRect(occ.boxes[0], pr.viewport);
    $("#viewer").scrollTo({ top: pr.wrapper.offsetTop + r.top - 150, behavior: "smooth" });
    const el = pr.overlay.querySelector(`.redaction-box[data-g="${gid}"][data-o="${oi}"]`);
    if (el) { el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); }
  }

  /* ===================== Editing diretto delle frasi ===================== */
  function bindSearch() {
    $("#search-form").addEventListener("submit", (e) => { e.preventDefault(); addManualGroup($("#search-input").value); $("#search-input").value = ""; });
    $("#btn-select-all").addEventListener("click", () => setAllActive(true));
    $("#btn-deselect-all").addEventListener("click", () => setAllActive(false));
    $("#ai-filter").addEventListener("change", (e) => {
      S.listFilter = e.target.value; S.navIdx = -1;
      renderSidebar(); refreshNav();
    });
  }

  function addManualGroup(phrase) {
    const val = String(phrase || "").trim();
    if (val.length < 2) { toast("Digita almeno 2 caratteri."); return; }
    if (!S.pagesIndex.length) { toast("Carica prima un documento."); return; }
    const occ = E.search(S.pagesIndex, val);
    if (!occ.length) { toast(`Nessuna occorrenza di «${truncate(val, 30)}» nel documento.`); return; }
    const existing = S.groups.find((g) => g.source === "manual" && g.value.toLowerCase() === val.toLowerCase());
    if (existing) { existing.active = true; existing.occurrences.forEach((o) => (o.on = true)); }
    else S.groups.unshift(makeGroup("manual", "MANUAL", "Redazione manuale", "#111827", val, occ.map((o) => ({ ...o, on: true }))));
    renderOverlays(); renderSidebar(); pushHistory();
    toast(`«${truncate(val, 24)}» → ${occ.length} occorrenz${occ.length === 1 ? "a" : "e"}.`);
  }

  function bindSelectionToRedaction() {
    const viewer = $("#viewer");
    const fab = $("#selection-fab");
    let lastText = "";
    viewer.addEventListener("mouseup", () => {
      setTimeout(() => {
        const sel = window.getSelection();
        const txt = sel && sel.toString().trim();
        if (!txt || txt.length < 2 || !viewer.contains(sel.anchorNode)) { fab.classList.add("hidden"); return; }
        lastText = txt;
        const range = sel.getRangeAt(0).getBoundingClientRect();
        const host = viewer.getBoundingClientRect();
        fab.style.left = (range.left - host.left + viewer.scrollLeft + range.width / 2) + "px";
        fab.style.top = (range.top - host.top + viewer.scrollTop - 44) + "px";
        fab.querySelector(".fab-text").textContent = truncate(txt, 22);
        fab.classList.remove("hidden");
      }, 10);
    });
    fab.addEventListener("mousedown", (e) => e.preventDefault());
    fab.addEventListener("click", () => { addManualGroup(lastText); fab.classList.add("hidden"); window.getSelection().removeAllRanges(); });
    document.addEventListener("scroll", () => fab.classList.add("hidden"), true);
  }

  /* =============================== Sidebar =============================== */
  function renderSidebar() {
    const aiWrap = $("#ai-list");
    const manualWrap = $("#manual-list");
    aiWrap.innerHTML = ""; manualWrap.innerHTML = "";
    const ai = S.groups.filter((g) => g.source === "ai");
    buildAiFilter(ai);

    if (!ai.length) {
      aiWrap.innerHTML = `<p class="empty">Nessun dato personale rilevato. Usa la ricerca o seleziona il testo.</p>`;
    } else if (S.listFilter === "page") {
      renderByPage(aiWrap, ai);
    } else {
      const onlyLabel = S.listFilter.startsWith("only:") ? S.listFilter.slice(5) : null;
      const byLabel = new Map();
      ai.forEach((g) => { if (onlyLabel && g.label !== onlyLabel) return; const a = byLabel.get(g.label) || []; a.push(g); byLabel.set(g.label, a); });
      if (!byLabel.size) aiWrap.innerHTML = `<p class="empty">Nessun elemento per questo filtro.</p>`;
      byLabel.forEach((groups) => {
        const g0 = groups[0];
        const section = document.createElement("div");
        section.className = "cat";
        const total = groups.reduce((n, g) => n + g.occurrences.length, 0);
        section.innerHTML = `<div class="cat-head"><span class="dot" style="background:${g0.color}"></span><b>${escapeHtml(g0.labelIt)}</b><span class="cat-count">${groups.length} valori · ${total} occorrenze</span></div>`;
        groups.forEach((g) => section.appendChild(groupRow(g)));
        aiWrap.appendChild(section);
      });
    }

    const manual = S.groups.filter((g) => g.source === "manual");
    if (!manual.length) manualWrap.innerHTML = `<p class="empty">Nessuna redazione manuale.</p>`;
    else manual.forEach((g) => manualWrap.appendChild(groupRow(g, true)));
    updateCounters();
  }

  // Sezioni per pagina: ogni pagina elenca i valori con occorrenze su quella pagina.
  function renderByPage(wrap, ai) {
    const N = S.docModel ? S.docModel.pages.length : 0;
    let any = false;
    for (let p = 0; p < N; p++) {
      const groups = ai.filter((g) => g.occurrences.some((o) => o.page === p));
      if (!groups.length) continue;
      any = true;
      const cnt = groups.reduce((n, g) => n + g.occurrences.filter((o) => o.page === p).length, 0);
      const section = document.createElement("div");
      section.className = "cat";
      section.innerHTML = `<div class="cat-head"><span class="dot" style="background:#94a3b8"></span><b>Pagina ${p + 1}</b><span class="cat-count">${cnt} occorrenze</span></div>`;
      groups.forEach((g) => section.appendChild(groupRow(g)));
      wrap.appendChild(section);
    }
    if (!any) wrap.innerHTML = `<p class="empty">Nessun elemento.</p>`;
  }

  // Popola il selettore di filtro (Per tipo / Per pagina / Solo <tipo>).
  function buildAiFilter(ai) {
    const sel = $("#ai-filter");
    if (!sel) return;
    const counts = new Map(); const labelIt = new Map();
    ai.forEach((g) => { counts.set(g.label, (counts.get(g.label) || 0) + g.occurrences.length); labelIt.set(g.label, g.labelIt); });
    const typeOpts = Array.from(counts.entries())
      .map(([lab, c]) => `<option value="only:${escapeHtml(lab)}">${escapeHtml(labelIt.get(lab))} (${c})</option>`).join("");
    sel.innerHTML = `<option value="type">Per tipo</option><option value="page">Per pagina</option>` +
      (typeOpts ? `<optgroup label="Solo tipo">${typeOpts}</optgroup>` : "");
    sel.value = S.listFilter;
    if (sel.value !== S.listFilter) { S.listFilter = "type"; sel.value = "type"; } // filtro non più valido
  }

  function groupRow(g, manual) {
    const row = document.createElement("div");
    row.className = "grp" + (g.active ? " active" : "");
    const onCount = g.occurrences.filter((o) => o.on).length;
    row.innerHTML = `
      <label class="grp-main">
        <input type="checkbox" ${g.active ? "checked" : ""} />
        <span class="grp-dot" style="background:${g.color}"></span>
        <span class="grp-val" title="${escapeHtml(g.value)}">${escapeHtml(truncate(g.value, 32))}</span>
      </label>
      <span class="grp-count" title="redatte / totali">${onCount}/${g.occurrences.length}</span>
      ${manual ? `<button class="grp-del" title="Rimuovi">✕</button>` : ""}`;
    row.querySelector('input[type=checkbox]').addEventListener("change", (e) => { g.active = e.target.checked; if (g.active) g.occurrences.forEach((o) => (o.on = true)); renderOverlays(); renderSidebar(); pushHistory(); });
    row.querySelector(".grp-val").addEventListener("click", () => scrollToGroup(g));
    if (manual) row.querySelector(".grp-del").addEventListener("click", () => { S.groups = S.groups.filter((x) => x !== g); renderOverlays(); renderSidebar(); pushHistory(); });
    return row;
  }

  function scrollToGroup(g) {
    const first = g.occurrences[0]; if (!first) return;
    const pr = S.pageRenders[first.page]; if (!pr) return;
    const r = E.boxToViewportRect(first.boxes[0], pr.viewport);
    $("#viewer").scrollTo({ top: pr.wrapper.offsetTop + r.top - 120, behavior: "smooth" });
    const box = pr.overlay.querySelector(".redaction-box");
    if (box) { box.classList.remove("flash"); void box.offsetWidth; box.classList.add("flash"); }
  }

  function setAllActive(on) { S.groups.forEach((g) => { g.active = on; if (on) g.occurrences.forEach((o) => (o.on = true)); }); renderOverlays(); renderSidebar(); pushHistory(); }

  function updateCounters() {
    let active = 0, groups = 0;
    S.groups.forEach((g) => { if (!g.active) return; const on = g.occurrences.filter((o) => o.on && !S.deletedPages.has(o.page)).length; if (on) groups++; active += on; });
    $("#count-active").textContent = active;
    $("#count-groups").textContent = groups;
    [$("#btn-download"), $("#btn-download-side")].forEach((b) => (b.disabled = active === 0));
  }

  function activeOccurrences() {
    const out = [];
    S.groups.forEach((g) => { if (!g.active) return; g.occurrences.forEach((o) => { if (o.on && !S.deletedPages.has(o.page)) out.push({ page: o.page, boxes: o.boxes }); }); });
    return out;
  }

  /* ======================= Colonna opzioni ======================= */
  function buildOptionsColumn() {
    // Modalità di offuscamento
    const modeSel = $("#opt-mode");
    modeSel.innerHTML = "";
    (S.cfg.modes || []).forEach((m) => { const o = document.createElement("option"); o.value = m.key; o.textContent = m.label; o.title = m.description || ""; modeSel.appendChild(o); });
    modeSel.value = S.mode;
    modeSel.addEventListener("change", () => { S.mode = modeSel.value; onLiveChange(); });

    // Gravità
    const sevWrap = $("#opt-severities");
    sevWrap.innerHTML = "";
    const sevs = S.cfg.severities || [];
    if (!sevs.length) { $("#opt-sev-field").classList.add("disabled"); }
    S.severities = sevs.length ? new Set(sevs.map((s) => s.key)) : null;
    sevs.forEach((s) => {
      const lab = document.createElement("label");
      lab.className = "sev-toggle";
      lab.innerHTML = `<input type="checkbox" value="${s.key}" checked><span class="sev-dot" style="background:${s.color}"></span>${escapeHtml(cap(s.key))}`;
      lab.querySelector("input").addEventListener("change", (e) => { if (e.target.checked) S.severities.add(s.key); else S.severities.delete(s.key); onLiveChange(); });
      sevWrap.appendChild(lab);
    });

    // Confidenza minima
    const conf = $("#opt-conf");
    conf.value = S.opts.minConfidence ?? 0.82;
    $("#opt-conf-val").textContent = Number(conf.value).toFixed(2);
    conf.addEventListener("input", () => { $("#opt-conf-val").textContent = Number(conf.value).toFixed(2); });
    conf.addEventListener("change", () => { S.opts.minConfidence = parseFloat(conf.value); markStale(); });

    // Profilo
    $$("#opt-preset .seg").forEach((btn) => btn.addEventListener("click", () => {
      $$("#opt-preset .seg").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      applyPreset(btn.dataset.preset);
    }));
    applyPreset(S.opts.preset, true);
    buildLayerList();

    // Verifica LLM
    $$("#opt-verify .seg").forEach((btn) => btn.addEventListener("click", () => {
      $$("#opt-verify .seg").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      S.opts.verify = btn.dataset.verify === "on";
      $("#opt-approver-field").classList.toggle("hidden", !(S.opts.verify && S.approvers.length));
      markStale();
    }));
    const appSel = $("#opt-approver");
    appSel.innerHTML = "";
    S.approvers.forEach((a) => { const o = document.createElement("option"); o.value = a.key; o.textContent = a.label; appSel.appendChild(o); });
    if (S.approvers.length) S.opts.approver = S.approvers[0].key;
    appSel.addEventListener("change", () => { S.opts.approver = appSel.value; markStale(); });

    // Fast
    const fast = $("#opt-fast");
    fast.checked = S.opts.fast;
    fast.addEventListener("change", () => { S.opts.fast = fast.checked; markStale(); });

    // Riesegui
    $("#btn-rerun").addEventListener("click", () => { if (S.file) runAnalysis(); });

    // Se il backend non risponde, avvisa nella colonna opzioni (ma i controlli
    // restano attivi: al prossimo tentativo di analisi si riprova).
    if (!S.backendUp) $("#opt-detection-note").classList.remove("hidden");
  }

  function applyPreset(preset, silent) {
    S.opts.preset = preset;
    const isDebug = preset === "debug";
    $("#opt-layers-field").classList.toggle("hidden", !isDebug);
    $("#opt-preset-hint").textContent = PRESET_HINTS[preset] || "";
    if (!isDebug) S.opts.layers = (LAYER_PRESETS[preset] || []).slice();
    syncLayerChecks();
    if (!silent) markStale();
  }

  function buildLayerList() {
    const wrap = $("#opt-layers");
    wrap.innerHTML = "";
    if (!S.layers.length) { wrap.innerHTML = `<p class="hint-sm">Nessun layer disponibile.</p>`; return; }
    S.layers.forEach((l) => {
      const lab = document.createElement("label");
      lab.className = "layer-check" + (l.available ? "" : " off");
      lab.innerHTML = `<input type="checkbox" value="${l.key}" ${l.available ? "" : "disabled"}><span>${escapeHtml(l.label)}</span>`;
      lab.title = l.available ? (l.description || "") : (l.unavailable_reason || "Non disponibile");
      lab.querySelector("input").addEventListener("change", (e) => {
        const set = new Set(S.opts.layers);
        if (e.target.checked) set.add(l.key); else set.delete(l.key);
        S.opts.layers = Array.from(set); markStale();
      });
      wrap.appendChild(lab);
    });
    syncLayerChecks();
  }

  function syncLayerChecks() {
    $$("#opt-layers input").forEach((cb) => { cb.checked = S.opts.layers.includes(cb.value) && !cb.disabled; });
  }

  // Cambi "live" (modalità/gravità): niente nuova analisi, si ricarica solo
  // l'overlay dal backend con i nuovi parametri.
  async function onLiveChange() {
    if (!S.docModel) return;
    await loadServerGroups();
    renderOverlays(); renderSidebar();
    seedHistory(); // il set IA è stato ri-derivato: nuova baseline undo/redo
  }

  function markStale() { S.stale = true; updateStaleUi(); }
  function updateStaleUi() {
    const banner = $("#stale-banner");
    if (banner) banner.classList.toggle("hidden", !(S.stale && S.docModel));
  }

  /* =============================== Download =============================== */
  function bindTopbar() {
    $("#btn-download").addEventListener("click", onDownload);
    $("#btn-download-side").addEventListener("click", onDownload);
    $("#btn-restart").addEventListener("click", () => location.reload());
    const srv = $("#btn-download-server");
    if (srv) srv.addEventListener("click", onServerDownload);
  }

  // Redazione lato server (hard redaction): onora modalità e gravità del backend.
  // Include SOLO le entità rilevate dall'IA (le eventuali redazioni manuali,
  // essendo client, non hanno offset nel testo del server → usa il flatten).
  function onServerDownload() {
    if (!S.docId) return;
    const excluded = [];
    S.groups.forEach((g) => { if (g.source !== "ai") return; g.occurrences.forEach((o) => { if ((!g.active || !o.on) && o.char) excluded.push(o.char); }); });
    const url = Api.downloadUrl(S.docId, { mode: S.mode, severities: sevArray(), excludedRanges: excluded });
    window.open(url, "_blank");
  }

  async function onDownload() {
    const occ = activeOccurrences();
    if (!occ.length) { toast("Nessuna redazione attiva."); return; }
    const overlay = $("#gen-overlay");
    const barSpan = $("#gen-bar > span");
    const genLabel = $("#gen-label");
    overlay.classList.remove("hidden"); barSpan.style.width = "0%";
    genLabel.textContent = "Generazione del PDF protetto…";
    try {
      const blob = await E.generateProtectedPdf(S.docModel, occ, (done, total) => {
        barSpan.style.width = Math.round((done / total) * 100) + "%";
        genLabel.textContent = `Impressione redazioni — pagina ${done} / ${total}`;
      }, { deletedPages: S.deletedPages, mode: S.mode });
      download(blob, S.fileName + "_protetto.pdf");
      genLabel.textContent = "✓ PDF protetto generato.";
      setTimeout(() => overlay.classList.add("hidden"), 700);
    } catch (err) { genLabel.textContent = "Errore: " + err.message; setTimeout(() => overlay.classList.add("hidden"), 2500); }
  }

  /* =============================== Helper =============================== */
  function showView(name) {
    $$(".view").forEach((v) => v.classList.toggle("active", v.dataset.view === name));
    $("#topbar").classList.toggle("hidden", name !== "editor");
    const srv = $("#btn-download-server");
    if (srv) srv.classList.remove("hidden"); // redazione server sempre disponibile
  }

  function download(blob, name) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }

  let _toastTimer = null;
  function toast(msg) {
    let t = $("#toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("show");
    clearTimeout(_toastTimer); _toastTimer = setTimeout(() => t.classList.remove("show"), 3200);
  }

  function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function escapeHtml(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
})();
