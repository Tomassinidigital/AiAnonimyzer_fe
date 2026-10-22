import { useUiStore } from "@/store/uiStore";

interface Props {
  hidden: boolean;
  /** Apre la pagina "Area utente" (piani + lista d'attesa). */
  onOpenAccount: () => void;
}

export function Header({ hidden, onOpenAccount }: Props) {
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);

  return (
    <header className={`app-header${hidden ? " is-hidden" : ""}`}>
      <div className="brand">
        <span className="brand-mark">A</span>
        <div>
          <h1>Anonimizzatore Documenti di Gara</h1>
          <p className="subtitle">
            Rilevamento multi-livello di dati personali e sensibili
          </p>
        </div>
      </div>
      <div className="header-actions">
        <button
          className="btn-ghost account-btn"
          type="button"
          title="Piani e registrazione"
          onClick={onOpenAccount}
        >
          <span aria-hidden="true">👤</span> Area utente
        </button>
        <button
          className="icon-btn"
          title="Tema chiaro/scuro"
          aria-label="Tema"
          onClick={() => setTheme(theme === "light" ? "dark" : "light")}
        >
          ◐
        </button>
      </div>
    </header>
  );
}
