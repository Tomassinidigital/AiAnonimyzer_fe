import { PRESET_HINTS, PRESETS, type PresetKey } from "@/constants";
import { useCatalogStore } from "@/store/catalogStore";
import { useUiStore } from "@/store/uiStore";
import { useSessionStore } from "@/store/sessionStore";

export function ProfileSection() {
  const preset = useUiStore((s) => s.preset);
  const selectedLayers = useUiStore((s) => s.selectedLayers);
  const setPreset = useUiStore((s) => s.setPreset);
  const toggleLayer = useUiStore((s) => s.toggleLayer);
  const markChoiceTouched = useUiStore((s) => s.markChoiceTouched);
  const layers = useCatalogStore((s) => s.layers);
  const setStatus = useSessionStore((s) => s.setStatus);

  const isDebug = preset === "debug";

  function onPreset(p: PresetKey) {
    setPreset(p, layers);
    markChoiceTouched();
  }

  function onToggle(key: string, checked: boolean) {
    const wasLlm = key === "llm";
    const meta = layers.find((l) => l.key === key);
    toggleLayer(key, checked, layers);
    if (checked && wasLlm) {
      setStatus("LLM in modalità isolata: gira da solo, altri layer ML disattivati.");
    } else if (checked && meta?.requires_ml && selectedLayers.includes("llm")) {
      setStatus("LLM disattivato: non può girare insieme ad altri layer ML.");
    }
    markChoiceTouched();
  }

  return (
    <section className="field">
      <label className="field-label">
        Profilo di rilevamento
        <span className="apply-tag" title="Si applica alla prossima analisi">
          nuova analisi
        </span>
      </label>
      <div className="seg-control preset-switch">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            className={`seg${preset === p.key ? " active" : ""}`}
            title={p.title}
            onClick={() => onPreset(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <small className="hint">{PRESET_HINTS[preset]}</small>

      {isDebug && (
        <>
          <div className="layer-list">
            {layers.map((l) => {
              const reason = l.available ? "" : l.unavailable_reason || "non disponibile";
              const slow = /lentissimo|molto lento/i.test(l.cost || "");
              const checked = selectedLayers.includes(l.key);
              return (
                <label
                  key={l.key}
                  className={`layer-item${l.available ? "" : " layer-unavailable"}`}
                  title={l.description + (reason ? " — " + reason : "")}
                >
                  <input
                    type="checkbox"
                    className="layer-check"
                    checked={checked}
                    disabled={!l.available}
                    onChange={(e) => onToggle(l.key, e.target.checked)}
                  />
                  <span className="layer-text">
                    <span className="layer-label">{l.label}</span>
                    {l.requires_ml && <span className="layer-ml">ML</span>}
                    {l.cost && (
                      <span className={`layer-cost${slow ? " layer-cost-slow" : ""}`}>
                        {l.cost}
                      </span>
                    )}
                    <small className="layer-desc">{l.description}</small>
                    {reason && <small className="layer-warning">⚠ {reason}</small>}
                  </span>
                </label>
              );
            })}
          </div>
          <small className="hint layer-list-hint">
            I layer lavorano <strong>in parallelo</strong>: ognuno analizza tutto il
            testo. Alla fine i risultati si fondono e chi è rilevato da più layer
            riceve il boost di accordo. La priorità indica solo chi prevale sulle
            sovrapposizioni.
          </small>
        </>
      )}
    </section>
  );
}
