import { useState } from "react";
import type { PlanKey } from "@/api/waitlist";
import { WaitingListForm } from "./WaitingListForm";

/** Sintesi dei due piani mostrata nelle card. */
const PLANS: {
  key: PlanKey;
  name: string;
  price: string;
  claim: string;
  points: string[];
}[] = [
  {
    key: "free",
    name: "Free",
    price: "0 €",
    claim: "Anonimizzazione GDPR per documenti brevi.",
    points: [
      "Solo profilo GDPR: Regole L0 + checksum, NER GDPR, NER Comuni/Città",
      "PDF fino a 4 pagine per documento",
      "Testo incollato, 4 modalità di offuscamento, anteprima e download PDF",
      "Senza LLM generativo",
      "Senza Giudice LLM di controllo",
      "Senza profilo Documenti di gara (bandi)",
    ],
  },
  {
    key: "pro",
    name: "Pro",
    price: "su richiesta",
    claim: "Tutte le funzionalità, senza limiti di pagine.",
    points: [
      "Tutti i profili: GDPR, GDPR+, Documenti di gara, Analisi",
      "PDF senza limite di pagine",
      "Layer LLM generativo locale",
      "Giudice LLM di controllo con ricalcolo dei punteggi",
      "Presidio generalista, Similarità semantica, Zero-shot (GLiNER)",
      "Tutto ciò che è incluso nel piano Free",
    ],
  },
];

/** Confronto puntuale: true/false = incluso/escluso, stringa = valore. */
const FEATURES: { label: string; free: boolean | string; pro: boolean | string }[] = [
  { label: "Profili di rilevamento", free: "Solo GDPR", pro: "Tutti (GDPR, GDPR+, gare, Analisi)" },
  { label: "Pagine per documento PDF", free: "Fino a 4", pro: "Nessun limite" },
  { label: "Layer Regole (L0 + checksum)", free: true, pro: true },
  { label: "Layer NER GDPR e NER Comuni/Città", free: true, pro: true },
  { label: "Presidio generalista e Similarità semantica", free: false, pro: true },
  { label: "Zero-shot (GLiNER)", free: false, pro: true },
  { label: "Layer LLM generativo", free: false, pro: true },
  { label: "Giudice LLM di controllo", free: false, pro: true },
  { label: "Documenti di gara (bandi, CIG, CUP, importi)", free: false, pro: true },
  { label: "Analisi di testo incollato", free: true, pro: true },
  { label: "4 modalità di offuscamento e confronto", free: true, pro: true },
  { label: "Anteprima e download del PDF anonimizzato", free: true, pro: true },
  { label: "Elaborazione locale, conforme al GDPR", free: true, pro: true },
];

/** Cella della tabella: ✓ / — per i booleani, testo per i valori. */
function Cell({ value }: { value: boolean | string }) {
  if (typeof value === "string") return <span className="ap-value">{value}</span>;
  return value ? (
    <span className="ap-yes" aria-label="incluso">✓</span>
  ) : (
    <span className="ap-no" aria-label="non incluso">—</span>
  );
}

/**
 * PAGINA "Area utente" (rotta `#account`): caratteristiche dei piani Free/Pro
 * e registrazione alla lista d'attesa. Non dipende dal backend di analisi.
 */
export function AccountPage({ onBack }: { onBack: () => void }) {
  const [plan, setPlan] = useState<PlanKey>("free");

  return (
    <div className="account-page">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">A</span>
          <div>
            <h1>Area utente</h1>
            <p className="subtitle">Piani, funzionalità e lista d'attesa</p>
          </div>
        </div>
        <button className="btn-ghost" type="button" onClick={onBack}>
          ← Torna all'anonimizzatore
        </button>
      </header>

      <div className="ap-body">
        <section className="ap-hero">
          <h2>Due piani, un solo anonimizzatore</h2>
          <p className="hint">
            Il piano <b>Free</b> copre l'anonimizzazione GDPR di documenti brevi.
            Il piano <b>Pro</b> aggiunge LLM, Giudice di controllo e documenti di
            gara, senza limiti di pagine. Le registrazioni apriranno a breve.
          </p>
          <p className="ap-trial">
            <b>In prova gratuita:</b> GDPR+, Documenti di gara, Analisi e i layer
            avanzati sono attivi per tutti. Il <b>Giudice LLM</b> resta riservato
            al piano Pro.
          </p>
        </section>

        <section className="ap-plans" aria-label="Piani disponibili">
          {PLANS.map((p) => (
            <article
              key={p.key}
              className={`ap-plan${plan === p.key ? " selected" : ""}`}
            >
              <div className="ap-plan-head">
                <h3>{p.name}</h3>
                <span className="ap-price">{p.price}</span>
              </div>
              <p className="ap-claim">{p.claim}</p>
              <ul className="ap-points">
                {p.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
              <button
                className={plan === p.key ? "btn-primary" : "btn-secondary"}
                type="button"
                onClick={() => setPlan(p.key)}
              >
                {plan === p.key ? "Piano selezionato" : `Scegli ${p.name}`}
              </button>
            </article>
          ))}
        </section>

        <section className="ap-compare" aria-label="Confronto delle funzionalità">
          <h2>Confronto delle funzionalità</h2>
          <table className="ap-table">
            <thead>
              <tr>
                <th scope="col">Caratteristica</th>
                <th scope="col">Free</th>
                <th scope="col">Pro</th>
              </tr>
            </thead>
            <tbody>
              {FEATURES.map((f) => (
                <tr key={f.label}>
                  <th scope="row">{f.label}</th>
                  <td><Cell value={f.free} /></td>
                  <td><Cell value={f.pro} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="ap-signup" aria-label="Registrazione">
          <WaitingListForm plan={plan} onPlanChange={setPlan} />
        </section>
      </div>
    </div>
  );
}
