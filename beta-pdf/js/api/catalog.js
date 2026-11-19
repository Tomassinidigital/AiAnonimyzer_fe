/* Configurazione e cataloghi del backend:
     • GET /api/system/ui-config   → modalità, gravità, ranking, versione
     • GET /api/approvers          → giudici LLM per la verifica
     • GET /api/detection/modules  → moduli di rilevamento (GDPR base + aggiuntivi)
   Tutte tolleranti: se il backend non risponde ritornano un valore vuoto. */

export function createCatalogApi(http) {
  // ui-config del backend, o null se non raggiungibile (decide online/offline).
  async function ping() {
    try {
      const res = await fetch(http.url("/api/system/ui-config"));
      return res.ok ? await res.json() : null;
    } catch (_e) {
      return null;
    }
  }

  async function getApprovers() {
    try { return await http.get("/api/approvers"); }
    catch (_e) { return { default: "", approvers: [] }; }
  }

  // [{ key, label, description, base, available, unavailable_layers }]
  async function getModules() {
    try { return (await http.get("/api/detection/modules")).modules || []; }
    catch (_e) { return []; }
  }

  return { ping, getApprovers, getModules };
}
