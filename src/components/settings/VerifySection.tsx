import { Checkbox, Select, Slider } from "antd";
import { useCatalogStore } from "@/store/catalogStore";
import { useUiStore } from "@/store/uiStore";

export function VerifySection() {
  const minConfidence = useUiStore((s) => s.minConfidence);
  const verify = useUiStore((s) => s.verify);
  const approver = useUiStore((s) => s.approver);
  const simulate = useUiStore((s) => s.simulate);

  const setMinConfidence = useUiStore((s) => s.setMinConfidence);
  const setVerify = useUiStore((s) => s.setVerify);
  const setApprover = useUiStore((s) => s.setApprover);
  const setSimulate = useUiStore((s) => s.setSimulate);
  const markChoiceTouched = useUiStore((s) => s.markChoiceTouched);

  const approvers = useCatalogStore((s) => s.approvers);
  const list = approvers?.approvers ?? [];
  const current = list.find((a) => a.key === approver);
  const showPicker = verify && list.length > 0;

  return (
    <>
      <section className="field">
        <label className="field-label">
          Confidenza minima <strong>{minConfidence.toFixed(2)}</strong>
          <span className="apply-tag" title="Si applica alla prossima analisi">
            nuova analisi
          </span>
        </label>
        <Slider
          min={0}
          max={1}
          step={0.01}
          value={minConfidence}
          tooltip={{ open: false }}
          onChange={(v) => {
            setMinConfidence(v);
            markChoiceTouched();
          }}
        />
        <small className="hint">Più alta = più precisione, meno copertura.</small>
      </section>

      <section className="field">
        <label className="field-label">
          Verifica LLM — rivaluta gli score
          <span className="apply-tag" title="Si applica alla prossima analisi">
            nuova analisi
          </span>
        </label>
        <div className="seg-control verify-switch">
          <button
            className={`seg${verify ? " active" : ""}`}
            data-verify="on"
            title="Un LLM giudice rivaluta ogni entità (più lento)"
            onClick={() => {
              setVerify(true);
              markChoiceTouched();
            }}
          >
            Attiva
          </button>
          <button
            className={`seg${!verify ? " active" : ""}`}
            data-verify="off"
            title="Nessuna verifica: usa solo gli score dei layer"
            onClick={() => {
              setVerify(false);
              markChoiceTouched();
            }}
          >
            Disattiva
          </button>
        </div>
        <small className="hint">
          Stadio "giudice": un LLM rivaluta ogni entità già catturata e ne corregge
          lo score (media pesata). Più lento; richiede un backend LLM configurato.
        </small>

        {showPicker && (
          <div className="approver-field">
            <label className="field-label" htmlFor="approver-select">
              Modello giudice
            </label>
            <Select
              id="approver-select"
              value={approver ?? undefined}
              onChange={(v) => {
                setApprover(v);
                markChoiceTouched();
              }}
              options={list.map((a) => ({ value: a.key, label: a.label }))}
            />
            <small className="hint">
              {current
                ? `${current.model}${current.vram_hint ? " — " + current.vram_hint : ""}`
                : ""}
            </small>
            <Checkbox
              checked={simulate}
              onChange={(e) => {
                setSimulate(e.target.checked);
                markChoiceTouched();
              }}
              style={{ marginTop: 6 }}
            >
              debug (simula llm)
            </Checkbox>
            <small className="hint">
              Mostra i prompt che verrebbero inviati al giudice senza valutarli con
              l'LLM (nessun caricamento del modello).
            </small>
          </div>
        )}
      </section>
    </>
  );
}
