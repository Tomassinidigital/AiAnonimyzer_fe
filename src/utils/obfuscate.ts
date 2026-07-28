/**
 * Replica locale delle regole di offuscamento (specchio di core/anonymizer.py e
 * di obfuscateLocal nel frontend originale). Usata SOLO per la tab "Confronto",
 * che mostra come apparirebbe ogni entità nelle 4 modalità senza nuove chiamate.
 */
export function obfuscateLocal(
  text: string,
  label: string,
  mode: string,
): string {
  const stripped = text.trim();
  switch (mode) {
    case "placeholder":
      return `[${label}]`;
    case "full_mask":
      return text.replace(/\S/g, "•");
    case "last_chars": {
      if (stripped.length <= 4) return stripped.replace(/\S/g, "•");
      return "•".repeat(stripped.length - 4) + stripped.slice(-4);
    }
    case "initial": {
      if (stripped.length <= 1) return stripped.replace(/\S/g, "•");
      return stripped[0] + "•".repeat(stripped.length - 1);
    }
    default:
      return text;
  }
}
