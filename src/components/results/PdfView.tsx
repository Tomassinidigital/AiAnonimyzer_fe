import { App } from "antd";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { getPdfOverlay, pdfDownloadUrl, pdfRawUrl } from "@/api/endpoints";
import { http } from "@/api/client";
import type { OverlayBox, PdfPageGeom } from "@/api/types";
import { useCatalogStore } from "@/store/catalogStore";
import { useSessionStore } from "@/store/sessionStore";
import { useUiStore } from "@/store/uiStore";
import { applyReRender } from "@/features/runner";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const MASK_MODES = new Set(["initial", "last_chars", "full_mask"]);

function correctionsParams(
  manual: [number, number][],
  excluded: [number, number][],
  severities: string[],
  allSeverities: string[],
): string {
  const params = new URLSearchParams();
  if (manual.length)
    params.set("manual_ranges", manual.map((r) => `${r[0]}-${r[1]}`).join(","));
  if (excluded.length)
    params.set("excluded_ranges", excluded.map((r) => `${r[0]}-${r[1]}`).join(","));
  if (severities.length && allSeverities.length && severities.length < allSeverities.length)
    params.set("severities", severities.join(","));
  return params.toString();
}

function boxType(b: OverlayBox): string {
  return b.label || b.entity_type || "—";
}

export function PdfView() {
  const { message } = App.useApp();
  const docId = useSessionStore((s) => s.docId);
  const isPdf = useSessionStore((s) => s.isPdf);
  // Modalità di offuscamento e gravità abilitate vivono nello store UI.
  const offuscMode = useUiStore((s) => s.mode);
  const severities = useUiStore((s) => s.enabledSeverities);
  const manualRanges = useSessionStore((s) => s.manualRanges);
  const excludedRanges = useSessionStore((s) => s.excludedRanges);
  const restoreRange = useSessionStore((s) => s.restoreRange);
  const colors = useCatalogStore((s) => s.severityColors);
  const allSeverities = useMemo(() => Object.keys(colors), [colors]);

  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Contenitori scrollabili delle due colonne, per sincronizzare la vista
  // (scroll-into-view) all'elemento selezionato quando si sceglie da una o
  // dall'altra colonna.
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  const listBodyRef = useRef<HTMLDivElement>(null);

  const [numPages, setNumPages] = useState(0);
  const [geom, setGeom] = useState<Record<number, PdfPageGeom>>({});
  const [boxes, setBoxes] = useState<OverlayBox[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [currentIdx, setCurrentIdx] = useState(-1);
  const [listFilter, setListFilter] = useState("page");
  const [listCollapsed, setListCollapsed] = useState(false);
  const [restored, setRestored] = useState<Set<string>>(new Set());
  const [vp, setVp] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [scannedMsg, setScannedMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const restoreKey = (b: OverlayBox) => `${b.char_start}-${b.char_end}`;
  const isRestored = useCallback(
    (b: OverlayBox) => b.char_start >= 0 && restored.has(restoreKey(b)),
    [restored],
  );

  // Carica overlay (con correzioni/mode correnti) + documento pdf.js.
  const reload = useCallback(async () => {
    if (!docId) return;
    setError(null);
    try {
      const corr = correctionsParams(manualRanges, excludedRanges, severities, allSeverities);
      const params: Record<string, string> = { mode: offuscMode };
      for (const [k, v] of new URLSearchParams(corr)) params[k] = v;
      const ov = await getPdfOverlay(docId, params);
      if (!pdfRef.current) {
        pdfRef.current = await pdfjsLib.getDocument(pdfRawUrl(docId)).promise;
      }
      if (ov.is_scanned) {
        setScannedMsg(ov.message || "PDF scansionato: overlay non disponibile.");
        return;
      }
      setScannedMsg(null);
      const g: Record<number, PdfPageGeom> = {};
      ov.pages.forEach((p) => (g[p.page] = p));
      const sorted = [...ov.boxes].sort(
        (a, b) => a.page - b.page || a.y0 - b.y0 || a.x0 - b.x0,
      );
      sorted.forEach((b, i) => (b.gidx = i));
      setGeom(g);
      setNumPages(pdfRef.current.numPages);
      setBoxes(sorted);
      setRestored(new Set());
      setCurrentPage((p) => (p >= pdfRef.current!.numPages ? 0 : p));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore caricamento PDF");
    }
  }, [docId, manualRanges, excludedRanges, severities, allSeverities, offuscMode]);

  // (Ri)carica quando cambia documento/modalità/correzioni.
  useEffect(() => {
    if (isPdf && docId) {
      pdfRef.current = null;
      void reload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, isPdf, offuscMode]);

  // Render della pagina corrente su canvas.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pdf = pdfRef.current;
      const canvas = canvasRef.current;
      if (!pdf || !canvas || scannedMsg) return;
      const page = await pdf.getPage(currentPage + 1);
      const viewport = page.getViewport({ scale: 1.4 });
      if (cancelled) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      await page.render({ canvasContext: ctx, viewport }).promise;
      if (!cancelled) setVp({ width: viewport.width, height: viewport.height });
    })();
    return () => {
      cancelled = true;
    };
  }, [currentPage, numPages, scannedMsg, boxes]);

  // Sincronizza la lista (colonna destra): porta in vista la voce selezionata
  // quando la selezione cambia (es. cliccando un box sul PDF).
  useEffect(() => {
    if (currentIdx < 0 || listCollapsed) return;
    const el = listBodyRef.current?.querySelector<HTMLElement>(
      ".pdf-list-item.active",
    );
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [currentIdx, listFilter, listCollapsed]);

  // Sincronizza il PDF (colonna sinistra): porta in vista il box selezionato
  // quando la selezione cambia (es. cliccando una voce della lista). Dipende da
  // vp perché il box viene reso solo dopo il render della pagina.
  useEffect(() => {
    if (currentIdx < 0) return;
    const el = pdfContainerRef.current?.querySelector<HTMLElement>(
      ".pdf-overlay-box.pdf-flash",
    );
    el?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
  }, [currentIdx, currentPage, vp.width, vp.height]);

  // ---- Scope di navigazione (filtro per pagina/tipo) ----
  const isTypeFilter = listFilter.startsWith("type:");
  const scopeBoxes = useMemo(() => {
    const live = boxes.filter((b) => !isRestored(b));
    if (isTypeFilter) {
      const t = listFilter.slice(5);
      return live.filter((b) => boxType(b) === t);
    }
    return live;
  }, [boxes, listFilter, isTypeFilter, isRestored]);

  const scopePages = useMemo(() => {
    if (isTypeFilter) {
      return [...new Set(scopeBoxes.map((b) => b.page))].sort((a, b) => a - b);
    }
    return Array.from({ length: numPages }, (_, i) => i);
  }, [scopeBoxes, isTypeFilter, numPages]);

  const boxesByPage = useMemo(() => {
    const m: Record<number, OverlayBox[]> = {};
    boxes.forEach((b) => {
      if (!isRestored(b)) (m[b.page] = m[b.page] || []).push(b);
    });
    return m;
  }, [boxes, isRestored]);

  const typeCounts = useMemo(() => {
    const order: string[] = [];
    const cnt = new Map<string, number>();
    boxes.forEach((b) => {
      const k = boxType(b);
      if (!cnt.has(k)) {
        order.push(k);
        cnt.set(k, 0);
      }
      if (!isRestored(b)) cnt.set(k, cnt.get(k)! + 1);
    });
    return order.map((k) => [k, cnt.get(k)!] as const);
  }, [boxes, isRestored]);

  function gotoPage(p: number) {
    const np = Math.max(0, Math.min(numPages - 1, p));
    setCurrentPage(np);
    const onPage = scopeBoxes.filter((b) => b.page === np);
    setCurrentIdx(onPage.length ? onPage[0].gidx! : -1);
  }

  function stepPage(delta: number) {
    const i = scopePages.indexOf(currentPage);
    if (i < 0) {
      if (scopePages.length) gotoPage(scopePages[0]);
      return;
    }
    const j = i + delta;
    if (j >= 0 && j < scopePages.length) gotoPage(scopePages[j]);
  }

  function selectPhrase(gidx: number) {
    const box = boxes.find((b) => b.gidx === gidx);
    if (!box) return;
    setCurrentIdx(gidx);
    if (box.page !== currentPage) setCurrentPage(box.page);
  }

  function navPhrase(delta: number) {
    const n = scopeBoxes.length;
    if (!n) return;
    const pos = scopeBoxes.findIndex((b) => b.gidx === currentIdx);
    const next =
      pos < 0 ? (delta > 0 ? 0 : n - 1) : Math.max(0, Math.min(n - 1, pos + delta));
    selectPhrase(scopeBoxes[next].gidx!);
  }

  function onRestore(b: OverlayBox) {
    if (!b || b.char_start < 0) return;
    restoreRange(b.char_start, b.char_end);
    setRestored((prev) => new Set(prev).add(restoreKey(b)));
    message.info('Si prega di "Aggiorna offuscazioni" per visualizzare le modifiche.');
  }

  async function onDownload(kind: "box" | "mask") {
    if (!docId) return;
    const dmode =
      kind === "mask" ? (MASK_MODES.has(offuscMode) ? offuscMode : "full_mask") : "placeholder";
    const corr = correctionsParams(manualRanges, excludedRanges, severities, allSeverities);
    const query = `style=black&mode=${encodeURIComponent(dmode)}${corr ? "&" + corr : ""}`;
    try {
      const res = await http.get(pdfDownloadUrl(docId, query), { responseType: "blob" });
      const blob = res.data as Blob;
      const cd = (res.headers["content-disposition"] as string) || "";
      const name =
        cd.match(/filename=(.+)/)?.[1] || (kind === "mask" ? "offuscato.pdf" : "redatto.pdf");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      const ents = res.headers["x-entities-redacted"] || "?";
      message.success(`Scaricato (${ents} entità).`);
    } catch (e) {
      message.error("Errore download: " + (e instanceof Error ? e.message : ""));
    }
  }

  if (!docId || !isPdf) return null;

  const pos = scopeBoxes.findIndex((b) => b.gidx === currentIdx);
  const pageIdx = scopePages.indexOf(currentPage);

  return (
    <div id="pdf-container-root">
      <div className="pdf-toolbar">
        <div className="pdf-nav-group pdf-nav-actions">
          <button
            className="btn-ghost"
            onClick={() => onDownload("box")}
            title="PDF redatto: testo sensibile rimosso e coperto da box neri (irreversibile)"
          >
            ⬇ Redatto (box)
          </button>
          <button
            className="btn-ghost"
            onClick={() => onDownload("mask")}
            title="PDF: testo sensibile rimosso e sostituito coi caratteri offuscati"
          >
            ⬇ Frasi offuscate
          </button>
        </div>
        <div className="pdf-nav-group">
          <button
            className="btn-ghost"
            onClick={async () => {
              // Smaltisci il vecchio proxy pdf.js PRIMA di rifare il fetch:
              // non distruggerlo lascia worker orfani e le pagine successive
              // vengono renderizzate vuote (cfr. frontend originale).
              const old = pdfRef.current;
              pdfRef.current = null;
              if (old) {
                try {
                  await old.destroy();
                } catch {
                  /* best-effort */
                }
              }
              void reload();
              // Allinea anche report/anonimizzato/json alle correzioni manuali e
              // ai livelli di gravità correnti (il PDF non è l'unica vista).
              applyReRender();
            }}
            title="Riapplica all'anteprima le offuscazioni manuali e i livelli di gravità correnti"
          >
            ↻ Aggiorna offuscazioni
          </button>
        </div>
        {!scannedMsg && (
          <>
            <div className="pdf-nav-group">
              <button
                className="pdf-nav-btn"
                disabled={pageIdx <= 0}
                onClick={() => stepPage(-1)}
                title="Pagina precedente"
              >
                ‹
              </button>
              <label className="pdf-nav-label">Pagina</label>
              <select
                className="pdf-page-select"
                value={currentPage}
                onChange={(e) => gotoPage(parseInt(e.target.value, 10))}
              >
                {scopePages.map((i) => (
                  <option key={i} value={i}>
                    {i + 1}
                  </option>
                ))}
              </select>
              <span className="pdf-nav-total">di {scopePages.length}</span>
              <button
                className="pdf-nav-btn"
                disabled={pageIdx < 0 || pageIdx >= scopePages.length - 1}
                onClick={() => stepPage(1)}
                title="Pagina successiva"
              >
                ›
              </button>
            </div>
            <div className="pdf-nav-group">
              <button
                className="pdf-nav-btn"
                disabled={scopeBoxes.length === 0 || pos <= 0}
                onClick={() => navPhrase(-1)}
                title="Frase offuscata precedente"
              >
                ▲
              </button>
              <span className="pdf-nav-total">
                {pos >= 0 ? pos + 1 : "–"} / {scopeBoxes.length || "–"}
              </span>
              <button
                className="pdf-nav-btn"
                disabled={
                  scopeBoxes.length === 0 || pos < 0 || pos >= scopeBoxes.length - 1
                }
                onClick={() => navPhrase(1)}
                title="Frase offuscata successiva"
              >
                ▼
              </button>
            </div>
          </>
        )}
      </div>

      {error && <div className="banner banner-error">{error}</div>}
      {scannedMsg ? (
        <div className="banner">{scannedMsg}</div>
      ) : (
        <div className="pdf-body">
          <div className="pdf-container" ref={pdfContainerRef}>
            <div
              className="pdf-page-wrap"
              style={{ width: vp.width, height: vp.height, position: "relative" }}
            >
              <canvas ref={canvasRef} />
              {(boxesByPage[currentPage] || []).map((b) => {
                const g = geom[currentPage];
                if (!g) return null;
                const sx = vp.width / g.width;
                const sy = vp.height / g.height;
                const masking = MASK_MODES.has(offuscMode) && b.masked;
                return (
                  <div
                    key={b.gidx}
                    className={`pdf-overlay-box${masking ? " pdf-overlay-masked" : ""}${b.gidx === currentIdx ? " pdf-flash" : ""}`}
                    style={{
                      left: b.x0 * sx,
                      top: b.y0 * sy,
                      width: (b.x1 - b.x0) * sx,
                      height: (b.y1 - b.y0) * sy,
                      background: colors[b.severity] || "#000",
                      opacity: masking ? 1 : 0.82,
                    }}
                    title={`${b.label} · ${b.severity}`}
                    onClick={() => selectPhrase(b.gidx!)}
                  >
                    {masking ? b.masked : ""}
                  </div>
                );
              })}
            </div>
          </div>

          <aside className={`pdf-list-panel${listCollapsed ? " collapsed" : ""}`}>
            <button
              className="pdf-list-toggle"
              onClick={() => setListCollapsed((c) => !c)}
              title={listCollapsed ? "Mostra elenco elementi" : "Comprimi elenco"}
            >
              {listCollapsed ? "‹" : "›"}
            </button>
            <div className="pdf-list-inner">
              <div className="pdf-list-head">
                <span className="pdf-list-title">Elementi oscurati</span>
                <span className="pdf-list-count">{boxes.length}</span>
              </div>
              <div className="pdf-list-filter-wrap">
                <select
                  className="pdf-list-filter"
                  value={listFilter}
                  onChange={(e) => setListFilter(e.target.value)}
                >
                  <option value="page">Per pagina</option>
                  <optgroup label="Per tipo">
                    {typeCounts.map(([t, c]) => (
                      <option key={t} value={`type:${t}`}>
                        {t} ({c})
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>
              <div className="pdf-list-body" ref={listBodyRef}>
                <PdfList
                  isTypeFilter={isTypeFilter}
                  listFilter={listFilter}
                  numPages={numPages}
                  boxesByPage={boxesByPage}
                  boxesAll={boxes}
                  isRestored={isRestored}
                  currentIdx={currentIdx}
                  colors={colors}
                  onSelect={(g) => selectPhrase(g)}
                  onRestore={onRestore}
                />
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

interface PdfListProps {
  isTypeFilter: boolean;
  listFilter: string;
  numPages: number;
  boxesByPage: Record<number, OverlayBox[]>;
  boxesAll: OverlayBox[];
  isRestored: (b: OverlayBox) => boolean;
  currentIdx: number;
  colors: Record<string, string>;
  onSelect: (gidx: number) => void;
  onRestore: (b: OverlayBox) => void;
}

function PdfList({
  isTypeFilter,
  listFilter,
  numPages,
  boxesByPage,
  boxesAll,
  isRestored,
  currentIdx,
  colors,
  onSelect,
  onRestore,
}: PdfListProps) {
  const sections: { title: string; items: OverlayBox[] }[] = [];
  if (isTypeFilter) {
    const t = listFilter.slice(5);
    const items = boxesAll.filter((b) => boxType(b) === t && !isRestored(b));
    if (items.length) sections.push({ title: t, items });
  } else {
    for (let p = 0; p < numPages; p++) {
      const items = boxesByPage[p] || [];
      if (items.length) sections.push({ title: "Pagina " + (p + 1), items });
    }
  }

  if (!boxesAll.length) {
    return <p className="pdf-list-empty">Nessun elemento oscurato nel documento.</p>;
  }

  return (
    <>
      {sections.map((g) => (
        <div className="pdf-list-section" key={g.title}>
          <div className="pdf-list-section-head">
            {g.title}
            <span>{g.items.length}</span>
          </div>
          {g.items.map((b) => {
            const txt = (b.text || b.label || "").trim() || b.label || "";
            const meta = isTypeFilter ? "p." + (b.page + 1) : b.label || "";
            return (
              <div
                key={b.gidx}
                className={`pdf-list-item${b.gidx === currentIdx ? " active" : ""}`}
                role="button"
                tabIndex={0}
                title={`${b.label} · ${b.severity}`}
                onClick={() => onSelect(b.gidx!)}
              >
                <span
                  className="pdf-list-dot"
                  style={{ background: colors[b.severity] || "#000" }}
                />
                <span className="pdf-list-text">{txt}</span>
                <span className="pdf-list-type">{meta}</span>
                {b.char_start >= 0 && (
                  <button
                    className="pdf-list-restore"
                    title="Non offuscare più questa frase (ripristina)"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRestore(b);
                    }}
                  >
                    ↩ Ripristina
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}
