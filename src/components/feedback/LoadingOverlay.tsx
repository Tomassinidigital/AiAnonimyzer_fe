import { useEffect, useMemo, useState } from "react";
import { useFeedbackStore } from "@/store/feedbackStore";
import { useUiStore } from "@/store/uiStore";

interface Tip {
  gif: string;
  text: string;
}

function loadingTabTips(
  kind: "analyze" | "debug" | null,
  source: string,
  mode: string,
): Tip[] {
  const tips: Tip[] = [
    {
      gif: "evidenziato",
      text: 'Tab "Evidenziato": il testo con le entità colorate per gravità. Seleziona del testo e premi "Oscura" per nasconderlo; clicca un\'entità già evidenziata e "Ripristina".',
    },
  ];
  if (source === "pdf")
    tips.push({
      gif: "pdf",
      text: 'Tab "Anteprima PDF": il documento originale con le redazioni sovrapposte; da qui scarichi il PDF redatto.',
    });
  tips.push({
    gif: "anonimizzato",
    text: 'Tab "Anonimizzato": il testo con i dati offuscati secondo la "Modalità di offuscamento" scelta.',
  });
  tips.push({
    gif: "report",
    text: 'Tab "Report": conteggi per tipo e gravità, con l\'elenco delle frasi rilevate.',
  });
  tips.push({
    gif: "json",
    text: 'Tab "JSON": esportazione strutturata e completa dei rilevamenti, da copiare o scaricare.',
  });
  if (mode === "all")
    tips.push({
      gif: "confronto",
      text: 'Tab "Confronto": come appare ogni entità nelle 4 modalità di offuscamento, a confronto.',
    });
  if (kind === "debug") {
    tips.push({
      gif: "metodi",
      text: 'Tab "Metodi": quali metodologie hanno catturato ogni frase, con lo score grezzo (prima di boost e fusione).',
    });
    tips.push({
      gif: "debug",
      text: 'Tab "Debug": per ogni frase il processo che l\'ha rilevata, score, processi concordi, boost ed esito finale.',
    });
  }
  return tips;
}

export function LoadingOverlay() {
  const loading = useFeedbackStore((s) => s.loading);
  const source = useUiStore((s) => s.source);
  const mode = useUiStore((s) => s.mode);
  const [idx, setIdx] = useState(0);

  const tips = useMemo(
    () => loadingTabTips(loading.tipsKind, source, mode),
    [loading.tipsKind, source, mode],
  );

  useEffect(() => {
    if (!loading.visible) return;
    setIdx(0);
    const id = setInterval(() => setIdx((i) => (i + 1) % tips.length), 4500);
    return () => clearInterval(id);
  }, [loading.visible, tips.length]);

  if (!loading.visible) return null;
  const tip = tips[idx] ?? tips[0];

  return (
    <div className="loading-overlay" role="status" aria-live="polite">
      <div className="spinner" />
      <span>{loading.text}</span>
      <small className="loading-sub">{loading.sub}</small>
      {loading.progress != null && (
        <div className="progress">
          <div
            className={`progress-bar${loading.progress < 0.05 ? " indeterminate" : ""}`}
          >
            <span style={{ width: `${(loading.progress || 0.02) * 100}%` }} />
          </div>
        </div>
      )}
      <div className="loading-tips lt-cycle" aria-live="polite">
        <p className="lt-text">
          <span className="lt-ico" aria-hidden="true">
            💡
          </span>
          <span>{tip.text}</span>
        </p>
        <img
          className="lt-gif"
          src={`${import.meta.env.BASE_URL}img/tab-${tip.gif}.gif`}
          alt=""
        />
      </div>
    </div>
  );
}
