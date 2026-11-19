/* Viewer del documento: costruzione delle pagine, una visibile alla volta
   (canvas + text-layer disegnati solo quando serve), zoom, cambio pagina,
   eliminazione/ripristino di una pagina e scorciatoie da tastiera.

   Non disegna le redazioni (overlay-layer.js): quando ricostruisce le pagine
   emette PAGES_RENDERED, quando cambia pagina PAGE_SHOWN. */

import {
  RENDER_SCALE, ZOOM_BOTH_PANELS, ZOOM_MAX, ZOOM_MIN, ZOOM_ONE_PANEL, ZOOM_STEP,
} from "../../core/config.js";
import { EV } from "../../core/store.js";
import { $, flash } from "../../shared/dom.js";

export function createViewer({ state, bus, pdf, history, toast }) {
  const viewer = () => $("#viewer");

  function updateZoomLabel() { $("#tb-zoom-level").textContent = Math.round(state.zoom * 100) + "%"; }

  function updatePageControls() {
    if (!state.docModel) return;
    $("#tb-page-cur").textContent = state.currentPage + 1;
    $("#tb-prev-page").disabled = state.currentPage <= 0;
    $("#tb-next-page").disabled = state.currentPage >= state.docModel.pages.length - 1;
    const del = state.deletedPages.has(state.currentPage);
    const btn = $("#tb-del-page");
    // Testo in uno span: con la toolbar stretta resta solo l'icona (CSS).
    btn.innerHTML = del ? `♻<span class="tb-label"> Ripristina pagina</span>` : `🗑<span class="tb-label"> Elimina pagina</span>`;
    btn.classList.toggle("tb-danger", !del);
  }

  // Classe "deleted" allineata allo stato (anche dopo undo/redo).
  function syncDeletedPages() {
    state.pageRenders.forEach((pr, i) => pr.wrapper.classList.toggle("deleted", state.deletedPages.has(i)));
  }

  /* Crea i contenitori di tutte le pagine (sincrono); canvas e text-layer sono
     disegnati solo per la pagina visibile (renderPageContent). */
  function renderAllPages() {
    const host = viewer();
    const fab = host.querySelector("#selection-fab");
    host.innerHTML = "";
    if (fab) host.appendChild(fab);
    // PDF scansionato: nessun testo estraibile → nessun rilevamento automatico.
    if (state.scanned) {
      const bn = document.createElement("div");
      bn.className = "scan-banner";
      bn.textContent = "⚠ PDF scansionato (solo immagini): il documento non contiene testo estraibile e il Servizio " +
        "non dispone di OCR. Rilevamento automatico e oscuramento di frasi non sono disponibili; puoi soltanto eliminare le pagine.";
      host.appendChild(bn);
    }
    state.pageRenders = [];
    const scale = RENDER_SCALE * state.zoom;
    const n = state.docModel.pages.length;
    for (let i = 0; i < n; i++) {
      const viewport = state.docModel.pages[i].page.getViewport({ scale });
      const wrapper = document.createElement("div");
      wrapper.className = "page-wrapper" + (state.deletedPages.has(i) ? " deleted" : "");
      wrapper.style.width = viewport.width + "px";
      wrapper.style.height = viewport.height + "px";
      const overlay = document.createElement("div");
      overlay.className = "redaction-layer";
      wrapper.appendChild(overlay);
      const badge = document.createElement("div");
      badge.className = "page-badge";
      badge.textContent = "Pag. " + (i + 1) + " / " + n;
      wrapper.appendChild(badge);
      host.appendChild(wrapper);
      state.pageRenders.push({ wrapper, overlay, viewport, page: i, rendered: false });
    }
    state.currentPage = Math.min(state.currentPage, state.pageRenders.length - 1);
    state.pageRenders.forEach((pr, i) => pr.wrapper.classList.toggle("page-hidden", i !== state.currentPage));
    renderPageContent(state.pageRenders[state.currentPage]);
    bus.emit(EV.PAGES_RENDERED);
  }

  // Disegna canvas + text-layer di una pagina, una sola volta per render.
  async function renderPageContent(pr) {
    if (!pr || pr.rendered) return;
    pr.rendered = true;
    try {
      const entry = state.docModel.pages[pr.page];
      const canvas = await pdf.renderCanvas(entry, pr.viewport);
      const textLayer = await pdf.renderTextLayer(entry, pr.viewport);
      // Se nel frattempo la pagina è stata ridisegnata (zoom), il wrapper è scollegato: nessun effetto.
      pr.wrapper.insertBefore(canvas, pr.wrapper.firstChild);
      pr.wrapper.insertBefore(textLayer, pr.overlay);
    } catch (err) {
      pr.rendered = false;
      toast("Visualizzazione della pagina non riuscita: " + err.message);
    }
  }

  // Mostra una sola pagina alla volta: le altre restano nascoste.
  function showPage(i, resetScroll = true, syncList = true) {
    if (!state.pageRenders.length) return;
    i = Math.max(0, Math.min(state.pageRenders.length - 1, i));
    const changed = i !== state.currentPage;
    state.currentPage = i;
    state.pageRenders.forEach((pr, idx) => pr.wrapper.classList.toggle("page-hidden", idx !== i));
    renderPageContent(state.pageRenders[i]);
    if (resetScroll) viewer().scrollTo({ top: 0, behavior: "auto" });
    updatePageControls();
    if (changed) bus.emit(EV.PAGE_SHOWN, { page: i, syncList });
  }

  /* Porta in vista un box: mostra la sua pagina, scorre a `offset` px sopra il
     box ed evidenzia l'elemento dell'overlay scelto da `pick(overlay)`. */
  function reveal(page, box, { offset, syncList = true, pick }) {
    const pr = state.pageRenders[page]; if (!pr || !box) return;
    showPage(page, false, syncList);
    const r = pdf.boxToViewportRect(box, pr.viewport);
    viewer().scrollTo({ top: pr.wrapper.offsetTop + r.top - offset, behavior: "smooth" });
    flash(pick(pr.overlay));
  }

  function setZoom(z) {
    z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(z * 100) / 100));
    if (z === state.zoom) return;
    state.zoom = z;
    updateZoomLabel();
    const anchor = state.currentPage;
    renderAllPages();
    updatePageControls();
    showPage(anchor, false);
  }

  function fitWidth() {
    if (!state.docModel) return;
    const avail = viewer().clientWidth - 56; // padding
    const pageW = state.docModel.pages[state.currentPage].viewport1.width;
    setZoom(avail / pageW / RENDER_SCALE);
  }

  function toggleDeletePage() {
    const i = state.currentPage;
    if (state.deletedPages.has(i)) state.deletedPages.delete(i); else state.deletedPages.add(i);
    bus.emit(EV.REDACTIONS, { record: true }); // box e contatori della pagina cambiano
  }

  function onKey(e) {
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;
    if (!$("[data-view=editor]").classList.contains("active")) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && k === "z" && !e.shiftKey) { e.preventDefault(); history.undo(); }
    else if (mod && (k === "y" || (k === "z" && e.shiftKey))) { e.preventDefault(); history.redo(); }
    else if (e.key === "+" || e.key === "=") setZoom(state.zoom + ZOOM_STEP);
    else if (e.key === "-") setZoom(state.zoom - ZOOM_STEP);
  }

  // Zoom secondo i pannelli laterali: entrambi aperti 85%, uno chiuso 100%.
  const panelsZoom = () =>
    (state.panels.options && state.panels.sidebar ? ZOOM_BOTH_PANELS : ZOOM_ONE_PANEL);

  function open() {
    state.zoom = panelsZoom();
    renderAllPages();
    $("#tb-page-tot").textContent = state.docModel.pages.length;
    updateZoomLabel();
    updatePageControls();
  }

  /* Occhio: solo anteprima. Chiuso (default) = box neri pieni; aperto = box
     senza riempimento, per leggere il testo sotto. Non cambia le redazioni né
     il PDF scaricato. */
  function toggleSeeThrough() {
    const btn = $("#tb-see-through");
    const open = btn.getAttribute("aria-pressed") !== "true";
    btn.setAttribute("aria-pressed", String(open));
    const tip = open ? "Nascondi il testo sotto gli oscuramenti" : "Mostra il testo sotto gli oscuramenti";
    btn.title = tip; btn.setAttribute("aria-label", tip);
    viewer().classList.toggle("see-through", open);
  }

  /* Debug: nella lista di destra ogni frase IA ha un menu con i dati di cattura
     (modulo, layer, processi, score, boost, esito). L'overlay si ricarica con
     `debug=true` (evento DEBUG, gestito dalla composizione in main.js). */
  function toggleDebug() {
    const btn = $("#tb-debug");
    state.debug = btn.getAttribute("aria-pressed") !== "true";
    btn.setAttribute("aria-pressed", String(state.debug));
    const tip = state.debug ? "Nascondi i dati di debug" : "Mostra i dati di debug nella lista";
    btn.title = tip; btn.setAttribute("aria-label", tip);
    $("#tb-an-export").hidden = !state.debug; // estrazione manuale: solo con il debug (l'analizzatore si apre sempre)
    bus.emit(EV.DEBUG);
  }

  /* Scorrimento continuo tra le pagine: arrivati in fondo (o in cima) alla
     pagina, continuando a scorrere si passa alla successiva (o precedente). Il
     cambio scatta solo con una spinta oltre il bordo (EDGE_PUSH px) e non con
     l'inerzia che ci ha portati lì (EDGE_SETTLE ms dopo aver toccato il bordo). */
  const EDGE_PUSH = 140;
  const EDGE_SETTLE = 350;
  let edgePush = 0, edgeDir = 0, lastWheel = 0, edgeAt = 0;

  function atEdges() {
    const v = viewer();
    return { top: v.scrollTop <= 1, bottom: v.scrollTop + v.clientHeight >= v.scrollHeight - 2 };
  }

  function onScroll() {
    const e = atEdges();
    if (e.top || e.bottom) { if (!edgeAt) edgeAt = performance.now(); } else edgeAt = 0;
  }

  function onWheel(e) {
    if (!state.docModel || e.ctrlKey || !state.pageRenders.length) return; // ctrl = zoom browser
    const dir = Math.sign(e.deltaY);
    if (!dir) return;
    const edges = atEdges();
    const last = state.pageRenders.length - 1;
    const next = dir > 0 && edges.bottom && state.currentPage < last;
    const prev = dir < 0 && edges.top && state.currentPage > 0;
    if (!next && !prev) { edgePush = 0; return; }
    const now = performance.now();
    if (edgeAt && now - edgeAt < EDGE_SETTLE) return; // inerzia che ha raggiunto il bordo
    if (dir !== edgeDir || now - lastWheel > 400) edgePush = 0; // nuova spinta
    edgeDir = dir; lastWheel = now;
    edgePush += Math.abs(e.deltaY) * (e.deltaMode === 1 ? 16 : 1); // righe → px (Firefox)
    if (edgePush < EDGE_PUSH) return;
    edgePush = 0;
    if (next) {
      showPage(state.currentPage + 1);                 // successiva, dall'inizio
    } else {
      showPage(state.currentPage - 1, false);          // precedente, dal fondo
      viewer().scrollTo({ top: viewer().scrollHeight, behavior: "auto" });
    }
    edgeAt = performance.now(); // niente doppio salto con la stessa spinta
  }

  function mount() {
    viewer().addEventListener("wheel", onWheel, { passive: true });
    viewer().addEventListener("scroll", onScroll, { passive: true });
    $("#tb-undo").addEventListener("click", () => history.undo());
    $("#tb-redo").addEventListener("click", () => history.redo());
    $("#tb-zoom-in").addEventListener("click", () => setZoom(state.zoom + ZOOM_STEP));
    $("#tb-zoom-out").addEventListener("click", () => setZoom(state.zoom - ZOOM_STEP));
    $("#tb-zoom-level").addEventListener("click", fitWidth);
    $("#tb-prev-page").addEventListener("click", () => showPage(state.currentPage - 1));
    $("#tb-next-page").addEventListener("click", () => showPage(state.currentPage + 1));
    $("#tb-del-page").addEventListener("click", toggleDeletePage);
    $("#tb-see-through").addEventListener("click", toggleSeeThrough);
    $("#tb-debug").addEventListener("click", toggleDebug);
    document.addEventListener("keydown", onKey);
    bus.on(EV.DOCUMENT_READY, open);
    // Apertura/chiusura di un pannello: zoom del PDF adeguato (zoom manuale
    // sempre possibile con +/–, fino al prossimo cambio dei pannelli).
    bus.on(EV.PANELS, () => { if (state.docModel) setZoom(panelsZoom()); });
    bus.on(EV.REDACTIONS, () => { syncDeletedPages(); updatePageControls(); });
  }

  return { mount, showPage, reveal };
}
