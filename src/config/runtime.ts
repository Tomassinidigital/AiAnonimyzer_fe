/**
 * Risoluzione del base URL delle API.
 *
 * Priorità (la prima definita vince):
 *   1. window.__API_BASE_URL__  — override a runtime (index.html), nessun rebuild;
 *   2. import.meta.env.VITE_API_BASE_URL — valore di build (file .env);
 *   3. fallback http://localhost:8000 — comodo per i test locali.
 *
 * Il path è così completamente configurabile, requisito del frontend
 * indipendente: in dev punta a localhost, in produzione all'host del backend.
 */
function resolveApiBaseUrl(): string {
  const runtime =
    typeof window !== "undefined" ? window.__API_BASE_URL__ : undefined;
  const fromEnv = import.meta.env.VITE_API_BASE_URL;
  const base = runtime || fromEnv || "http://localhost:8000";
  // Normalizza: via spazi accidentali (es. variabile di deploy con uno spazio
  // iniziale: rende l'URL non-assoluto e axios gli antepone il baseURL,
  // generando URL doppi e 404) e niente slash finale (gli endpoint iniziano
  // con "/").
  return base.trim().replace(/\/+$/, "");
}

export const API_BASE_URL = resolveApiBaseUrl();

/** URL assoluto verso un endpoint API (per <img>, download, pdf.js). */
export function apiUrl(path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${clean}`;
}
