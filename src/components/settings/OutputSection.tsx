import { Select } from "antd";
import { SEVERITY_ORDER } from "@/constants";
import { cap } from "@/utils/format";
import { useCatalogStore } from "@/store/catalogStore";
import { useUiStore } from "@/store/uiStore";
import { applyReRender } from "@/features/runner";

export function OutputSection() {
  const mode = useUiStore((s) => s.mode);
  const enabledSeverities = useUiStore((s) => s.enabledSeverities);
  const setMode = useUiStore((s) => s.setMode);
  const setEnabledSeverities = useUiStore((s) => s.setEnabledSeverities);
  const markChoiceTouched = useUiStore((s) => s.markChoiceTouched);

  const config = useCatalogStore((s) => s.config);
  const severityColors = useCatalogStore((s) => s.severityColors);
  const modes = config?.modes ?? [];

  function onMode(value: string) {
    setMode(value);
    applyReRender();
    markChoiceTouched();
  }

  function onToggleSeverity(key: string, checked: boolean) {
    const next = checked
      ? [...enabledSeverities, key]
      : enabledSeverities.filter((s) => s !== key);
    setEnabledSeverities(next);
    applyReRender();
    markChoiceTouched();
  }

  return (
    <>
      <section className="field">
        <label className="field-label">
          Modalità di offuscamento
          <span
            className="apply-tag live"
            title="Si applica subito ai risultati, senza nuova analisi"
          >
            subito
          </span>
        </label>
        <Select
          value={mode}
          onChange={onMode}
          options={modes.map((m) => ({
            value: m.key,
            label: m.label,
            title: m.description,
          }))}
        />
      </section>

      <section className="field">
        <label className="field-label">
          Livelli di gravità da offuscare
          <span
            className="apply-tag live"
            title="Si applica subito ai risultati, senza nuova analisi"
          >
            subito
          </span>
        </label>
        <div className="severity-toggles">
          {SEVERITY_ORDER.map((s) => (
            <label key={s} className="sev-toggle">
              <input
                type="checkbox"
                className="sev-check"
                checked={enabledSeverities.includes(s)}
                onChange={(e) => onToggleSeverity(s, e.target.checked)}
              />
              <span
                className="sev-dot"
                style={{ background: severityColors[s] }}
                data-sev={s}
              />
              {cap(s)}
            </label>
          ))}
        </div>
      </section>
    </>
  );
}
