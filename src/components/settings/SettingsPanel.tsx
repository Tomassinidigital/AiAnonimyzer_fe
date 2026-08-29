import { SourceSection } from "./SourceSection";
import { ProfileSection } from "./ProfileSection";
import { VerifySection } from "./VerifySection";
import { OutputSection } from "./OutputSection";
import { useUiStore } from "@/store/uiStore";
import { debugTrace, runAnalyze } from "@/features/runner";

export function SettingsPanel() {
  const setSettingsCollapsed = useUiStore((s) => s.setSettingsCollapsed);

  return (
    <aside className="panel settings" aria-label="Impostazioni">
      <div className="panel-head">
        <h2 className="panel-title">Impostazioni</h2>
        <button
          className="icon-btn collapse-btn"
          title="Comprimi il pannello"
          aria-label="Comprimi le impostazioni"
          onClick={() => setSettingsCollapsed(true)}
        >
          ‹
        </button>
      </div>

      <SourceSection />
      <ProfileSection />
      <VerifySection />
      <OutputSection />

      <button className="btn-primary" onClick={runAnalyze}>
        Analizza
      </button>
      <button className="btn-secondary" onClick={debugTrace}>
        Traccia di Debug
      </button>
      <p className="hint">
        Suggerimento: seleziona del testo nella vista "Evidenziato" per offuscarlo
        manualmente ("Oscura"), oppure clicca un'entità già evidenziata per
        ripristinarla ("Ripristina").
      </p>
    </aside>
  );
}
