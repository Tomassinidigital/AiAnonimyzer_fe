/* Viewer del documento: costruzione delle pagine, una visibile alla volta
   (canvas + text-layer disegnati solo quando serve), zoom, cambio pagina,
   eliminazione/ripristino di una pagina e scorciatoie da tastiera.

   Non disegna le redazioni (overlay-layer.js): quando ricostruisce le pagine
   emette PAGES_RENDERED, quando cambia pagina PAGE_SHOWN. */

import { RENDER_SCALE, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from "../../core/config.js";
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
    btn.textContent = del ? "♻ Ripristina pagina" : "🗑 Elimina pagina";
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
      bn.textContent = "⚠ " + (state.scannedMsg || "PDF scansionato: rilevamento automatico non disponibile. Puoi comunque oscurare manualmente selezionando il testo o disegnando redazioni.");
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
      toast("Rendering pagina non riuscito: " + err.message);
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

  function open() {
    renderAllPages();
    $("#tb-page-tot").textContent = state.docModel.pages.length;
    updateZoomLabel();
    updatePageControls();
  }

  function mount() {
    $("#tb-undo").addEventListener("click", () => history.undo());
    $("#tb-redo").addEventListener("click", () => history.redo());
    $("#tb-zoom-in").addEventListener("click", () => setZoom(state.zoom + ZOOM_STEP));
    $("#tb-zoom-out").addEventListener("click", () => setZoom(state.zoom - ZOOM_STEP));
    $("#tb-zoom-level").addEventListener("click", fitWidth);
    $("#tb-prev-page").addEventListener("click", () => showPage(state.currentPage - 1));
    $("#tb-next-page").addEventListener("click", () => showPage(state.currentPage + 1));
    $("#tb-del-page").addEventListener("click", toggleDeletePage);
    document.addEventListener("keydown", onKey);
    bus.on(EV.DOCUMENT_READY, open);
    bus.on(EV.REDACTIONS, () => { syncDeletedPages(); updatePageControls(); });
  }

  return { mount, showPage, reveal };
}
