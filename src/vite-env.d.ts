/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  /** Override runtime del base URL delle API (impostato in index.html). */
  __API_BASE_URL__?: string;
}
