import { SEVERITY_ORDER } from "@/constants";
import { useCatalogStore } from "@/store/catalogStore";
import { useSessionStore } from "@/store/sessionStore";

export function ReportView() {
  const report = useSessionStore((s) => s.render?.report);
  const colors = useCatalogStore((s) => s.severityColors);
  if (!report) return null;

  return (
    <div id="report-view">
      <div className="report-cards">
        {SEVERITY_ORDER.map((s) => (
          <div
            key={s}
            className="report-card"
            style={{ borderTopColor: colors[s] }}
          >
            <div className="num">{report.by_severity[s] || 0}</div>
            <div className="lbl">{s}</div>
          </div>
        ))}
      </div>
      <table className="report-table">
        <thead>
          <tr>
            <th>Gravità</th>
            <th>Etichetta</th>
            <th>Tipo</th>
            <th>Conteggio</th>
            <th>Rilevata</th>
          </tr>
        </thead>
        <tbody>
          {report.rows.length === 0 ? (
            <tr>
              <td colSpan={5}>Nessun rilevamento.</td>
            </tr>
          ) : (
            report.rows.map((r, i) => (
              <tr key={i}>
                <td>
                  <span className="badge" style={{ background: colors[r.severity] }}>
                    {r.severity}
                  </span>
                </td>
                <td>{r.label}</td>
                <td>{r.entity_type}</td>
                <td>{r.count}</td>
                <td className="report-detected">
                  {r.samples && r.samples.length
                    ? r.samples.map((s, j) => (
                        <span key={j} className="report-phrase">
                          {s}
                        </span>
                      ))
                    : "—"}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
