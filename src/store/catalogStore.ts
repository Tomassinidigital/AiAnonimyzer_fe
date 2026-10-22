import { create } from "zustand";
import type { ApproversResponse, DetectionLayer, UiConfig } from "@/api/types";

/**
 * Cataloghi di bootstrap (configurazione UI, layer, giudici), popolati una volta
 * all'avvio. Tenuti in uno store globale così anche l'orchestratore imperativo
 * delle run (non un componente React) può leggerli via getState().
 */
interface CatalogState {
  config: UiConfig | null;
  layers: DetectionLayer[];
  approvers: ApproversResponse | null;
  severityColors: Record<string, string>;
  setConfig: (config: UiConfig) => void;
  setLayers: (layers: DetectionLayer[]) => void;
  setApprovers: (approvers: ApproversResponse) => void;
}

export const useCatalogStore = create<CatalogState>((set) => ({
  config: null,
  layers: [],
  approvers: null,
  severityColors: {},
  setConfig: (config) =>
    set({
      config,
      severityColors: Object.fromEntries(
        config.severities.map((s) => [s.key, s.color]),
      ),
    }),
  setLayers: (layers) => set({ layers }),
  setApprovers: (approvers) => set({ approvers }),
}));

/** Etichetta di un layer dato il suo key (fallback al key stesso). */
export function layerLabel(key: string): string {
  const l = useCatalogStore.getState().layers.find((x) => x.key === key);
  return l ? l.label : key;
}
