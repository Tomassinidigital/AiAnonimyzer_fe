import { isSimulating, selectedApprover, useUiStore } from "@/store/uiStore";

/**
 * Snapshot delle SOLE opzioni che richiedono una nuova analisi (modalità e
 * gravità — opzioni "subito" — restano fuori). Usato per il banner "risultati
 * obsoleti": se la configurazione corrente differisce da quella che ha prodotto
 * i risultati a schermo, compare l'avviso.
 */
export function configSnapshot(): string {
  const s = useUiStore.getState();
  return JSON.stringify({
    source: s.source,
    layers: [...s.selectedLayers].sort(),
    minConfidence: s.minConfidence,
    verify: s.verify,
    approver: selectedApprover(),
    simulate: isSimulating(),
  });
}
