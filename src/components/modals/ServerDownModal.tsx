import { checkHealth } from "@/api/client";
import { useServerStore } from "@/store/serverStore";

export function ServerDownModal() {
  const down = useServerStore((s) => s.down);
  const setDown = useServerStore((s) => s.setDown);
  if (!down) return null;

  return (
    <div
      className="modal-overlay"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="server-down-title"
    >
      <div className="modal-box">
        <div className="modal-icon">⚠</div>
        <h2 id="server-down-title" className="modal-title">
          Server non raggiungibile
        </h2>
        <p className="modal-text">
          Il sistema non risponde: il server potrebbe non essere avviato o essersi
          interrotto. Avvia o riavvia il server, poi premi <strong>Riprova</strong>.
        </p>
        <div className="modal-actions">
          <button
            className="btn-primary"
            type="button"
            onClick={async () => {
              const ok = await checkHealth();
              if (ok) setDown(false);
            }}
          >
            Riprova
          </button>
        </div>
      </div>
    </div>
  );
}
