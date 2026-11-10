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
      } catch (err) { notice("Esempio non disponibile", "Impossibile caricare l'esempio: " + err.message); }
    });
  }

  function handleFile(file) {
    if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) { notice("File non valido", "Carica un file PDF."); return; }
    S.fileName = (file.name || "documento").replace(/\.pdf$/i, "");
    S.file = file;
    // Nuovo documento: azzera zoom, pagina ed eliminazioni.
    S.zoom = 1; S.currentPage = 0; S.deletedPages = new Set();
    S.docModel = null; S.docId = null; S.groups = []; S.pagesIndex = []; S.pageRenders = [];
    S.navIdx = -1; S.listFilter = "type"; S.scanned = false;
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
    } catch (err) {
      S.backendUp = false; updateBackendBadge();
      await notice("Backend non raggiungibile", "Impossibile analizzare il documento.\n\n" + err.message);
      showView(S.docModel ? "editor" : "upload");
      return;
    }
    try {
      // GDPR: il PDF resta nel browser, il server non lo conserva.
      const buf = await S.file.arrayBuffer();
      S.docModel = await E.load(buf);
      S.pagesIndex = S.docModel.pages.map((p) => p.index);
      await loadServerGroups();
    } catch (err) {
      await notice("Documento non elaborabile", "Impossibile elaborare il documento.\n\n" + err.message);
      showView(S.docModel ? "editor" : "upload");
      return;
    }
    bar.style.width = "100%";
    label.textContent = "Fatto.";
    setTimeout(enterEditor, 250);
  }

  /* Costruisce i gruppi "ai" dai box dell'overlay del BACKEND. I box arrivano in
     punti PDF con origine in alto: qui li convertiamo nello spazio del client
     (origine in basso, coerente col motore e con pdf-lib). Le occorrenze con stesso
     char_start/char_end (redazione multi-riga) sono unite. */
  async function loadServerGroups() {
    const overlay = await Api.getOverlay(S.docId, { mode: S.mode, severities: sevArray() });
    const manual = S.groups.filter((g) => g.source === "manual");
    S.groups = [];
    if (overlay.is_scanned) { S.scanned = true; S.scannedMsg = overlay.message || "PDF scansionato (solo immagine): overlay non disponibile."; S.groups.push(...manual); return; }
    const occMap = new Map();
    S.scanned = false;
    S.analyzedPages = (overlay.pages || []).length; // la modalità veloce analizza solo le prime
    (overlay.boxes || []).forEach((b) => {
      const entry = S.docModel.pages[b.page];
      if (!entry) return; // pagina non presente nel PDF caricato
      const cb = serverBox(b);
      // Testo mascherato per la modalità corrente (per il rendering).
      cb.masked = b.masked || ""; cb.severity = b.severity || "";
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

  // Box del backend → spazio del client (rotazione/CropBox), poi allineamento alla
  // riga di testo reale con padding minimo.
  function serverBox(b) {
    const entry = S.docModel.pages[b.page];
    const box = E.fitBoxToText(S.pagesIndex[b.page], E.serverBoxToPdf(entry, b));
    box.rot = ((entry.page.rotate % 360) + 360) % 360; // per orientare il testo mascherato
    return box;
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
    renderAllPages();
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
    renderAllPages();
    renderOverlays();
    updatePageControls();
    showPage(anchor, false);
  }

  function fitWidth() {
    if (!S.docModel) return;
    const viewer = $("#viewer");
    const avail = viewer.clientWidth - 56; // padding
    const pageW = S.docModel.pages[S.currentPage].viewport1.width;
    setZoom(avail / pageW / ZOOM_BASE);
  }

  function gotoPage(i) { showPage(i); }

  // Mostra una sola pagina alla volta: le altre restano nascoste.
  function showPage(i, resetScroll = true, syncList = true) {
    if (!S.pageRenders.length) return;
    i = Math.max(0, Math.min(S.pageRenders.length - 1, i));
    const changed = i !== S.currentPage;
    S.currentPage = i;
    S.pageRenders.forEach((pr, idx) => pr.wrapper.classList.toggle("page-hidden", idx !== i));
    renderPageContent(S.pageRenders[i]);
    if (resetScroll) $("#viewer").scrollTo({ top: 0, behavior: "auto" });
    updatePageControls();
    if (changed && syncList) alignListToPage(i);
  }

  /* Allinea la lista delle frasi alla pagina corrente: scorre finché la prima sezione/riga
     con occorrenze su quella pagina (data-pages) è in cima. Nessuna riga → lista ferma. */
  function alignListToPage(page) {
    const scroller = document.querySelector(".sidebar .side-block.grow");
    if (!scroller) return;
    const target = scroller.querySelector(`[data-pages~="${page}"]`);
    if (!target) return;
    const delta = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    scroller.scrollTo({ top: scroller.scrollTop + delta, behavior: "smooth" });
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

  // Crea i contenitori di tutte le pagine (sincrono); canvas e text-layer sono
  // disegnati solo per la pagina visibile (vedi renderPageContent).
  function renderAllPages() {
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
      const viewport = S.docModel.pages[i].page.getViewport({ scale });
      const wrapper = document.createElement("div");
      wrapper.className = "page-wrapper" + (S.deletedPages.has(i) ? " deleted" : "");
      wrapper.style.width = viewport.width + "px";
      wrapper.style.height = viewport.height + "px";
      const overlay = document.createElement("div");
      overlay.className = "redaction-layer";
      wrapper.appendChild(overlay);
      const badge = document.createElement("div");
      badge.className = "page-badge";
      badge.textContent = "Pag. " + (i + 1) + " / " + S.docModel.pages.length;
      wrapper.appendChild(badge);
      host.appendChild(wrapper);
      S.pageRenders.push({ wrapper, overlay, viewport, page: i, rendered: false });
    }
    // Solo la pagina corrente e' visibile (e disegnata).
    S.currentPage = Math.min(S.currentPage, S.pageRenders.length - 1);
    S.pageRenders.forEach((pr, i) => pr.wrapper.classList.toggle("page-hidden", i !== S.currentPage));
    renderPageContent(S.pageRenders[S.currentPage]);
  }

  // Disegna canvas + text-layer di una pagina, una sola volta per render.
  async function renderPageContent(pr) {
    if (!pr || pr.rendered) return;
    pr.rendered = true;
    try {
      const entry = S.docModel.pages[pr.page];
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(pr.viewport.width); canvas.height = Math.ceil(pr.viewport.height);
      canvas.className = "page-canvas";
      await entry.page.render({ canvasContext: canvas.getContext("2d"), viewport: pr.viewport }).promise;
      const textLayer = document.createElement("div");
      textLayer.className = "text-layer";
      await E.renderTextLayer(entry, pr.viewport, textLayer);
      // Se nel frattempo la pagina e' stata ridisegnata (zoom), il wrapper e' scollegato: nessun effetto.
      pr.wrapper.insertBefore(canvas, pr.wrapper.firstChild);
      pr.wrapper.insertBefore(textLayer, pr.overlay);
    } catch (err) {
      pr.rendered = false;
      toast("Rendering pagina non riuscito: " + err.message);
    }
  }

  const MASK_MODES = new Set(["initial", "last_chars", "full_mask"]);

  function renderOverlays() {
    S.pageRenders.forEach((pr) => (pr.overlay.innerHTML = ""));
    const maskMode = MASK_MODES.has(S.mode);
    S.groups.forEach((g) => {
      if (!g.active) return;
      g.occurrences.forEach((occ, oi) => {
        if (S.deletedPages.has(occ.page)) return; // niente box sulle pagine eliminate
        const pr = S.pageRenders[occ.page];
        if (!pr) return;
        occ.boxes.forEach((b) => {
          const r = E.boxToViewportRect(b, pr.viewport);
          const div = document.createElement("div");
          // Modalità di mascheramento: il box mostra i caratteri offuscati (es.
          // "M••••") invece della barra piena — l'offuscamento diventa visibile.
          const masking = occ.on && maskMode && b.masked;
          div.className = "redaction-box" + (occ.on ? "" : " ghost") + (masking ? " masked rot" + (b.rot || 0) : "");
          div.dataset.g = g.id; div.dataset.o = oi; // per la navigazione ▲▼
          let css = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;`;
          if (!occ.on) css += `--ghost:${g.color};`;
          else if (masking) css += `font-size:${E.maskFontSize(b.masked, r.width, r.height, b.rot)}px;`;
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
    showPage(occ.page, false);
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

  // Occorrenze di una frase: geometria del BACKEND (metrica reale del font) per le
  // pagine che il server ha analizzato; ricerca client per le altre (modalità
  // veloce) o se il server non risponde / il documento non è più in cache.
  async function findOccurrences(val) {
    let covered = 0, occ = [];
    if (S.docId) {
      try {
        const res = await Api.searchPhrase(S.docId, val);
        covered = res.covered || 0;
        occ = res.matches
          .filter((m) => S.docModel.pages[m.page])
          .map((m) => ({ page: m.page, boxes: m.boxes.map((b) => serverBox({ ...b, page: m.page })), snippet: m.text }));
      } catch (_e) { covered = 0; occ = []; }
    }
    return occ.concat(E.search(S.pagesIndex, val).filter((o) => o.page >= covered));
  }

  async function addManualGroup(phrase) {
    const val = String(phrase || "").trim();
    if (val.length < 2) { toast("Digita almeno 2 caratteri."); return; }
    if (!S.pagesIndex.length) { toast("Carica prima un documento."); return; }
    const occ = await findOccurrences(val);
    if (!occ.length) { toast(`Nessuna occorrenza di «${truncate(val, 30)}» nel documento.`); return; }
    const existing = S.groups.find((g) => g.source === "manual" && g.value.toLowerCase() === val.toLowerCase());
    if (existing) { existing.active = true; existing.occurrences.forEach((o) => (o.on = true)); }
    else S.groups.unshift(makeGroup("manual", "MANUAL", "Redazione manuale", "#111827", val, occ.map((o) => ({ ...o, on: true }))));
    renderOverlays(); renderSidebar(); pushHistory();
    toast(`«${truncate(val, 24)}» → ${occ.length} occorrenz${occ.length === 1 ? "a" : "e"}.`);
  }

  function bindSelectionToRedaction() {
    if (S._selectionBound) return; // enterEditor può essere richiamato più volte
    S._selectionBound = true;
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
      section.dataset.pages = String(p);
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
    row.dataset.pages = [...new Set(g.occurrences.map((o) => o.page))].join(" "); // per l'allineamento alla pagina
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
    // Click sulla riga (testo, pallino, spazio): solo posizionamento sul PDF. Il <label>
    // altrimenti attiverebbe la checkbox: si annulla l'azione di default, così
    // l'oscuramento si rimuove solo cliccando direttamente la checkbox.
    row.querySelector(".grp-main").addEventListener("click", (e) => {
      if (e.target.matches('input[type=checkbox]')) return;
      e.preventDefault();
      scrollToGroup(g);
    });
    if (manual) row.querySelector(".grp-del").addEventListener("click", () => { S.groups = S.groups.filter((x) => x !== g); renderOverlays(); renderSidebar(); pushHistory(); });
    return row;
  }

  function scrollToGroup(g) {
    const first = g.occurrences[0]; if (!first) return;
    const pr = S.pageRenders[first.page]; if (!pr) return;
    showPage(first.page, false, false);
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
    [$("#btn-download"), $("#btn-download-side"), $("#btn-download-remove"), $("#btn-download-remove-side")].forEach((b) => (b.disabled = active === 0));
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
    if (!S.docId) { markStale(); toast("Dati rimossi dal server: premi «Riesegui analisi» per applicare la modifica."); return; }
    try { await loadServerGroups(); }
    catch (err) { toast("Aggiornamento non riuscito: " + err.message); return; }
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
    $("#btn-download").addEventListener("click", () => onDownload(false));
    $("#btn-download-side").addEventListener("click", () => onDownload(false));
    $("#btn-download-remove").addEventListener("click", () => onDownload(true));
    $("#btn-download-remove-side").addEventListener("click", () => onDownload(true));
    $("#btn-restart").addEventListener("click", () => location.reload());
    const srv = $("#btn-download-server");
    if (srv) srv.addEventListener("click", onServerDownload);
  }

  // Redazione lato server (hard redaction): onora modalità e gravità del backend.
  // Include SOLO le entità rilevate dall'IA (le eventuali redazioni manuali,
  // essendo client, non hanno offset nel testo del server → usa il flatten).
  // Modalità veloce: il server ha analizzato solo le prime pagine. Le altre
  // finirebbero nel PDF SENZA oscuramenti automatici: serve una conferma esplicita.
  function unanalyzedWarning() {
    const total = S.docModel ? S.docModel.pages.length : 0;
    const analyzed = S.analyzedPages || 0;
    if (S.scanned || analyzed >= total) return "";
    let kept = 0;
    for (let i = analyzed; i < total; i++) if (!S.deletedPages.has(i)) kept++;
    if (!kept) return "";
    return `Attenzione: sono state analizzate solo le prime ${analyzed} pagine su ${total}.\n` +
      `Le altre ${kept} entreranno nel PDF SENZA oscuramenti automatici.\n` +
      "Per analizzarle tutte disattiva «Veloce» e riesegui l'analisi.";
  }

  // Pagine non analizzate (modalità veloce): serve una conferma esplicita prima del download.
  async function confirmUnanalyzedPages() {
    const partial = unanalyzedWarning();
    if (!partial) return true;
    return dialog({
      icon: "⚠", title: "Pagine non analizzate", text: partial,
      buttons: [{ label: "Annulla", value: false }, { label: "Scarica comunque", value: true, primary: true }],
    });
  }

  /* Dopo il download: modale con l'esito finale della scelta (non è una conferma).
     outcome: "kept" = dati ancora sul server · "removed" = dati eliminati ·
              "failed" = eliminazione richiesta ma non riuscita (detail = errore). */
  function showDownloadOutcome(outcome, detail) {
    const NO_PDF = "Il tuo PDF non viene mai conservato sul server.";
    const CONTINUE = "Puoi continuare le modifiche e scaricare di nuovo.";
    const copy = {
      kept: {
        icon: "✓", title: "PDF scaricato",
        text: [
          "File eliminati: nessun dato dell'analisi. " + NO_PDF,
          "Ancora presenti sul sistema: i dati dell'analisi (testo, entità e posizioni), cancellati automaticamente dopo pochi minuti dall'upload. Per cancellarli subito usa «Scarica e rimuovi i dati».",
          CONTINUE,
        ],
      },
      removed: {
        icon: "🔒", title: "PDF scaricato e dati rimossi",
        text: [
          "File eliminati: i dati dell'analisi (testo, entità e posizioni) sono stati cancellati dal server. " + NO_PDF,
          "Ancora presenti sul sistema: nessun dato di questo documento.",
          CONTINUE + " Le modifiche restano nel browser; per cambiare modalità o gravità, rianalizzare o usare la redazione server premi «Riesegui analisi» (il file viene ricaricato).",
        ],
      },
      failed: {
        icon: "⚠", title: "PDF scaricato, dati non rimossi",
        text: [
          "File eliminati: nessuno. La cancellazione dei dati dal server non è riuscita" + (detail ? " (" + detail + ")" : "") + ".",
          "Ancora presenti sul sistema: i dati dell'analisi, cancellati comunque automaticamente dopo pochi minuti dall'upload. Puoi riprovare con «Scarica e rimuovi i dati».",
          CONTINUE,
        ],
      },
    }[outcome];
    return dialog({ ...copy, buttons: [{ label: "Ho capito", value: true, primary: true }] });
  }

  // Elimina dal server i dati del documento. Ritorna l'esito per il modale.
  async function removeServerData() {
    if (!S.docId) return { outcome: "removed" }; // già assente: nulla da cancellare
    try {
      await Api.deleteDocument(S.docId);
      S.docId = null; // da ora le modifiche usano solo il client
      return { outcome: "removed" };
    } catch (err) {
      return { outcome: "failed", detail: err.message };
    }
  }

  async function onServerDownload() {
    if (!S.docId) { toast("Dati già rimossi dal server: premi «Riesegui analisi» per usare la redazione server."); return; }
    const hasManual = S.groups.some((g) => g.source === "manual" && g.active);
    if (S.deletedPages.size || hasManual) {
      toast("Pagine eliminate e redazioni manuali non sono supportate dal server: usa «Scarica PDF protetto».");
      return;
    }
    if (!(await confirmUnanalyzedPages())) return;
    const excluded = [];
    S.groups.forEach((g) => { if (g.source !== "ai") return; g.occurrences.forEach((o) => { if ((!g.active || !o.on) && o.char) excluded.push(o.char); }); });
    try {
      const blob = await Api.downloadPdf(S.docId, S.file, { mode: S.mode, severities: sevArray(), excludedRanges: excluded });
      download(blob, S.fileName + "_protetto.pdf");
    } catch (err) {
      notice("Generazione non riuscita", err.message);
      return;
    }
    S.docId = null; // il backend elimina i dati subito dopo la redazione
    showDownloadOutcome("removed");
  }

  async function onDownload(removeData = false) {
    const occ = activeOccurrences();
    if (!occ.length) { toast("Nessuna redazione attiva."); return; }
    if (!(await confirmUnanalyzedPages())) return;
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
      // Eliminazione (se richiesta) mentre l'overlay mostra «generato», poi modale con l'esito.
      const res = removeData ? await removeServerData() : { outcome: "kept" };
      setTimeout(() => { overlay.classList.add("hidden"); showDownloadOutcome(res.outcome, res.detail); }, 700);
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

  /* Modale generico (mai alert/confirm nativi). `text`: stringa o array di paragrafi
     (testo semplice, \n = a capo). `buttons`: [{label, value, primary}]. Esc = ultimo
     valore "non primario" (annulla) o il primo pulsante. Risolve con il value scelto. */
  function dialog({ icon = "⚠", title = "", text = "", buttons }) {
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
  const notice = (title, text) => dialog({ title, text });

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
