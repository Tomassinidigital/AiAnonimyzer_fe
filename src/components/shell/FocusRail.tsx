import { useUiStore } from "@/store/uiStore";

interface Props {
  hidden: boolean;
  /** Apre la pagina "Area utente" (l'header è nascosto in modalità focus). */
  onOpenAccount: () => void;
}

export function FocusRail({ hidden, onOpenAccount }: Props) {
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
      <button
        className="icon-btn"
        title="Area utente"
        aria-label="Area utente"
        onClick={onOpenAccount}
      >
        👤
      </button>
    </aside>
  );
}
