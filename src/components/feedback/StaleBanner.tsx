import { useUiStore } from "@/store/uiStore";
import { useSessionStore } from "@/store/sessionStore";
import { configSnapshot } from "@/utils/snapshot";
import { runAnalyze } from "@/features/runner";

export function StaleBanner() {
  // Sottoscrizione alle opzioni che incidono sullo snapshot, per ricalcolare.
  useUiStore((s) => s.source);
  useUiStore((s) => s.selectedLayers);
  useUiStore((s) => s.minConfidence);
  useUiStore((s) => s.verify);
  useUiStore((s) => s.approver);
  useUiStore((s) => s.simulate);

  const lastSnapshot = useSessionStore((s) => s.lastAnalysisSnapshot);
  const docId = useSessionStore((s) => s.docId);

  const stale =
    lastSnapshot !== null && docId !== null && configSnapshot() !== lastSnapshot;
  if (!stale) return null;

  return (
    <div className="stale-banner" role="status">
      <span className="stale-ico" aria-hidden="true">
        ⚠
      </span>
      <span className="stale-msg">
        Impostazioni modificate: i risultati mostrati usano la configurazione
        precedente.
      </span>
      <button className="btn-ghost" onClick={runAnalyze}>
        Riesegui analisi
      </button>
    </div>
  );
}
