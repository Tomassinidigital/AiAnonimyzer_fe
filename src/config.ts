/**
 * Base URL del backend. Stessa convenzione del frontend beta:
 * `window.BETA_API_BASE` (o `globalThis.BETA_API_BASE`), altrimenti stessa origine.
 * `setApiBase` permette di cambiarlo a runtime (es. test, Node).
 */
let apiBase: string | null = null;

function normalize(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export function setApiBase(url: string): void {
  apiBase = normalize(url);
}

export function getApiBase(): string {
  if (apiBase !== null) return apiBase;
  const fromGlobal = (globalThis as { BETA_API_BASE?: string }).BETA_API_BASE;
  return normalize(fromGlobal ?? "");
}
