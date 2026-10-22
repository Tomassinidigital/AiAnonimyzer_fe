/**
 * Pecetta "PRO": marca i controlli dell'interfaccia attivabili solo con il
 * piano Pro (elencati nella pagina Area utente, #account).
 */
export function ProTag({
  title = "Disponibile solo con il piano Pro",
}: {
  title?: string;
}) {
  return (
    <span className="pro-tag" title={title}>
      Pro
    </span>
  );
}
