import { useState } from "react";
import type { ClusterTrace, DebugSummary } from "@/api/types";
import { useCatalogStore } from "@/store/catalogStore";
import { useSessionStore } from "@/store/sessionStore";
import { llmAlertMessage } from "@/utils/llmAlert";

type Cat = "kept" | "below" | "overlap";

function debugCategory(c: ClusterTrace): Cat {
  if (c.kept) return "kept";
  return c.passed_threshold ? "overlap" : "below";
}

const CATS: { key: Cat; label: string }[] = [
  { key: "kept", label: "Mantenute" },
  { key: "below", label: "Sotto soglia" },
  { key: "overlap", label: "Scartate (overlap)" },
];

function LlmSummaryChip({ summary }: { summary: DebugSummary }) {
  if (summary.llm_status === "unavailable") {
    return (
      <span
        className="summary-chip chip-llm-off"
        title="Verifica richiesta ma il giudice LLM non è stato costruito: controlla ENABLE_ML e il modello LLM"
      >
        ⚠ Verifica LLM non disponibile
      </span>
    );
  }
  if (summary.llm_status === "active") {
    return (
      <span className="summary-chip chip-llm">
        Giudice LLM: {summary.llm_scored}/{summary.total_clusters} valutate,{" "}
        {summary.llm_rejected} bocciate
      </span>
    );
  }
  if (summary.llm_status === "simulated") {
    return (
      <span
        className="summary-chip chip-llm-sim"
        title="Modalità debug: i prompt del giudice sono stati costruiti ma l'LLM non è stato chiamato"
      >
        Giudice LLM: SIMULATO — {summary.llm_prompts} prompt costruiti, 0 valutazioni
      </span>
    );
  }
  return null;
}

function DebugCard({
  c,
  colors,
  llmActive,
  llmSimulated,
}: {
  c: ClusterTrace;
  colors: Record<string, string>;
  llmActive: boolean;
  llmSimulated: boolean;
}) {
  const stateClass = c.kept ? "dbg-kept" : c.passed_threshold ? "dbg-overlap" : "dbg-below";
  const statusLabel = c.kept
    ? "MANTENUTA"
    : c.passed_threshold
      ? "SCARTATA (overlap)"
      : "SOTTO SOGLIA";
  const hasVote = c.llm_vote !== null && c.llm_vote !== undefined;
  const dominio = c.label || c.entity_type;

  const llmCell = (p: ClusterTrace["contributions"][number]) => {
    if (!p.is_representative) return <td className="dbg-llmscore">—</td>;
    if (hasVote) {
      return c.llm_vote! >= 0 ? (
        <td className="dbg-llmscore llm-yes" title="Confermata dall'LLM">
          {c.llm_vote!.toFixed(2)}
        </td>
      ) : (
        <td className="dbg-llmscore llm-no" title="Bocciata dall'LLM">
          −1
        </td>
      );
    }
    if (llmSimulated) {
      return (
        <td
          className="dbg-llmscore llm-na"
          title="Simulazione: prompt costruito ma LLM non chiamato"
        >
          sim
        </td>
      );
    }
    if (!llmActive) {
      return (
        <td className="dbg-llmscore llm-na" title="Verifica LLM non attiva">
          —
        </td>
      );
    }
    const naTitle =
      debugCategory(c) === "overlap"
        ? "Non sottoposta al giudice: scartata per sovrapposizione prima della verifica"
        : "Il giudice non ha restituito un punteggio per questa frase (risposta non interpretata)";
    return (
      <td className="dbg-llmscore llm-na" title={naTitle}>
        n/d
      </td>
    );
  };

  return (
    <div className={`debug-card ${stateClass}`}>
      <div className="debug-card-head">
        <code className="compare-code orig">{c.text}</code>
        <span className="badge" style={{ background: colors[c.severity] }}>
          {c.severity}
        </span>
        <span className="dbg-type">{c.label}</span>
        <span className="dbg-pos">
          [{c.start}–{c.end}]
        </span>
        <span className={`dbg-status ${stateClass}`}>{statusLabel}</span>
        {c.discarded_reason && <span className="dbg-reason">{c.discarded_reason}</span>}
      </div>

      {c.llm_prompt !== null && c.llm_prompt !== undefined && (
        <details className="dbg-rawprompt">
          <summary>prompt LLM (grezzo)</summary>
          <pre>{c.llm_prompt}</pre>
        </details>
      )}

      <div className="debug-boost">
        Score: <span className="boost-base">{c.base_score.toFixed(2)}</span> base
        {c.agreement_boost > 0 && (
          <>
            {" "}
            <span className="boost-add">+{c.agreement_boost.toFixed(2)}</span> accordo (
            {c.agreement_count} layer)
          </>
        )}{" "}
        ={" "}
        {hasVote ? (
          <>
            <span className="boost-final">
              {(c.base_score + c.agreement_boost).toFixed(2)}
            </span>{" "}
            <small>(score layer)</small>
          </>
        ) : (
          <span className="boost-final">{c.final_score.toFixed(2)}</span>
        )}
        <span className="dbg-thr"> (soglia {c.threshold.toFixed(2)})</span>
      </div>

      {hasVote && (
        <div className={`debug-llm ${c.llm_vote! >= 0 ? "llm-confirmed" : "llm-rejected"}`}>
          <span className="llm-tag">Score LLM</span>{" "}
          {c.llm_vote! >= 0 ? (
            <>
              <span className="llm-yes">✓ confermata</span> — è un riferimento del
              dominio <strong>{dominio}</strong>, score attinenza{" "}
              <strong className="llm-vote">{c.llm_vote!.toFixed(2)}</strong>
            </>
          ) : (
            <>
              <span className="llm-no">✗ bocciata</span> — NON è un riferimento del
              dominio <strong>{dominio}</strong>{" "}
              <span className="llm-vote">(score −1)</span>
            </>
          )}
          <span className="llm-final">
            {" "}
            → score finale <strong>{c.final_score.toFixed(2)}</strong>
          </span>
        </div>
      )}

      <table className="debug-contrib-table">
        <thead>
          <tr>
            <th></th>
            <th>Processo</th>
            <th>Layer</th>
            <th>Tipo</th>
            <th>Score</th>
            <th title="Score assegnato dalla verifica LLM alla frase">LLM score</th>
            <th>Validato</th>
            <th>Sorgente</th>
          </tr>
        </thead>
        <tbody>
          {c.contributions.map((p, i) => (
            <tr key={i} className={p.is_representative ? "contrib-rep" : ""}>
              <td>
                {p.is_representative && (
                  <span className="rep-star" title="Rappresentante del cluster">
                    ★
                  </span>
                )}
              </td>
              <td>
                <code className="dbg-proc">{p.process}</code>
              </td>
              <td>
                <span className="layer-badge">{p.layer}</span>
              </td>
              <td>{p.entity_type}</td>
              <td className="dbg-score">{p.score.toFixed(2)}</td>
              {llmCell(p)}
              <td>{p.validated ? <span className="ok-mark" title="Formato validato">✓</span> : "—"}</td>
              <td>
                <small className="dbg-source">{p.source || "—"}</small>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DebugView() {
  const data = useSessionStore((s) => s.debug);
  const colors = useCatalogStore((s) => s.severityColors);
  const [cat, setCat] = useState<Cat>("kept");

  if (!data) {
    return (
      <p className="hint confronto-hint">
        Premi "Traccia di Debug" per ispezionare ogni frase catturata: quale
        processo l'ha rilevata, lo score, i processi concordanti, i boost e l'esito
        finale.
      </p>
    );
  }

  const { clusters, summary, threshold, method } = data;
  if (!clusters || clusters.length === 0) {
    return (
      <p className="hint confronto-hint">
        Nessuna frase catturata da alcun processo.
      </p>
    );
  }

  const obscuredNoScore = clusters.filter(
    (c) => c.kept && (c.llm_vote === null || c.llm_vote === undefined),
  ).length;
  const banner = llmAlertMessage({
    status: summary.llm_status,
    scored: summary.llm_scored,
    total: summary.total_clusters,
    obscured_without_score: obscuredNoScore,
  });

  const byCat: Record<Cat, ClusterTrace[]> = { kept: [], below: [], overlap: [] };
  for (const c of clusters) byCat[debugCategory(c)].push(c);
  for (const k of Object.keys(byCat) as Cat[]) {
    byCat[k].sort((a, b) => a.start - b.start || a.end - b.end);
  }

  return (
    <div id="debug-view">
      {banner && (
        <div className={`llm-alert debug-llm-banner ${banner.level}`}>
          <span className="llm-alert-icon">⚠</span>
          <span>{banner.text}</span>
        </div>
      )}

      <div className="debug-summary">
        <span className="summary-chip">
          Metodologia: <strong>{method}</strong>
        </span>
        <span className="summary-chip">
          Soglia: <strong>{threshold.toFixed(2)}</strong>
        </span>
        <span className="summary-chip chip-all">
          {summary.total_clusters} frasi catturate
        </span>
        <span className="summary-chip chip-kept">{summary.kept} mantenute</span>
        <span className="summary-chip chip-below">
          {summary.below_threshold} sotto soglia
        </span>
        <span className="summary-chip chip-overlap">
          {summary.dropped_overlap} scartate per overlap
        </span>
        <LlmSummaryChip summary={summary} />
      </div>

      <div className="inner-tabs">
        {CATS.map((c) => (
          <button
            key={c.key}
            className={`inner-tab${cat === c.key ? " active" : ""}`}
            onClick={() => setCat(c.key)}
          >
            {c.label} ({byCat[c.key].length})
          </button>
        ))}
      </div>

      <div className="inner-panes">
        <div className="inner-pane active">
          {byCat[cat].length ? (
            <div className="debug-cards">
              {byCat[cat].map((c, i) => (
                <DebugCard
                  key={i}
                  c={c}
                  colors={colors}
                  llmActive={summary.llm_active}
                  llmSimulated={summary.llm_simulated}
                />
              ))}
            </div>
          ) : (
            <p className="hint confronto-hint">Nessuna voce in questa categoria.</p>
          )}
        </div>
      </div>
    </div>
  );
}
