/* Avviso su dati salvati nel browser e token tecnico, con rimando all'Informativa privacy.

   Il sito usa solo strumenti tecnici (nessuna profilazione, nessuna analisi): per le linee
   guida cookie del Garante (10/06/2021) non serve il consenso, basta l'informativa. Il
   banner è quindi di sola presa visione. La chiusura si ricorda in localStorage; se lo
   storage è bloccato l'avviso ricompare a ogni visita, senza errori. */

import { $ } from "../../shared/dom.js";

const DISMISSED_KEY = "beta.privacy-notice.dismissed";

function isDismissed() {
  try { return localStorage.getItem(DISMISSED_KEY) === "1"; } catch (_e) { return false; }
}
function rememberDismissed() {
  try { localStorage.setItem(DISMISSED_KEY, "1"); } catch (_e) { /* storage bloccato */ }
}

export function createPrivacyNotice() {
  function mount() {
    const banner = $("#privacy-notice");
    if (!banner || isDismissed()) return; // resta nascosto (classe `hidden` nel markup)
    banner.classList.remove("hidden");
    $("#privacy-notice-ok").addEventListener("click", () => {
      rememberDismissed();
      banner.classList.add("hidden");
    });
  }
  return { mount };
}
