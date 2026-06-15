export function BootOverlay() {
  return (
    <div className="loading-overlay boot-overlay" role="status" aria-live="polite">
      <div className="spinner" />
      <span>Inizializzazione…</span>
      <small className="loading-sub">Carico menu ed esempi…</small>
    </div>
  );
}
