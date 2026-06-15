import axios, { AxiosError } from "axios";
import { API_BASE_URL } from "@/config/runtime";
import { useServerStore } from "@/store/serverStore";

/**
 * Client HTTP centralizzato (Axios) verso il backend.
 *
 * Interceptor:
 *  - su risposta riuscita → segnala backend raggiungibile;
 *  - su errore di RETE (nessuna risposta = server giù/non avviato) → segnala
 *    backend non raggiungibile (la App mostra la modale dedicata);
 *  - gli errori HTTP (4xx/5xx) NON sono "server giù": vengono propagati ai
 *    chiamanti, che li mostrano nella status-line come prima.
 */
export const http = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
});

http.interceptors.response.use(
  (response) => {
    useServerStore.getState().setDown(false);
    return response;
  },
  (error: AxiosError) => {
    // Nessuna `response` = errore di rete/connessione (non un 4xx/5xx).
    if (!error.response) {
      useServerStore.getState().setDown(true);
    } else {
      useServerStore.getState().setDown(false);
    }
    return Promise.reject(error);
  },
);

/** Estrae il messaggio d'errore leggibile (campo `detail` del backend). */
export function errorDetail(error: unknown, fallback = "Errore"): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { detail?: string } | undefined;
    if (data?.detail) return data.detail;
    if (!error.response) return "Server non raggiungibile";
    return error.message || fallback;
  }
  if (error instanceof Error) return error.message;
  return fallback;
}

/** Controllo di salute del backend (per la modale "server giù" e il retry). */
export async function checkHealth(): Promise<boolean> {
  try {
    const res = await http.get("/healthz");
    return res.status === 200;
  } catch {
    return false;
  }
}
