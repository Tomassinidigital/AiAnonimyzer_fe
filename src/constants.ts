/** Costanti di dominio replicate dal frontend originale (public/js/app.js). */

/** Le 4 modalità individuali di offuscamento (usate anche in modalità "all"). */
export const INNER_MODES = [
  { key: "placeholder", label: "Segnaposto tipizzato" },
  { key: "last_chars", label: "Ultimi caratteri" },
  { key: "full_mask", label: "Maschera completa" },
  { key: "initial", label: "Solo iniziale" },
] as const;

export type PresetKey = "gdpr" | "gdpr_plus" | "gare" | "debug";

/** Set di layer per ogni profilo predefinito (Debug = scelta manuale). */
export const LAYER_PRESETS: Record<Exclude<PresetKey, "debug">, string[]> = {
  gdpr: ["rules", "ner", "ner_comuni"],
  gdpr_plus: ["rules", "ner", "ner_comuni", "embedding", "baseline"],
  gare: ["rules", "ner", "ner_comuni", "embedding", "baseline", "zero_shot"],
};

export const PRESET_HINTS: Record<PresetKey, string> = {
  gdpr: "GDPR: Regole L0 + checksum, NER GDPR, NER Comuni/Città.",
  gdpr_plus:
    "GDPR+: profilo GDPR con Similarità semantica e Presidio generalista.",
  gare:
    "Documenti gare: tutti i layer tranne l'LLM generativo — Regole L0 + " +
    "checksum, NER GDPR, NER Comuni/Città, Presidio generalista, " +
    "Similarità semantica, Zero-shot (GLiNER).",
  debug: "Debug: seleziona manualmente i singoli layer qui sotto.",
};

export const PRESETS: { key: PresetKey; label: string; title: string }[] = [
  { key: "gdpr", label: "GDPR", title: "Regole + NER GDPR + NER Comuni/Città" },
  {
    key: "gdpr_plus",
    label: "GDPR+",
    title: "GDPR + Similarità semantica + Presidio generalista",
  },
  {
    key: "gare",
    label: "Documenti gare",
    title:
      "Tutti i layer tranne l'LLM generativo: Regole, NER GDPR, NER Comuni/Città, Presidio generalista, Similarità semantica, Zero-shot (GLiNER)",
  },
  { key: "debug", label: "Debug", title: "Scelta manuale dei singoli layer" },
];

/** Tab dei risultati e ordine di visualizzazione. */
export const RESULT_TABS = [
  "pdf",
  "highlight",
  "anon",
  "report",
  "json",
  "confronto",
  "metodi",
  "debug",
] as const;

export type ResultTab = (typeof RESULT_TABS)[number];

export const TAB_LABELS: Record<ResultTab, string> = {
  pdf: "Anteprima PDF",
  highlight: "Evidenziato",
  anon: "Anonimizzato",
  report: "Report",
  json: "JSON",
  confronto: "Confronto",
  metodi: "Metodi",
  debug: "Debug",
};

export const SEVERITY_ORDER = ["critica", "alta", "media", "bassa"] as const;
