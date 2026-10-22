import axios from "axios";

/**
 * Iscrizione alla LISTA D'ATTESA (area utente).
 *
 * La registrazione non passa dal backend di analisi: il raccoglitore è
 * configurabile via variabili d'ambiente, come il base URL delle API.
 *
 *  1. `VITE_WAITLIST_URL`   — endpoint HTTP che riceve l'iscrizione (POST JSON);
 *  2. `VITE_WAITLIST_EMAIL` — fallback: apre il client di posta (mailto:);
 *  3. nessuna delle due     — modulo disabilitato con avviso esplicito.
 */

export type PlanKey = "free" | "pro";

/** Dati raccolti dal modulo di iscrizione. */
export interface WaitlistEntry {
  name: string;
  email: string;
  organization: string;
  plan: PlanKey;
}

const ENDPOINT = (import.meta.env.VITE_WAITLIST_URL ?? "").trim();
const EMAIL = (import.meta.env.VITE_WAITLIST_EMAIL ?? "").trim();

/** true se esiste una destinazione per l'iscrizione (endpoint o e-mail). */
export const WAITLIST_ENABLED = Boolean(ENDPOINT || EMAIL);

/** Corpo del messaggio usato dal fallback mailto:. */
function mailtoUrl(entry: WaitlistEntry): string {
  const subject = `Lista d'attesa Anonimizzatore — piano ${entry.plan.toUpperCase()}`;
  const body = [
    `Nome: ${entry.name}`,
    `E-mail: ${entry.email}`,
    `Organizzazione: ${entry.organization || "-"}`,
    `Piano di interesse: ${entry.plan}`,
  ].join("\n");
  return `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * Invia l'iscrizione. Con `VITE_WAITLIST_URL` usa un client Axios dedicato
 * (non quello del backend: un errore qui non deve far comparire la modale
 * "server non raggiungibile"). Rilancia l'errore al chiamante.
 */
export async function submitWaitlist(entry: WaitlistEntry): Promise<void> {
  const payload = { ...entry, created_at: new Date().toISOString() };

  if (ENDPOINT) {
    await axios.post(ENDPOINT, payload, {
      headers: { "Content-Type": "application/json" },
      timeout: 15000,
    });
    return;
  }

  if (EMAIL) {
    window.location.href = mailtoUrl(entry);
    return;
  }

  throw new Error(
    "Iscrizione non configurata: imposta VITE_WAITLIST_URL o VITE_WAITLIST_EMAIL.",
  );
}
