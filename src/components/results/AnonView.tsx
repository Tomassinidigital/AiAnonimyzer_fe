import { useState } from "react";
import { INNER_MODES } from "@/constants";
import { useSessionStore } from "@/store/sessionStore";

export function AnonView() {
  const render = useSessionStore((s) => s.render);
  const multi = useSessionStore((s) => s.multiRender);
  const [innerMode, setInnerMode] = useState<string>(INNER_MODES[0].key);

  if (multi) {
    return (
      <div className="pane-multimode">
        <div className="inner-tabs">
          {INNER_MODES.map((m) => (
            <button
              key={m.key}
              className={`inner-tab${innerMode === m.key ? " active" : ""}`}
              onClick={() => setInnerMode(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="inner-panes">
          {INNER_MODES.map((m) => (
            <div
              key={m.key}
              className={`inner-pane${innerMode === m.key ? " active" : ""}`}
            >
              <pre className="doc-view mono">{multi[m.key]?.anonymized_text ?? ""}</pre>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return <pre className="doc-view mono">{render?.anonymized_text ?? ""}</pre>;
}
