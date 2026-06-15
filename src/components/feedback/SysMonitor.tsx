import { useSystemStatsQuery } from "@/api/queries";
import { useFeedbackStore } from "@/store/feedbackStore";
import { useCatalogStore } from "@/store/catalogStore";
import { useUiStore } from "@/store/uiStore";
import type { SystemStats } from "@/api/types";
import { shortModel } from "@/utils/format";

function activeLayerModels(selected: string[], layers: ReturnType<typeof useCatalogStore.getState>["layers"]): string[] {
  const sel = new Set(selected);
  const names: string[] = [];
  layers.forEach((l) => {
    if (sel.has(l.key)) (l.models || []).forEach((m) => names.push(shortModel(m)));
  });
  return [...new Set(names)];
}

function monitorModels(d: SystemStats, phase: string, selected: string[], layers: ReturnType<typeof useCatalogStore.getState>["layers"]): string {
  if (!d.enable_ml) return "ML disattivo";
  if (/giudic|verif/i.test(phase)) return shortModel(d.llm_model) || "—";
  const m = activeLayerModels(selected, layers);
  return m.length ? m.join(", ") : "solo regole (nessun modello ML)";
}

export function SysMonitor() {
  const sysMon = useFeedbackStore((s) => s.sysMon);
  const gpuMonitor = useCatalogStore((s) => s.config?.gpu_monitor ?? false);
  const layers = useCatalogStore((s) => s.layers);
  const selectedLayers = useUiStore((s) => s.selectedLayers);

  const active = gpuMonitor && sysMon.active;
  const { data } = useSystemStatsQuery(active);

  if (!active) return null;

  const llm = data ? monitorModels(data, sysMon.label, selectedLayers, layers) : "—";
  const device = data ? data.device + (data.cuda_available ? " · CUDA" : "") : "—";
  let gpu = "—";
  let vram = "—";
  let util = "—";
  if (data) {
    if (data.gpu) {
      gpu = `${data.gpu.name} (${data.gpu.compute_capability})`;
      vram = `${data.gpu.vram_allocated_gb} / ${data.gpu.vram_total_gb} GB`;
      util = data.gpu.utilization_pct == null ? "n/d" : `${data.gpu.utilization_pct}%`;
    } else {
      gpu = "CPU (nessuna GPU CUDA)";
    }
  }

  return (
    <aside className="sys-monitor" aria-live="polite">
      <div className="sysmon-title">Monitor sistema</div>
      <div className="sysmon-row">
        <span>Stato</span>
        <b>{sysMon.label}</b>
      </div>
      <div className="sysmon-row">
        <span>Modelli</span>
        <b>{llm}</b>
      </div>
      <div className="sysmon-row">
        <span>Device</span>
        <b>{device}</b>
      </div>
      <div className="sysmon-row">
        <span>GPU</span>
        <b>{gpu}</b>
      </div>
      <div className="sysmon-row">
        <span>VRAM</span>
        <b>{vram}</b>
      </div>
      <div className="sysmon-row">
        <span>GPU util</span>
        <b>{util}</b>
      </div>
    </aside>
  );
}
