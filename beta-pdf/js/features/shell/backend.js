/* Configurazione dal backend all'avvio: ui-config (modalità, gravità, ranking,
   baseline), giudici LLM e moduli di rilevamento. Se il backend non risponde
   resta la configurazione di ripiego e l'editor lo segnala. */

import { FALLBACK_UI_CONFIG } from "../../core/config.js";
import { EV } from "../../core/store.js";

export async function loadBackendConfig({ state, bus, catalogApi }) {
  const cfg = await catalogApi.ping();
  state.backendUp = !!cfg;
  state.cfg = cfg || FALLBACK_UI_CONFIG;
  state.baseline = state.cfg.default_min_confidence ?? 0.82;
  state.rankStep = state.cfg.rank_step ?? 0.1;
  (state.cfg.rankings || []).forEach((r) => (state.rankInfo[r.rank] = r));
  state.ranks = new Set(state.cfg.default_ranks || [1, 2]);
  (state.cfg.severities || []).forEach((s) => (state.sevColors[s.key] = s.color));
  state.mode = (state.cfg.modes && state.cfg.modes[0] && state.cfg.modes[0].key) || "placeholder";
  if (state.backendUp) {
    const [approvers, modules] = await Promise.all([
      catalogApi.getApprovers().then((a) => a.approvers || []),
      catalogApi.getModules(),
    ]);
    state.approvers = approvers;
    state.modules = modules;
  }
  bus.emit(EV.BACKEND);
}
