import { create } from "zustand";
import type { PresetKey } from "@/constants";
import { LAYER_PRESETS } from "@/constants";
import type { DetectionLayer } from "@/api/types";

export type SourceKind = "text" | "pdf";
export type ThemeMode = "light" | "dark";

/**
 * Stato delle IMPOSTAZIONI (pannello di sinistra) + preferenze di layout/tema.
 * Equivalente alle scelte che nel frontend originale vivevano nel DOM dei
 * controlli. Le run leggono questo store; i risultati stanno in sessionStore.
 */
interface UiState {
  // sorgente
  source: SourceKind;
  docText: string;
  pdfFile: File | null;
  pdfFast: boolean;

  // profilo + layer
  preset: PresetKey;
  selectedLayers: string[];

  // soglia + verifica
  minConfidence: number;
  verify: boolean;
  approver: string | null;
  simulate: boolean;

  // offuscamento (applicato in re-render)
  mode: string;
  enabledSeverities: string[];

  // layout / tema
  theme: ThemeMode;
  settingsCollapsed: boolean;
  choicesTouched: boolean;

  // setters
  setSource: (s: SourceKind) => void;
  setDocText: (t: string) => void;
  setPdfFile: (f: File | null) => void;
  setPdfFast: (v: boolean) => void;
  setPreset: (p: PresetKey, layers: DetectionLayer[]) => void;
  setSelectedLayers: (keys: string[]) => void;
  toggleLayer: (key: string, checked: boolean, layers: DetectionLayer[]) => void;
  initLayers: (layers: DetectionLayer[]) => void;
  setMinConfidence: (v: number) => void;
  setVerify: (v: boolean) => void;
  setApprover: (k: string | null) => void;
  setSimulate: (v: boolean) => void;
  setMode: (m: string) => void;
  setEnabledSeverities: (s: string[]) => void;
  setTheme: (t: ThemeMode) => void;
  setSettingsCollapsed: (v: boolean) => void;
  markChoiceTouched: () => void;
}

const savedTheme = (): ThemeMode =>
  (typeof localStorage !== "undefined" &&
    (localStorage.getItem("theme") as ThemeMode)) ||
  "light";

/** Layer attivi per un profilo, escludendo i non disponibili (ML spento). */
function presetLayers(preset: PresetKey, layers: DetectionLayer[]): string[] {
  if (preset === "debug") return [];
  const wanted = LAYER_PRESETS[preset] || [];
  const available = new Set(layers.filter((l) => l.available).map((l) => l.key));
  return wanted.filter((k) => available.has(k));
}

export const useUiStore = create<UiState>((set, get) => ({
  source: "text",
  docText: "",
  pdfFile: null,
  pdfFast: true,

  preset: "gdpr",
  selectedLayers: [],

  minConfidence: 0.82,
  verify: false,
  approver: null,
  simulate: false,

  mode: "placeholder",
  enabledSeverities: ["critica", "alta", "media", "bassa"],

  theme: savedTheme(),
  settingsCollapsed: false,
  choicesTouched: false,

  setSource: (source) => set({ source }),
  setDocText: (docText) => set({ docText }),
  setPdfFile: (pdfFile) => set({ pdfFile }),
  setPdfFast: (pdfFast) => set({ pdfFast }),

  setPreset: (preset, layers) =>
    set(
      preset === "debug"
        ? { preset }
        : { preset, selectedLayers: presetLayers(preset, layers) },
    ),

  setSelectedLayers: (selectedLayers) => set({ selectedLayers }),

  // Toggle in modalità Debug con isolamento dell'LLM: se l'LLM è attivato,
  // disattiva gli altri layer ML (e viceversa). Le regole (CPU) restano libere.
  toggleLayer: (key, checked, layers) => {
    const meta = layers.find((l) => l.key === key);
    let next = new Set(get().selectedLayers);
    if (checked) {
      next.add(key);
      if (key === "llm") {
        for (const l of layers)
          if (l.key !== "llm" && l.requires_ml) next.delete(l.key);
      } else if (meta?.requires_ml) {
        next.delete("llm");
      }
    } else {
      next.delete(key);
    }
    set({ selectedLayers: [...next] });
  },

  // Inizializza la selezione dal profilo corrente quando i layer sono caricati.
  initLayers: (layers) => {
    const { preset } = get();
    if (preset !== "debug") {
      set({ selectedLayers: presetLayers(preset, layers) });
    } else {
      const available = new Set(
        layers.filter((l) => l.available && l.key !== "llm").map((l) => l.key),
      );
      set({ selectedLayers: [...available] });
    }
  },

  setMinConfidence: (minConfidence) => set({ minConfidence }),
  setVerify: (verify) => set({ verify }),
  setApprover: (approver) => set({ approver }),
  setSimulate: (simulate) => set({ simulate }),
  setMode: (mode) => set({ mode }),
  setEnabledSeverities: (enabledSeverities) => set({ enabledSeverities }),

  setTheme: (theme) => {
    if (typeof localStorage !== "undefined") localStorage.setItem("theme", theme);
    set({ theme });
  },
  setSettingsCollapsed: (settingsCollapsed) => set({ settingsCollapsed }),
  markChoiceTouched: () => set({ choicesTouched: true }),
}));

/** Giudice selezionato effettivo (null se la verifica è off). */
export function selectedApprover(): string | null {
  const s = useUiStore.getState();
  if (!s.verify) return null;
  return s.approver || null;
}

/** "debug (simula llm)": true solo con verifica ON e flag attivo. */
export function isSimulating(): boolean {
  const s = useUiStore.getState();
  return s.verify && s.simulate;
}
