/**
 * Risoluzione del base URL delle API.
 *
 * Unica sorgente: import.meta.env.VITE_API_BASE_URL (file .env).
 * Nessun URL è cablato nel codice: l'host del backend si configura solo
 * tramite la variabile d'ambiente, requisito del frontend indipendente.
 */
function resolveApiBaseUrl(): string {
  const base = import.meta.env.VITE_API_BASE_URL ?? "";
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
