# beta PDF — editor FE agganciato alle API del progetto

Editor **front-end** per la redazione dei PDF — carichi un PDF, il sistema individua i
dati personali, tu rivedi/modifichi/approvi le redazioni e scarichi un **PDF
protetto** — **agganciato al backend reale** di AiAnonimyzer_v3.

> ⚠️ Prototipo dimostrativo dell'interfaccia. I dati del PDF di esempio sono
> **fittizi**.

## Sempre backend

Il rilevamento dei PII è **sempre** quello reale del progetto: non esiste una
modalità offline. La UI chiama gli stessi endpoint del frontend principale
(`/api/pdf/upload` → job → `/api/pdf/overlay`,
`/api/system/ui-config`, `/api/approvers`). La
**colonna opzioni** pilota i parametri reali (moduli di rilevamento,
baseline, ranking, verifica LLM, modalità di offuscamento, gravità). Il badge in alto indica lo
stato del backend (`● backend connesso` / `● backend non raggiungibile`).

## Come avviarlo agganciato alle API

Il backend monta la cartella su `/beta` (vedi `web/app.py`). Avviato il server
del progetto, apri **`http://localhost:8000/beta`**: la UI userà le API reali
same-origin. Per puntare a un backend su un host diverso (es. sito statico che
parla con un backend remoto) imposta `window.BETA_API_BASE` prima degli script
(il backend deve consentire il CORS dell'origine della pagina).

## Il flusso ricostruito

1. **Carica** — drag & drop o file picker di un PDF (o _"Prova con un esempio"_).
2. **Elabora** — upload + analisi lato server con avanzamento reale del job.
3. **Editor** — il modulo PDF, con **tre colonne**:
   - **sinistra — colonna opzioni**: **moduli di rilevamento** (GDPR sempre
     attivo; Gare e i moduli futuri si aggiungono senza rieseguire l'analisi
     già fatta), **baseline** (score minimo accettabile) e **ranking** 1–4
     (spuntati = visibili e oscurati nel PDF; all'apertura 1 e 2), verifica LLM
     (giudice) con scelta del modello, anteprima veloce, **modalità di
     offuscamento** e **livelli di gravità**. I parametri sono etichettati
     `nuova analisi` (richiedono _Riesegui analisi_) o `subito` (ricaricano
     l'overlay al volo);
   - **centro — documento** renderizzato con PDF.js (canvas + text-layer
     selezionabile) con i box di redazione dell'IA, contornati nel colore del
     loro ranking, con un pallino dello score in alto a destra;
   - **destra — sidebar**: suggerimenti PII raggruppati per categoria (pill del
     ranking, conteggio occorrenze + checkbox) e campo **_"Oscura una frase"_**: digitando una frase
     (o **selezionandola nel documento**) parte un **search in tutto il
     documento** e tutte le occorrenze vengono redatte.
   - clic su un box per annullarlo/ripristinarlo; clic sul valore per saltarvi.
4. **Scarica** — _"Scarica PDF protetto"_ genera il PDF flatten lato client
   (include anche le redazioni manuali). In ONLINE, _"Redazione server"_ usa la
   hard-redaction del backend, che onora modalità e gravità (solo entità IA).

## Perché il PDF finale è "protetto" (irreversibile)

Il PDF di output è prodotto **impriming i box neri e poi rasterizzando** ogni
pagina (via `<canvas>` + pdf-lib). Di conseguenza **il livello di testo
sottostante sparisce**: il testo sensibile non è più selezionabile né
estraibile dal file: vengono rimossi sia il testo visibile sia il livello di
testo sottostante, e il processo è irreversibile. Verificato: nel PDF generato stringhe come il codice fiscale
o l'IBAN non sono più presenti nei byte del file.

## Ripartizione front-end / back office

Nessuna logica di rilevamento è reimplementata nel FE: il lavoro pesante
(estrazione, layer AI, giudice LLM, OCR) resta nel **backend** del progetto e la
UI lo consuma via API. Il FE si occupa solo di render, interazione e della
generazione del PDF protetto lato client.

## Struttura

JavaScript a moduli ES nativi (nessuna build), una cartella per contesto.
`main.js` è l'unico modulo che conosce tutte le parti: crea stato, client API e
motore PDF e li passa alle funzionalità. Le funzionalità non si importano a
vicenda: comunicano con gli eventi del bus (`core/store.js`), per esempio
«redazioni cambiate» → viewer, lista, contatori e cronologia si aggiornano.

```
beta PDF/
├── index.html                 # 3 viste: carica · elabora · editor (3 colonne)
│                              # + blocco BETA_CONFIG (riscritto dal workflow Pages)
├── css/                       # uno stile per contesto, caricati in quest'ordine
│   ├── base.css  shell.css  upload.css  analysis.css
│   └── options.css  viewer.css  sidebar.css  export.css
├── js/
│   ├── main.js                # punto di composizione (dependency injection)
│   ├── core/                  # config.js (deploy, costanti) · store.js (stato + eventi)
│   ├── api/                   # http.js + un client per risorsa: catalog, analysis, documents
│   ├── pdf/                   # motore nel browser: loader, geometry, search, masking,
│   │                          # rendering, protected-pdf (flatten con pdf-lib), libs
│   ├── domain/                # regole senza DOM: redactions, selection (moduli/
│   │                          # baseline/ranking), history (undo/redo)
│   ├── shared/                # dom.js (helper) · dialogs.js (modali, toast)
│   └── features/              # un'area dell'interfaccia per cartella
│       ├── shell/             # viste, avvio, badge backend, contatori, config dal backend
│       ├── upload/            # dropzone, selezione file, esempio
│       ├── analysis/          # analisi sul server, ricalcolo live, aggiunta moduli
│       ├── options/           # colonna opzioni (moduli, baseline, ranking, gravità…)
│       ├── viewer/            # pagine e zoom · overlay delle redazioni · navigazione ▲▼
│       ├── sidebar/           # lista delle redazioni
│       ├── redaction/         # redazioni manuali (frase cercata o testo selezionato)
│       └── export/            # PDF protetto, redazione server, eliminazione dati
├── assets/logo.svg            # logo AiAnonimyzer (brand + favicon)
└── sample/
    └── documento_gara_fake.pdf   # PDF di prova con dati sensibili FITTIZI
```

Dove mettere una modifica:

- **nuova area dell'interfaccia** → `features/<contesto>/`, montata in `main.js`;
- **reazione a un cambiamento** (es. ridisegnare qualcosa quando cambiano le
  redazioni) → una sottoscrizione a un evento di `core/store.js`, senza toccare
  chi lo emette;
- **regola senza DOM** (raggruppamento, conteggi, ranking) → `domain/`;
- **nuovo endpoint** → il client della risorsa in `api/`.

Librerie caricate da CDN (stesso approccio del progetto principale):
`pdf.js 3.11.174` e `pdf-lib 1.17.1`. I moduli ES richiedono che la pagina sia
servita via http (backend su `/beta`, GitHub Pages): aperta da `file://` non parte.

## Come si prova

Serve il **backend attivo** (il rilevamento è sempre lato server):

```bash
# avvia il server del progetto, poi:
# apri  http://localhost:8000/beta
```

Poi: _"Prova con un esempio"_ → l'editor mostra i PII rilevati → regola le
opzioni a sinistra, scrivi una frase in _"Oscura una frase"_ o seleziona del
testo → **Scarica PDF protetto**. Per un backend su host diverso imposta
`window.BETA_API_BASE` (con CORS abilitato).

Test end-to-end (browser reale con Playwright + Chromium, backend avviato dal
test con `ENABLE_ML=false`): caricamento dell'esempio, ranking e baseline,
modulo Gare, undo/redo, zoom, navigazione, redazione manuale, download.

```bash
BETA_E2E=1 pytest tests/test_beta_ui_e2e.py   # richiede: playwright install chromium
```
