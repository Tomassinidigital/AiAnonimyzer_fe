import { useState } from "react";
import { WAITLIST_ENABLED, submitWaitlist, type PlanKey } from "@/api/waitlist";
import { errorDetail } from "@/api/client";

/** Validazione minima dell'indirizzo (il controllo vero lo fa il raccoglitore). */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

interface Props {
  /** Piano preselezionato dalle card dei piani. */
  plan: PlanKey;
  onPlanChange: (plan: PlanKey) => void;
}

/**
 * Modulo di REGISTRAZIONE: non crea un account, iscrive alla lista d'attesa.
 * Stati: compilazione → invio → conferma (oppure errore recuperabile).
 */
export function WaitingListForm({ plan, onPlanChange }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [organization, setOrganization] = useState("");
  const [consent, setConsent] = useState(false);

  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    // Controlli minimi lato client, prima di occupare la rete.
    if (name.trim().length < 2) return setError("Inserisci il tuo nome.");
    if (!EMAIL_RE.test(email.trim())) return setError("Indirizzo e-mail non valido.");
    if (!consent) return setError("È necessario acconsentire al trattamento dei dati.");

    setSending(true);
    try {
      await submitWaitlist({
        name: name.trim(),
        email: email.trim(),
        organization: organization.trim(),
        plan,
      });
      setDone(true);
    } catch (err) {
      setError(errorDetail(err, "Iscrizione non riuscita, riprova."));
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return (
      <div className="wl-done" role="status">
        <span className="wl-done-mark" aria-hidden="true">✓</span>
        <h3>Sei in lista d'attesa</h3>
        <p className="hint">
          Abbiamo registrato la richiesta per il piano{" "}
          <b>{plan === "pro" ? "Pro" : "Free"}</b>. Ti scriveremo a{" "}
          <b>{email.trim()}</b> quando le registrazioni apriranno.
        </p>
      </div>
    );
  }

  return (
    <form className="wl-form" onSubmit={onSubmit} noValidate>
      <h3 className="wl-form-title">Registrati alla lista d'attesa</h3>
      <p className="hint">
        Le registrazioni non sono ancora aperte: lascia i tuoi dati e ti
        avviseremo appena il tuo piano sarà disponibile.
      </p>

      <div className="field">
        <label className="field-label" htmlFor="wl-name">Nome e cognome</label>
        <input
          id="wl-name"
          className="wl-input"
          type="text"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="field">
        <label className="field-label" htmlFor="wl-email">E-mail</label>
        <input
          id="wl-email"
          className="wl-input"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div className="field">
        <label className="field-label" htmlFor="wl-org">
          Organizzazione <span className="wl-optional">(facoltativo)</span>
        </label>
        <input
          id="wl-org"
          className="wl-input"
          type="text"
          autoComplete="organization"
          value={organization}
          onChange={(e) => setOrganization(e.target.value)}
        />
      </div>

      <div className="field">
        <label className="field-label" htmlFor="wl-plan">Piano di interesse</label>
        <select
          id="wl-plan"
          value={plan}
          onChange={(e) => onPlanChange(e.target.value as PlanKey)}
        >
          <option value="free">Free — GDPR, fino a 4 pagine</option>
          <option value="pro">Pro — tutte le funzionalità</option>
        </select>
      </div>

      <label className="checkbox-inline wl-consent">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        <span>
          Acconsento al trattamento dei dati per essere ricontattato sulla
          disponibilità del servizio.
        </span>
      </label>

      {!WAITLIST_ENABLED && (
        <p className="wl-alert">
          Raccolta iscrizioni non configurata: impostare{" "}
          <code>VITE_WAITLIST_URL</code> o <code>VITE_WAITLIST_EMAIL</code>.
        </p>
      )}
      {error && <p className="wl-alert" role="alert">{error}</p>}

      <button
        className="btn-primary"
        type="submit"
        disabled={sending || !WAITLIST_ENABLED}
      >
        {sending ? "Invio in corso…" : "Entra in lista d'attesa"}
      </button>
    </form>
  );
}
