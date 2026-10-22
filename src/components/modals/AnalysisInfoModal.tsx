import { useEffect } from "react";
import { createPortal } from "react-dom";

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Informativa del profilo "Analisi": si apre alla selezione del profilo, prima
 * di avviare la run, e spiega cosa abilita rispetto ai profili predefiniti.
 *
 * Montata in portale su <body>: il pannello Impostazioni ha animazioni con
 * transform, che altrimenti farebbero da contenitore all'overlay `fixed`.
 */
export function AnalysisInfoModal({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="analysis-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-box analysis-box">
        <h2 id="analysis-title" className="modal-title trial-title">
          Profilo Analisi — cosa apre
        </h2>
        <p className="intro-desc">
          È il profilo aperto: scegli tu i singoli layer, e il pulsante{" "}
          <b>Traccia di Analisi</b> esegue una run completa in <b>3 passi</b>,
          mostrando come si è formato ogni rilevamento.
        </p>
        <ol className="intro-points">
          <li>
            <b>Rilevamento</b> — popola Evidenziato, Anonimizzato, Report e JSON,
            con i soli layer che hai selezionato qui sotto.
          </li>
          <li>
            <b>Confronto metodologie</b> — esegue ogni layer separatamente e apre
            il tab <b>Metodi</b>: chi ha catturato cosa, con lo score grezzo.
          </li>
          <li>
            <b>Traccia</b> — apre il tab <b>Analisi</b>: per ogni frase i processi
            concordi, il boost di accordo e l'esito finale.
          </li>
        </ol>
        <p className="intro-feature">
          Novità rispetto ai profili predefiniti: <b>scelta manuale dei layer</b>,{" "}
          <b>confronto tra le metodologie</b> e <b>traccia dei punteggi</b>.
        </p>
        <p className="intro-warning">
          Più lento di una normale analisi: ogni layer viene eseguito anche da
          solo. L'LLM generativo resta isolato — attivandolo, gli altri layer ML
          si disattivano.
        </p>
        <div className="modal-actions">
          <button className="btn-primary" type="button" onClick={onClose}>
            Ho capito
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
