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
  // Durata della conservazione dei dati (CACHE_TTL) nella schermata iniziale.
  const ttlMin = Math.max(1, Math.round((state.cfg.doc_ttl || 300) / 60));
  const introTtl = document.getElementById("intro-ttl");
  const ttlText = `${ttlMin} minut${ttlMin === 1 ? "o" : "i"}`;
  if (introTtl) introTtl.textContent = ttlText;
  document.querySelectorAll("[data-ttl]").forEach((el) => { el.textContent = ttlText; });
  // Prima modalità per il PDF: il box nero (default).
  const modes = state.cfg.pdf_modes || state.cfg.modes || [];
  state.mode = (modes[0] && modes[0].key) || "box";
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
