import { useUiStore } from "@/store/uiStore";

export function FocusRail({ hidden }: { hidden: boolean }) {
  const setSettingsCollapsed = useUiStore((s) => s.setSettingsCollapsed);
  return (
    <aside className={`focus-rail${hidden ? " hidden" : ""}`} aria-label="Barra laterale">
      <span className="brand-mark focus-logo" aria-hidden="true">
        A
      </span>
      <button
        className="icon-btn focus-settings-btn"
        title="Mostra le impostazioni"
        aria-label="Mostra le impostazioni"
        onClick={() => setSettingsCollapsed(false)}
      >
        ⚙
      </button>
    </aside>
  );
}
