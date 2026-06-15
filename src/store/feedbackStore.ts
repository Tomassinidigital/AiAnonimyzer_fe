import { create } from "zustand";
import type { Timing } from "@/api/types";

export interface RunStatRow {
  key: string;
  label: string;
  value: string;
}

interface LoadingState {
  visible: boolean;
  text: string;
  sub: string;
  progress: number | null; // null = barra nascosta
  tipsKind: "analyze" | "debug" | null;
}

interface ActivityState {
  visible: boolean;
  label: string;
  detail: string;
  progress: number;
  startedAt: number | null;
  error: boolean;
}

interface RunStatsState {
  visible: boolean;
  rows: RunStatRow[];
  phase: string;
  t0: number | null;
  running: boolean;
}

interface SysMonState {
  active: boolean;
  label: string;
}

/**
 * Canali di feedback non-dati (specchio di app.js): overlay modale di
 * caricamento, activity bar non bloccante, riepilogo tempi, monitor di sistema.
 */
interface FeedbackState {
  loading: LoadingState;
  activity: ActivityState;
  runStats: RunStatsState;
  sysMon: SysMonState;

  loadingShow: (text: string, sub: string, tipsKind?: "analyze" | "debug") => void;
  loadingStep: (text?: string | null, sub?: string | null, progress?: number | null) => void;
  loadingHide: () => void;

  activityShow: (label: string, detail: string) => void;
  activityUpdate: (progress: number | null, detail?: string | null) => void;
  activityError: (detail: string) => void;
  activityHide: () => void;

  runStatsStart: (rows: RunStatRow[]) => void;
  runStatsSetPhase: (msg: string) => void;
  runStatsSetTimings: (timings: Timing[]) => void;
  runStatsFinish: () => void;
  runStatsClose: () => void;

  sysMonStart: (label: string) => void;
  sysMonSetState: (label: string) => void;
  sysMonStop: () => void;
}

const AUTO_CLOSE_MS = 30000;
let closeTimer: ReturnType<typeof setTimeout> | null = null;

const stripVerify = (m: string) => m.replace(/^Verifica LLM:\s*/i, "");

export const useFeedbackStore = create<FeedbackState>((set, get) => ({
  loading: { visible: false, text: "", sub: "", progress: null, tipsKind: null },
  activity: {
    visible: false,
    label: "",
    detail: "",
    progress: 0.02,
    startedAt: null,
    error: false,
  },
  runStats: { visible: false, rows: [], phase: "", t0: null, running: false },
  sysMon: { active: false, label: "" },

  loadingShow: (text, sub, tipsKind = "analyze") =>
    set({
      loading: {
        visible: true,
        text: text || "Elaborazione in corso…",
        sub: sub || "",
        progress: null,
        tipsKind,
      },
    }),
  loadingStep: (text, sub, progress) =>
    set((s) => ({
      loading: {
        ...s.loading,
        text: text != null ? text : s.loading.text,
        sub: sub != null ? sub : s.loading.sub,
        progress: progress != null ? progress : s.loading.progress,
      },
    })),
  loadingHide: () =>
    set((s) => ({ loading: { ...s.loading, visible: false, progress: null } })),

  activityShow: (label, detail) =>
    set({
      activity: {
        visible: true,
        label,
        detail: stripVerify(detail || "avvio…"),
        progress: 0.02,
        startedAt: Date.now(),
        error: false,
      },
    }),
  activityUpdate: (progress, detail) =>
    set((s) => {
      if (!s.activity.visible) return s;
      return {
        activity: {
          ...s.activity,
          detail: detail != null ? stripVerify(detail) : s.activity.detail,
          progress: progress != null ? progress : s.activity.progress,
        },
      };
    }),
  activityError: (detail) =>
    set((s) => ({
      activity: {
        ...s.activity,
        error: true,
        detail: stripVerify(detail),
        progress: 1,
      },
    })),
  activityHide: () =>
    set((s) => ({ activity: { ...s.activity, visible: false, error: false } })),

  runStatsStart: (rows) => {
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    set({
      runStats: {
        visible: true,
        rows,
        phase: "",
        t0: Date.now(),
        running: true,
      },
    });
  },
  runStatsSetPhase: (msg) =>
    set((s) =>
      s.runStats.running ? { runStats: { ...s.runStats, phase: msg } } : s,
    ),
  runStatsSetTimings: (timings) =>
    set((s) => {
      const rows = [...s.runStats.rows];
      for (const t of timings) {
        const i = rows.findIndex((r) => r.key === t.key);
        const value = fmtSecLocal(t.seconds);
        if (i >= 0) rows[i] = { ...rows[i], value };
        else rows.push({ key: t.key, label: t.label, value });
      }
      return { runStats: { ...s.runStats, rows } };
    }),
  runStatsFinish: () => {
    if (!get().runStats.running) return;
    set((s) => ({ runStats: { ...s.runStats, running: false, phase: "" } }));
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = setTimeout(() => get().runStatsClose(), AUTO_CLOSE_MS);
  },
  runStatsClose: () => {
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    set((s) => ({ runStats: { ...s.runStats, visible: false, running: false } }));
  },

  sysMonStart: (label) => set({ sysMon: { active: true, label } }),
  sysMonSetState: (label) => set((s) => ({ sysMon: { ...s.sysMon, label } })),
  sysMonStop: () => set({ sysMon: { active: false, label: "" } }),
}));

function fmtSecLocal(s: number): string {
  if (s < 0.01) return "<0.01s";
  if (s < 10) return `${s.toFixed(2)}s`;
  if (s < 60) return `${s.toFixed(1)}s`;
  const sec = Math.round(s);
  return sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m ${String(sec % 60).padStart(2, "0")}s`;
}
