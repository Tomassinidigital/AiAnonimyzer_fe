import { useEffect, useState } from "react";
import { useFeedbackStore } from "@/store/feedbackStore";
import { fmtElapsed } from "@/utils/format";

export function RunStats() {
  const runStats = useFeedbackStore((s) => s.runStats);
  const close = useFeedbackStore((s) => s.runStatsClose);
  const [total, setTotal] = useState("0s");

  useEffect(() => {
    if (!runStats.visible || runStats.t0 == null) return;
    const tick = () =>
      setTotal(fmtElapsed(Math.round((Date.now() - runStats.t0!) / 1000)));
    tick();
    if (!runStats.running) return; // congela il totale a fine processo
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [runStats.visible, runStats.running, runStats.t0]);

  if (!runStats.visible) return null;

  return (
    <aside className="run-stats" role="status" aria-live="off">
      <div className="rs-head">
        <span className="rs-title">Tempi</span>
        <b className="rs-total">{total}</b>
        <button
          className="rs-close"
          title="Chiudi il riepilogo tempi"
          aria-label="Chiudi il riepilogo tempi"
          onClick={close}
        >
          ✕
        </button>
      </div>
      <ul className="rs-rows">
        {runStats.rows.map((r) => (
          <li key={r.key}>
            <span className="rs-name">{r.label}</span>
            <span className="rs-time">{r.value}</span>
          </li>
        ))}
      </ul>
      <div className="rs-phase">{runStats.phase}</div>
    </aside>
  );
}
