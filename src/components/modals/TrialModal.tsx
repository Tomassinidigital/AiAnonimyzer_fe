import { useEffect } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Avviso di PROVA GRATUITA: durante il trial le funzionalità del piano Pro
 * sono attive per tutti, tranne il Giudice LLM (Verifica LLM). Mostrata a ogni
 * ingresso nell'app, subito dopo la modale introduttiva.
 */
export function TrialModal({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="trial-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-box trial-box">
        <h2 id="trial-title" className="modal-title trial-title">
          Funzionalità Pro in prova gratuita
        </h2>
        <p className="intro-desc">
          Le voci marcate <span className="pro-tag">Pro</span> nel pannello
          Impostazioni sono, per il periodo di prova, utilizzabili{" "}
          <b>gratuitamente</b> da tutti — con la sola eccezione del Giudice LLM.
        </p>
        <ul className="trial-list">
          <li className="trial-in">Profilo <b>GDPR+</b></li>
          <li className="trial-in">Profilo <b>Documenti di gara</b> (bandi)</li>
          <li className="trial-in">
            Profilo <b>Analisi</b> e layer avanzati (Presidio, Similarità
            semantica, Zero-shot, LLM generativo)
          </li>
          <li className="trial-out">
            <b>Giudice LLM</b> (Verifica LLM) — solo con il piano Pro
          </li>
        </ul>
        <div className="modal-actions">
          <a className="btn-secondary trial-link" href="#account" onClick={onClose}>
            Vedi i piani
          </a>
          <button className="btn-primary" type="button" onClick={onClose}>
            Continua
          </button>
        </div>
      </div>
    </div>
  );
}
