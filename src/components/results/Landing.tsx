import { useUiStore } from "@/store/uiStore";
import { useSessionStore } from "@/store/sessionStore";
import { ChoicesSummary } from "./ChoicesSummary";

export function Landing() {
  const choicesTouched = useUiStore((s) => s.choicesTouched);
  const hasResults = useSessionStore((s) => s.visibleTabs.length > 0);

  return (
    <div
      className={`landing${hasResults ? " hidden" : ""}${choicesTouched ? " has-config" : ""}`}
    >
      <div className="landing-inner">
        {choicesTouched && <ChoicesSummary />}

        <div className="landing-hero">
          <span className="landing-badge">✓ Elaborazione 100% locale · GDPR</span>
          <h2>Anonimizza i documenti di gara in pochi clic</h2>
          <p>
            Lo strumento individua <strong>dati personali e sensibili</strong> —
            nomi, codici fiscali, IBAN, PEC, indirizzi, importi… — in testi e PDF di
            appalti e li <strong>offusca</strong> secondo il profilo scelto. Nessun
            dato lascia il server.
          </p>
        </div>

        <h3 className="landing-h">Come si usa — 4 passi</h3>
        <ol className="landing-steps">
          <li>
            <b>Scegli la sorgente</b> nel pannello a sinistra: <em>Testo</em> oppure{" "}
            <em>PDF</em> (con opzione <em>fast</em> per documenti grandi).
          </li>
          <li>
            <b>Seleziona il profilo</b> di rilevamento — <em>GDPR</em>,{" "}
            <em>GDPR+</em>, <em>Gare</em> o <em>Debug</em> — e regola la{" "}
            <em>Confidenza minima</em>.
          </li>
          <li>
            <b>Imposta le opzioni</b>: <em>Verifica LLM</em>, <em>Modalità di
            offuscamento</em> e <em>Livelli di gravità</em> da nascondere.
          </li>
          <li>
            <b>Avvia</b> con <span className="kbd">Analizza</span>: i pannelli
            compaiono qui a destra man mano che vengono generati.
          </li>
        </ol>

        <h3 className="landing-h">I pannelli dei risultati</h3>
        <div className="landing-grid">
          <div className="landing-card">
            <span className="lc-ic">✎</span>
            <b>Evidenziato</b>
            <p>Il testo con le entità colorate per gravità.</p>
          </div>
          <div className="landing-card">
            <span className="lc-ic">▒</span>
            <b>Anonimizzato</b>
            <p>Il testo con i dati offuscati secondo la modalità scelta.</p>
          </div>
          <div className="landing-card">
            <span className="lc-ic">▤</span>
            <b>Report</b>
            <p>Conteggi per tipo e gravità, con l'elenco delle frasi rilevate.</p>
          </div>
          <div className="landing-card">
            <span className="lc-ic">{"{ }"}</span>
            <b>JSON</b>
            <p>Esportazione strutturata e completa dei rilevamenti.</p>
          </div>
          <div className="landing-card">
            <span className="lc-ic">⎘</span>
            <b>Anteprima PDF</b>
            <p>Per i PDF: il documento con le redazioni sovrapposte.</p>
          </div>
          <div className="landing-card">
            <span className="lc-ic">⚖&#xFE0E;</span>
            <b>Confronto / Metodi</b>
            <p>Confronta modalità di offuscamento o metodologie di rilevamento.</p>
          </div>
        </div>

        <p className="landing-foot">
          Suggerimento: nella vista <em>Evidenziato</em> puoi selezionare del testo
          per offuscarlo manualmente, oppure cliccare un'entità evidenziata per
          ripristinarla.
        </p>
      </div>
    </div>
  );
}
