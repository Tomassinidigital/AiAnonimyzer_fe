/* Navigazione tra le redazioni (▲▼ nella toolbar), in ordine di lettura e
   rispettando il filtro della lista laterale. */

import { EV } from "../../core/store.js";
import { navigationOrder } from "../../domain/redactions.js";
import { $ } from "../../shared/dom.js";

export function createNavigator({ state, bus, viewer }) {
  function updateCounter() {
    const tot = state.navList.length;
    $("#tb-red-cur").textContent = state.navIdx >= 0 ? state.navIdx + 1 : "–";
    $("#tb-red-tot").textContent = tot || "–";
    $("#tb-prev-red").disabled = tot === 0 || state.navIdx <= 0;
    $("#tb-next-red").disabled = tot === 0 || state.navIdx >= tot - 1;
  }

  function refresh() {
    state.navList = navigationOrder(state);
    if (state.navIdx >= state.navList.length) state.navIdx = state.navList.length - 1;
    updateCounter();
  }

  function go(delta) {
    const n = state.navList.length;
    if (!n) return;
    state.navIdx = state.navIdx < 0 ? (delta > 0 ? 0 : n - 1) : Math.max(0, Math.min(n - 1, state.navIdx + delta));
    const { gid, oi } = state.navList[state.navIdx];
    const g = state.groups.find((x) => x.id === gid);
    const occ = g && g.occurrences[oi];
    if (occ) {
      viewer.reveal(occ.page, occ.boxes[0], {
        offset: 150, pick: (overlay) => overlay.querySelector(`.redaction-box[data-g="${gid}"][data-o="${oi}"]`),
      });
    }
    updateCounter();
  }

  function mount() {
    $("#tb-prev-red").addEventListener("click", () => go(-1));
    $("#tb-next-red").addEventListener("click", () => go(1));
    bus.on(EV.REDACTIONS, refresh);
    bus.on(EV.LIST_FILTER, () => { state.navIdx = -1; refresh(); });
  }

  return { mount };
}
