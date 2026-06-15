import type { ReactNode } from "react";
import { PRESET_HINTS, PRESETS } from "@/constants";
import { cap } from "@/utils/format";
import { useCatalogStore } from "@/store/catalogStore";
import { useUiStore } from "@/store/uiStore";
import { debugTrace, runAnalyze } from "@/features/runner";

function ChoiceCard({
  k,
  value,
  desc,
}: {
  k: string;
  value: ReactNode;
  desc?: ReactNode;
}) {
  return (
    <div className="choice-card">
      <div className="choice-k">{k}</div>
      <div className="choice-v">{value}</div>
      {desc && <div className="choice-d">{desc}</div>}
    </div>
  );
}

export function ChoicesSummary() {
  const ui = useUiStore();
  const layers = useCatalogStore((s) => s.layers);
  const approvers = useCatalogStore((s) => s.approvers);
  const config = useCatalogStore((s) => s.config);

  const presetLabel = PRESETS.find((p) => p.key === ui.preset)?.label ?? "—";
  const active = ui.selectedLayers;
  const modeDef = config?.modes.find((m) => m.key === ui.mode);
  const judge = approvers?.approvers.find((a) => a.key === ui.approver);

  let verifyValue = "Disattiva";
  if (ui.verify) verifyValue = ui.simulate ? "Simulata" : "Attiva";
  let verifyDesc: ReactNode;
  if (ui.simulate) {
    verifyDesc =
      "debug (simula llm): costruisce e mostra i prompt del giudice SENZA chiamare l'LLM (nessun caricamento del modello).";
  } else if (ui.verify) {
    verifyDesc = (
      <>
        Stadio "giudice": un LLM rivaluta ogni entità catturata e ne corregge lo
        score (media pesata). Più lento, richiede un backend LLM.
        {judge && (
          <>
            {" "}
            Modello giudice: <strong>{judge.label}</strong>.
          </>
        )}
      </>
    );
  } else {
    verifyDesc = "Nessuna verifica: si usano solo gli score dei layer (più veloce).";
  }

  return (
    <section className="choices-summary" aria-live="polite">
      <div className="cs-head">
        <h3 className="cs-title">Le tue scelte</h3>
        <p className="cs-sub">
          Riepilogo delle opzioni selezionate e di cosa fanno. Quando sei pronto,
          avvia l'analisi direttamente da qui.
        </p>
      </div>
      <div className="choices-list">
        <ChoiceCard
          k="Sorgente"
          value={ui.source === "pdf" ? "PDF" : "Testo"}
          desc={
            ui.source === "pdf"
              ? "Analizza un file PDF caricato, con le redazioni sovrapposte all'originale."
              : "Analizza il testo incollato nell'area a sinistra."
          }
        />
        <ChoiceCard
          k="Profilo di rilevamento"
          value={presetLabel}
          desc={PRESET_HINTS[ui.preset]}
        />
        <ChoiceCard
          k="Layer di rilevamento attivi"
          value={
            <>
              <span className="choice-count">{active.length}</span> attivi
            </>
          }
          desc={
            active.length ? (
              <ul className="choice-sublist">
                {active.map((k) => {
                  const l = layers.find((x) => x.key === k);
                  return (
                    <li key={k}>
                      <strong>{l ? l.label : k}</strong>
                      {l?.description ? ` — ${l.description}` : ""}
                    </li>
                  );
                })}
              </ul>
            ) : (
              "Nessun layer attivo: selezionane almeno uno dal profilo o in Debug."
            )
          }
        />
        <ChoiceCard
          k="Confidenza minima"
          value={ui.minConfidence.toFixed(2)}
          desc="Soglia minima di punteggio per tenere un rilevamento: più alta = più precisione, meno copertura."
        />
        <ChoiceCard k="Verifica LLM" value={verifyValue} desc={verifyDesc} />
        <ChoiceCard
          k="Modalità di offuscamento"
          value={modeDef?.label ?? "—"}
          desc={modeDef?.description ?? ""}
        />
        <ChoiceCard
          k="Livelli di gravità da offuscare"
          value={ui.enabledSeverities.length ? ui.enabledSeverities.map(cap).join(", ") : "Nessuno"}
          desc="Solo le entità di questi livelli di gravità verranno effettivamente offuscate nell'output."
        />
      </div>
      <div className="cs-actions">
        <button className="btn-primary" onClick={runAnalyze}>
          Analizza
        </button>
        <button className="btn-secondary" onClick={debugTrace}>
          Traccia di Debug
        </button>
      </div>
    </section>
  );
}
