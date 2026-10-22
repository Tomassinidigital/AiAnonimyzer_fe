import { RESULT_TABS, TAB_LABELS, type ResultTab } from "@/constants";
import { useSessionStore } from "@/store/sessionStore";
import { Landing } from "./Landing";
import { HighlightView } from "./HighlightView";
import { AnonView } from "./AnonView";
import { ReportView } from "./ReportView";
import { JsonView } from "./JsonView";
import { PdfView } from "./PdfView";
import { ConfrontoView } from "./ConfrontoView";
import { MetodiView } from "./MetodiView";
import { DebugView } from "./DebugView";
import { LlmAlert } from "@/components/feedback/LlmAlert";
import { StaleBanner } from "@/components/feedback/StaleBanner";
import { ActivityBar } from "@/components/feedback/ActivityBar";

const PANE_CONTENT: Record<ResultTab, React.ReactNode> = {
  highlight: <HighlightView />,
  anon: <AnonView />,
  report: <ReportView />,
  json: <JsonView />,
  pdf: <PdfView />,
  confronto: <ConfrontoView />,
  metodi: <MetodiView />,
  debug: <DebugView />,
};

export function ResultsPanel() {
  const visibleTabs = useSessionStore((s) => s.visibleTabs);
  const activeTab = useSessionStore((s) => s.activeTab);
  const activate = useSessionStore((s) => s.activateTab);
  const status = useSessionStore((s) => s.status);

  return (
    <section className="panel results" aria-label="Risultato">
      <div className="tabs">
        {RESULT_TABS.filter((t) => visibleTabs.includes(t)).map((t) => (
          <button
            key={t}
            className={`tab${activeTab === t ? " active" : ""}`}
            onClick={() => activate(t)}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      <div
        className={`status-line${status.kind === "ok" ? " status-ok" : status.kind === "error" ? " status-error" : ""}`}
        role="status"
      >
        {status.msg}
      </div>

      <LlmAlert />
      <StaleBanner />
      <ActivityBar />

      <div className="tab-panes">
        <Landing />
        {RESULT_TABS.map((t) => (
          <div
            key={t}
            id={`pane-${t}`}
            className={`pane${activeTab === t ? " active" : ""}`}
          >
            {PANE_CONTENT[t]}
          </div>
        ))}
      </div>
    </section>
  );
}
