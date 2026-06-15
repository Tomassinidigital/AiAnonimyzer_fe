import { useEffect } from "react";

interface Props {
  open: boolean;
  version: string;
  onClose: () => void;
}

export function IntroModal({ open, version, onClose }: Props) {
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
      aria-labelledby="intro-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-box intro-box">
        <h2 id="intro-title" className="modal-title intro-title">
          Anonimizzatore Documenti di Gara
        </h2>
        <p className="intro-desc">
          Individua e offusca dati personali e sensibili — nomi, codici fiscali,
          IBAN, PEC, indirizzi, importi… — in testi e PDF di gare e appalti,
          combinando più livelli di rilevamento. Elaborazione 100% locale, conforme
          al GDPR.
        </p>
        <ol className="intro-points">
          <li>
            <b>Layer Regole</b> — riconoscitori a pattern catturano dati
            strutturati: CIG, CUP, IBAN, PEC, codici fiscali, importi e simili.
          </li>
          <li>
            <b>Layer NER</b> — modelli linguistici addestrati riconoscono nomi,
            organizzazioni, luoghi e altri dati personali dal testo.
          </li>
          <li>
            <b>Layer LLM</b> — un modello generativo locale coglie il{" "}
            <em>contesto</em> e cattura dati che regole e NER non vedono, senza che
            nulla lasci il server.
          </li>
          <li>
            <b>Giudice LLM</b> — uno stadio a valle rivaluta ogni rilevamento e ne
            corregge il punteggio (media pesata), tagliando i falsi positivi.
          </li>
        </ol>
        <p className="intro-feature">
          Accetta <b>testo e file PDF</b> e produce un'<b>anteprima PDF</b> con il
          testo anonimizzato, pronta da <b>scaricare</b>.
        </p>
        <p className="intro-warning">
          Attenzione: il file viene elaborato lato server.
        </p>
        <div className="modal-actions">
          <button className="btn-primary" type="button" onClick={onClose}>
            Accetto
          </button>
        </div>
        {version && <p className="intro-version">v.{version}</p>}
      </div>
    </div>
  );
}
