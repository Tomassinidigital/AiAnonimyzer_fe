/* Selezione "live" di ciò che si vede e si oscura: moduli attivi, baseline e
   ranking. Il server la applica ai candidati già analizzati (overlay, download):
   cambiarla non richiede una nuova analisi. */

// Parametri da inviare a overlay e download.
export function viewParams(state) {
  return {
    // Solo i moduli già analizzati: uno appena spuntato entra dopo /modules.
    modules: Array.from(state.activeModules).filter((k) => state.analyzedModules.has(k)),
    baseline: state.baseline,
    ranks: Array.from(state.ranks).sort(),
  };
}

export const sevArray = (state) => (state.severities ? Array.from(state.severities) : null);

/* Ranking dello score rispetto alla baseline T (passo s): 1 ≥ T; 2 [T−s, T);
   3 [T−2s, T−s); 4 < T−2s. La classificazione la fa il server; qui servono
   colori, etichette e gli intervalli da mostrare accanto alle caselle. */
export const rankColor = (state, rank) => (state.rankInfo[rank] && state.rankInfo[rank].color) || "#334155";
export const rankLabel = (state, rank) => (state.rankInfo[rank] && state.rankInfo[rank].label) || "";

export function rankRanges(baseline, step) {
  const f = (v) => Math.max(0, v).toFixed(2);
  return {
    1: `≥ ${f(baseline)}`,
    2: `${f(baseline - step)} – ${f(baseline)}`,
    3: `${f(baseline - 2 * step)} – ${f(baseline - step)}`,
    4: `< ${f(baseline - 2 * step)}`,
  };
}
