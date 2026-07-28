import { create } from "zustand";
import type { ResultTab } from "@/constants";
import { RESULT_TABS } from "@/constants";
import type {
  CompareResponse,
  DebugResponse,
  LlmCheck,
  PdfLayoutBlock,
  RenderResponse,
  Timing,
} from "@/api/types";

export type StatusKind = "info" | "ok" | "error";

export interface StatusLine {
  msg: string;
  kind: StatusKind;
}

type Range = [number, number];

/**
 * Stato della SESSIONE di risultati (documento corrente, span, viste).
 * Vive lato client come nell'app originale: cambiare modalità/gravità chiama
 * /api/render (economico), non /detect.
 */
interface SessionState {
  runId: number;
  docId: string | null;
  isPdf: boolean;
  pdfLayout: PdfLayoutBlock[] | null;

  manualRanges: Range[];
  excludedRanges: Range[];

  render: RenderResponse | null; // modalità singola (o primaria in "all")
  multiRender: Record<string, RenderResponse> | null; // modalità "all"
  compare: CompareResponse | null;
  debug: DebugResponse | null;

  timings: Timing[];
  llm: LlmCheck | null;
  status: StatusLine;

  visibleTabs: ResultTab[];
  activeTab: ResultTab | null;

  lastAnalysisSnapshot: string | null;

  // actions
  bumpRunId: () => number;
  resetSession: () => void;
  setDoc: (docId: string | null, isPdf: boolean) => void;
  setPdfLayout: (blocks: PdfLayoutBlock[] | null) => void;
  setRender: (r: RenderResponse | null) => void;
  setMultiRender: (m: Record<string, RenderResponse> | null) => void;
  setCompare: (c: CompareResponse | null) => void;
  setDebug: (d: DebugResponse | null) => void;
  setTimings: (t: Timing[]) => void;
  setLlm: (l: LlmCheck | null) => void;
  setStatus: (msg: string, kind?: StatusKind) => void;

  showTab: (key: ResultTab) => void;
  showTabs: (keys: ResultTab[]) => void;
  hideTab: (key: ResultTab) => void;
  hideTabs: (keys: ResultTab[]) => void;
  activateTab: (key: ResultTab) => void;
  ensureActiveVisible: () => void;

  addManualRange: (r: Range) => void;
  removeManualRange: (r: Range) => void;
  addExcludedRange: (r: Range) => void;
  /** Stessa semantica del click su un'entità: rimuove se manuale, altrimenti esclude. */
  restoreRange: (start: number, end: number) => "manual" | "excluded";

  markAnalyzed: (snapshot: string) => void;
}

const orderTabs = (tabs: ResultTab[]): ResultTab[] =>
  RESULT_TABS.filter((t) => tabs.includes(t));

export const useSessionStore = create<SessionState>((set, get) => ({
  runId: 0,
  docId: null,
  isPdf: false,
  pdfLayout: null,
  manualRanges: [],
  excludedRanges: [],
  render: null,
  multiRender: null,
  compare: null,
  debug: null,
  timings: [],
  llm: null,
  status: { msg: "", kind: "info" },
  visibleTabs: [],
  activeTab: null,
  lastAnalysisSnapshot: null,

  bumpRunId: () => {
    const runId = get().runId + 1;
    set({ runId });
    return runId;
  },

  resetSession: () =>
    set((s) => ({
      runId: s.runId + 1,
      docId: null,
      isPdf: false,
      pdfLayout: null,
      manualRanges: [],
      excludedRanges: [],
      render: null,
      multiRender: null,
      compare: null,
      debug: null,
      timings: [],
      llm: null,
      status: { msg: "", kind: "info" },
      visibleTabs: [],
      activeTab: null,
      lastAnalysisSnapshot: null,
    })),

  setDoc: (docId, isPdf) => set({ docId, isPdf }),
  setPdfLayout: (pdfLayout) => set({ pdfLayout }),
  setRender: (render) => set({ render }),
  setMultiRender: (multiRender) => set({ multiRender }),
  setCompare: (compare) => set({ compare }),
  setDebug: (debug) => set({ debug }),
  setTimings: (timings) => set({ timings }),
  setLlm: (llm) => set({ llm }),
  setStatus: (msg, kind = "info") => set({ status: { msg, kind } }),

  showTab: (key) =>
    set((s) =>
      s.visibleTabs.includes(key)
        ? s
        : { visibleTabs: orderTabs([...s.visibleTabs, key]) },
    ),
  showTabs: (keys) =>
    set((s) => ({
      visibleTabs: orderTabs([...new Set([...s.visibleTabs, ...keys])]),
    })),
  hideTab: (key) =>
    set((s) => ({ visibleTabs: s.visibleTabs.filter((t) => t !== key) })),
  hideTabs: (keys) =>
    set((s) => ({
      visibleTabs: s.visibleTabs.filter((t) => !keys.includes(t)),
    })),
  activateTab: (key) => set({ activeTab: key }),
  ensureActiveVisible: () =>
    set((s) => {
      if (s.activeTab && s.visibleTabs.includes(s.activeTab)) return s;
      return { activeTab: s.visibleTabs[0] ?? null };
    }),

  addManualRange: (r) =>
    set((s) => ({ manualRanges: [...s.manualRanges, r] })),
  removeManualRange: (r) =>
    set((s) => ({
      manualRanges: s.manualRanges.filter(
        ([a, b]) => !(a === r[0] && b === r[1]),
      ),
    })),
  addExcludedRange: (r) =>
    set((s) =>
      s.excludedRanges.some(([a, b]) => a === r[0] && b === r[1])
        ? s
        : { excludedRanges: [...s.excludedRanges, r] },
    ),
  restoreRange: (start, end) => {
    const s = get();
    const idx = s.manualRanges.findIndex(([a, b]) => a === start && b === end);
    if (idx >= 0) {
      set({
        manualRanges: s.manualRanges.filter((_, i) => i !== idx),
      });
      return "manual";
    }
    if (!s.excludedRanges.some(([a, b]) => a === start && b === end)) {
      set({ excludedRanges: [...s.excludedRanges, [start, end]] });
    }
    return "excluded";
  },

  markAnalyzed: (snapshot) => set({ lastAnalysisSnapshot: snapshot }),
}));
