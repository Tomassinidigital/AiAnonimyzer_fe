import { useEffect, useState } from "react";
import {
  useApproversQuery,
  useDemoListQuery,
  useLayersQuery,
  useUiConfigQuery,
} from "./api/queries";
import { useCatalogStore } from "./store/catalogStore";
import { useUiStore } from "./store/uiStore";
import { Header } from "./components/shell/Header";
import { FocusRail } from "./components/shell/FocusRail";
import { SettingsPanel } from "./components/settings/SettingsPanel";
import { ResultsPanel } from "./components/results/ResultsPanel";
import { LoadingOverlay } from "./components/feedback/LoadingOverlay";
import { SysMonitor } from "./components/feedback/SysMonitor";
import { RunStats } from "./components/feedback/RunStats";
import { BootOverlay } from "./components/modals/BootOverlay";
import { IntroModal } from "./components/modals/IntroModal";
import { ServerDownModal } from "./components/modals/ServerDownModal";

export function App() {
  const theme = useUiStore((s) => s.theme);
  const settingsCollapsed = useUiStore((s) => s.settingsCollapsed);

  const configQ = useUiConfigQuery();
  const layersQ = useLayersQuery();
  const approversQ = useApproversQuery();
  const demoQ = useDemoListQuery();

  const setConfig = useCatalogStore((s) => s.setConfig);
  const setLayers = useCatalogStore((s) => s.setLayers);
  const setApprovers = useCatalogStore((s) => s.setApprovers);
  const initLayers = useUiStore((s) => s.initLayers);
  const setMinConfidence = useUiStore((s) => s.setMinConfidence);
  const setApprover = useUiStore((s) => s.setApprover);

  const [introOpen, setIntroOpen] = useState(false);
  const [introDismissed, setIntroDismissed] = useState(false);

  // Tema → attributo su <html> (le variabili CSS di app.css dipendono da esso).
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Popola i cataloghi e i valori di default appena arrivano dal backend.
  useEffect(() => {
    if (configQ.data) {
      setConfig(configQ.data);
      setMinConfidence(configQ.data.default_min_confidence);
    }
  }, [configQ.data, setConfig, setMinConfidence]);

  useEffect(() => {
    if (layersQ.data) {
      setLayers(layersQ.data.layers);
      initLayers(layersQ.data.layers);
    }
  }, [layersQ.data, setLayers, initLayers]);

  useEffect(() => {
    if (approversQ.data) {
      setApprovers(approversQ.data);
      if (approversQ.data.default) setApprover(approversQ.data.default);
    }
  }, [approversQ.data, setApprovers, setApprover]);

  // Boot: si chiude quando i caricatori essenziali hanno finito (anche con errore,
  // la UI resta usabile coi fallback / la modale server-giù).
  const bootDone =
    !configQ.isLoading && !layersQ.isLoading && !approversQ.isLoading && !demoQ.isLoading;

  useEffect(() => {
    if (bootDone && !introDismissed) setIntroOpen(true);
  }, [bootDone, introDismissed]);

  const version = configQ.data?.version ?? "";

  return (
    <>
      <div className="bg-glow" aria-hidden="true" />
      {!bootDone && <BootOverlay />}

      <Header hidden={settingsCollapsed} />

      <main className={`layout${settingsCollapsed ? " settings-collapsed" : ""}`}>
        <FocusRail hidden={!settingsCollapsed} />
        <SettingsPanel />
        <ResultsPanel />
      </main>

      <LoadingOverlay />
      <SysMonitor />
      <RunStats />

      <IntroModal
        open={introOpen}
        version={version}
        onClose={() => {
          setIntroOpen(false);
          setIntroDismissed(true);
        }}
      />
      <ServerDownModal />
    </>
  );
}
