/**
 * Correzioni manuali correnti (offuscamenti aggiunti, frasi ripristinate,
 * gravità abilitate) nel formato atteso dagli endpoint PDF.
 *
 * Le gravità si inviano solo se ne è stato disabilitato almeno uno: assenti
 * valgono "nessun filtro", ed evitarle lascia al server i box memoizzati.
 */
export type Range = [number, number];

export function correctionParams(
  manual: Range[],
  excluded: Range[],
  severities: string[],
  allSeverities: string[],
): Record<string, string> {
  const params: Record<string, string> = {};
  if (manual.length)
    params.manual_ranges = manual.map((r) => `${r[0]}-${r[1]}`).join(",");
  if (excluded.length)
    params.excluded_ranges = excluded.map((r) => `${r[0]}-${r[1]}`).join(",");
  if (
    severities.length &&
    allSeverities.length &&
    severities.length < allSeverities.length
  )
    params.severities = severities.join(",");
  return params;
}

/** Le stesse correzioni come query string (per gli URL di download). */
export function correctionQuery(
  manual: Range[],
  excluded: Range[],
  severities: string[],
  allSeverities: string[],
): string {
  return new URLSearchParams(
    correctionParams(manual, excluded, severities, allSeverities),
  ).toString();
}
