export interface LlmAlertInput {
  status?: string;
  scored?: number;
  total?: number;
  obscured_without_score?: number;
  error?: string | null;
}

export interface LlmAlertMessage {
  level: "error" | "warn";
  text: string;
}

/**
 * Ritorna l'avviso sullo stato del giudice LLM, o null. Specchio di
 * llmAlertMessage in app.js.
 */
export function llmAlertMessage(llm?: LlmAlertInput | null): LlmAlertMessage | null {
  if (!llm || !llm.status || llm.status === "off") return null;
  if (llm.status === "unavailable") {
    return {
      level: "error",
      text: "Verifica LLM richiesta ma giudice non disponibile: i risultati NON sono stati validati dal giudice (controlla ENABLE_ML e il modello LLM).",
    };
  }
  if (llm.error) {
    return {
      level: "error",
      text: `Giudice LLM non funzionante: il modello non si è caricato o ha fallito (${llm.error}). I risultati NON sono stati validati. Verifica il modello LLM e i log.`,
    };
  }
  if (llm.status === "active") {
    if ((llm.total ?? 0) > 0 && (llm.scored ?? 0) === 0) {
      return {
        level: "error",
        text: `Giudice LLM attivo ma non ha valutato alcuna frase (0 di ${llm.total}): il modello non ha restituito punteggi utilizzabili. Verifica il modello LLM.`,
      };
    }
    if ((llm.obscured_without_score ?? 0) > 0) {
      return {
        level: "warn",
        text: `${llm.obscured_without_score} frase/i oscurata/e senza punteggio del giudice: il modello non ha risposto per quelle frasi.`,
      };
    }
  }
  return null;
}
