/* Accettazione dei Termini sul backend:
     • POST /api/terms/accept → token firmato, a scadenza e monouso.
   Ogni invio di file o rielaborazione dei dati deve presentare un token (campo
   `terms_token`): senza, il server risponde 403. Il token si ottiene solo con
   l'accettazione generale e l'approvazione specifica delle clausole. */

import { TERMS } from "../core/config.js";

export function createTermsApi(http) {
  async function accept() {
    const form = new FormData();
    form.append("terms_version", TERMS.version);
    form.append("terms_general", "true");
    form.append("terms_specific", "true");
    return (await http.post("/api/terms/accept", form)).token;
  }

  return { accept };
}
