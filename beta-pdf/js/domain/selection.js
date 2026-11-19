/* Selezione "live" di ciò che si vede e si oscura: moduli attivi, baseline e
   ranking. Il server la applica ai candidati già analizzati (overlay, download):
   cambiarla non richiede una nuova analisi. */

// Parametri da inviare a overlay e download.
export function viewParams(state) {
  const base = baseModuleKey(state);
  return {
    // Solo i moduli aggiuntivi già analizzati: uno appena spuntato entra dopo
    // /modules. Il base (GDPR) è sempre analizzato: `base` dice se si vede.
    modules: Array.from(state.activeModules)
      .filter((k) => k !== base && state.analyzedModules.has(k)),
    base: !base || state.activeModules.has(base),
    baseline: state.baseline,
    ranks: Array.from(state.ranks).sort(),
  };
}

// Chiave del modulo base (GDPR) dal catalogo del server; null se non noto.
export function baseModuleKey(state) {
  const m = state.modules.find((x) => x.base);
  return m ? m.key : null;
}

export const sevArray = (state) => (state.severities ? Array.from(state.severities) : null);

/* Ranking dello score rispetto alla baseline T (passo s): 1 ≥ T; 2 [T−s, T);
   3 [T−2s, T−s); 4 < T−2s. La classificazione la fa il server; qui servono
   colori, etichette e gli intervalli da mostrare accanto alle caselle. */
export const rankColor = (state, rank) => (state.rankInfo[rank] && state.rankInfo[rank].color) || "#334155";
export const rankLabel = (state, rank) => (state.rankInfo[rank] && state.rankInfo[rank].label) || "";

// Stessa formula del server (core/pipeline/ranking.py::rank_of), con la sua tolleranza.
const RANK_EPS = 1e-9;
export function rankOf(score, baseline, step) {
  if (score >= baseline - RANK_EPS) return 1;
  if (score >= baseline - step - RANK_EPS) return 2;
  if (score >= baseline - 2 * step - RANK_EPS) return 3;
  return 4;
}

/* Baseline con cui uno score cade in ciascun ranking (inverso di rankOf):
   1 se T ≤ s; 2 se s < T ≤ s+step; 3 se s+step < T ≤ s+2·step; 4 se T > s+2·step.
   Limitata a [0, 1]: "—" se nessuna baseline ammessa porta in quel ranking. */
export function baselineToReach(score, step) {
  const f = (v) => Math.min(1, Math.max(0, v)).toFixed(2);
  const out = {
    1: `≤ ${f(score)}`,
    2: `${f(score)} – ${f(score + step)}`,
    3: `${f(score + step)} – ${f(score + 2 * step)}`,
    4: `> ${f(score + 2 * step)}`,
  };
  if (score + step > 1) out[3] = "—";
  if (score + 2 * step >= 1) out[4] = "—";
  if (score >= 1) out[2] = "—";
  return out;
}

export function rankRanges(baseline, step) {
  const f = (v) => Math.max(0, v).toFixed(2);
  return {
    1: `≥ ${f(baseline)}`,
    2: `${f(baseline - step)} – ${f(baseline)}`,
    3: `${f(baseline - 2 * step)} – ${f(baseline - step)}`,
    4: `< ${f(baseline - 2 * step)}`,
  };
}
