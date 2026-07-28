import { useCatalogStore } from "@/store/catalogStore";
import { useSessionStore } from "@/store/sessionStore";

export function MetodiView() {
  const data = useSessionStore((s) => s.compare);
  const colors = useCatalogStore((s) => s.severityColors);
  if (!data) return null;

  const { methods, method_labels, entities, summary } = data;

  if (methods.length < 2) {
    return (
      <p className="hint confronto-hint">
        Sono necessarie almeno due metodologie abilitate per il confronto.
      </p>
    );
  }

  if (entities.length === 0) {
    return (
      <div className="methods-summary">
        <strong>{summary.total_unique}</strong> entità uniche trovate — tutte
        rilevate da tutti i metodi, nessuna discrepanza.
      </div>
    );
  }

  const methodCount = methods.length;

  return (
    <div id="metodi-view">
      <div className="methods-summary">
        <span className="summary-chip chip-raw">
          dati GREZZI · no boost · no fusione
        </span>
        <span className="summary-chip chip-all">
          {summary.found_by_all} trovate da tutti
        </span>
        <span className="summary-chip chip-partial">
          {summary.partial} parziali/esclusive
        </span>
        <span className="methods-legend">
          <span className="legend-dot exclusive-dot" /> Solo 1 metodo &nbsp;
          <span className="legend-dot partial-dot" /> Più metodi
        </span>
      </div>
      <p className="hint">
        Per ogni frase: ✓ + <strong>score grezzo</strong> del riconoscitore e il{" "}
        <strong>processo</strong> che l'ha catturata, prima di boost e fusione.
      </p>
      <div className="compare-scroll">
        <table className="methods-table">
          <thead>
            <tr>
              <th>Frase rilevata</th>
              <th>Gravità</th>
              <th>Copertura</th>
              {methods.map((k) => (
                <th key={k} className="method-col" title={k}>
                  {method_labels[k]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entities.map((ent, i) => {
              const isExclusive = ent.found_by.length === 1;
              return (
                <tr
                  key={i}
                  className={isExclusive ? "row-exclusive" : "row-partial"}
                  data-found={ent.found_by.length}
                >
                  <td className="entity-text-cell">
                    <code className="compare-code orig">{ent.text}</code>
                  </td>
                  <td>
                    <span
                      className="badge"
                      style={{ background: colors[ent.severity] }}
                    >
                      {ent.severity}
                    </span>
                  </td>
                  <td className="found-by-cell">
                    <span className="found-pill">
                      {ent.found_by.length}/{methodCount}
                    </span>
                  </td>
                  {methods.map((k) => {
                    const info = ent.by_method[k];
                    if (!info) {
                      return (
                        <td key={k} className="cell-missing">
                          <span className="cross-icon">✗</span>
                        </td>
                      );
                    }
                    const procs = (info.processes || []).join(", ");
                    return (
                      <td key={k} className="cell-found">
                        <span className="check-icon">✓</span>
                        <span className="score-val">{info.score.toFixed(2)}</span>
                        {info.count > 1 && (
                          <span className="occur-count">×{info.count}</span>
                        )}
                        <br />
                        <small className="method-proc" title={procs}>
                          {procs}
                        </small>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
