/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  /** Endpoint che riceve le iscrizioni alla lista d'attesa (POST JSON). */
  readonly VITE_WAITLIST_URL?: string;
  /** Fallback: indirizzo e-mail per l'iscrizione via mailto:. */
  readonly VITE_WAITLIST_EMAIL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
