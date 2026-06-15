import { INNER_MODES } from "@/constants";
import { obfuscateLocal } from "@/utils/obfuscate";
import { useCatalogStore } from "@/store/catalogStore";
import { useSessionStore } from "@/store/sessionStore";

export function ConfrontoView() {
  const render = useSessionStore((s) => s.render);
  const multi = useSessionStore((s) => s.multiRender);
  const colors = useCatalogStore((s) => s.severityColors);

  if (!render || !multi) {
    return (
      <p className="hint confronto-hint">
        Seleziona "Tutti i metodi" per confrontare le modalità di offuscamento.
      </p>
    );
  }

  const entities = render.segments.filter((s) => s.entity_type);
  if (entities.length === 0) {
    return <p className="hint confronto-hint">Nessuna entità rilevata.</p>;
  }

  return (
    <div id="confronto-view">
      <div className="confronto-header">
        <strong>{entities.length}</strong> entità rilevate — confronto tra i{" "}
        {INNER_MODES.length} metodi di offuscamento
      </div>
      <div className="compare-scroll">
        <table className="compare-table">
          <thead>
            <tr>
              <th>Testo originale</th>
              <th>Tipo</th>
              <th>Gravità</th>
              {INNER_MODES.map((m) => (
                <th key={m.key}>{m.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entities.map((seg, i) => (
              <tr key={i}>
                <td>
                  <code className="compare-code orig">{seg.text}</code>
                </td>
                <td>{seg.label}</td>
                <td>
                  <span
                    className="badge"
                    style={{ background: colors[seg.severity ?? ""] }}
                  >
                    {seg.severity}
                  </span>
                </td>
                {INNER_MODES.map((m) => (
                  <td key={m.key}>
                    <code className="compare-code">
                      {obfuscateLocal(seg.text, seg.label ?? "", m.key)}
                    </code>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
