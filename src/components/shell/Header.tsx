import { useUiStore } from "@/store/uiStore";

export function Header({ hidden }: { hidden: boolean }) {
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
      <button
        className="icon-btn"
        title="Tema chiaro/scuro"
        aria-label="Tema"
        onClick={() => setTheme(theme === "light" ? "dark" : "light")}
      >
        ◐
      </button>
    </header>
  );
}
