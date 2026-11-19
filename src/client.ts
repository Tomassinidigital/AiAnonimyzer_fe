import axios from "axios";
import { getApiBase } from "./config.js";

/** Client HTTP (Axios): il base URL è letto a ogni richiesta (vedi config.ts). */
export const http = axios.create();

http.interceptors.request.use((config) => {
  config.baseURL = getApiBase();
  return config;
});

/** Messaggio d'errore leggibile: campo `detail` del backend, altrimenti il testo HTTP. */
export function errorDetail(error: unknown, fallback = "Errore"): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { detail?: string } | undefined;
    if (data?.detail) return data.detail;
    if (!error.response) return "Server non raggiungibile";
    return error.message || fallback;
  }
  return error instanceof Error ? error.message : fallback;
}
