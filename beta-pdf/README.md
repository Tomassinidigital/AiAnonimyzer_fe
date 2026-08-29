# beta PDF — editor FE (clone di redactpdf.io) agganciato alle API del progetto

Editor **front-end** che ricrea il flusso utente di
[redactpdf.io](https://redactpdf.io/it) — carichi un PDF, il sistema individua i
dati personali, tu rivedi/modifichi/approvi le redazioni e scarichi un **PDF
protetto** — **agganciato al backend reale** di AiAnonimyzer_v3.

> ⚠️ Prototipo dimostrativo dell'interfaccia. I dati del PDF di esempio sono
> **fittizi**.

## Sempre backend

Il rilevamento dei PII è **sempre** quello reale del progetto: non esiste una
modalità offline. La UI chiama gli stessi endpoint del frontend principale
(`/api/pdf/upload` → job → `/api/pdf/overlay`, `/api/pdf/raw`,
`/api/system/ui-config`, `/api/detection/layers`, `/api/approvers`). La
**colonna opzioni** pilota i parametri reali (profilo/layer, confidenza,
verifica LLM, modalità di offuscamento, gravità). Il badge in alto indica lo
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
   - **sinistra — colonna opzioni**: profilo di rilevamento (GDPR / GDPR+ / Gare /
     Debug con i singoli layer), confidenza minima, verifica LLM (giudice) con
     scelta del modello, anteprima veloce, **modalità di offuscamento** e
     **livelli di gravità**. I parametri sono etichettati `nuova analisi`
     (richiedono _Riesegui analisi_) o `subito` (ricaricano l'overlay al volo);
   - **centro — documento** renderizzato con PDF.js (canvas + text-layer
     selezionabile) con i box di redazione dell'IA;
   - **destra — sidebar**: suggerimenti PII raggruppati per categoria (conteggio
     occorrenze + checkbox) e campo **_"Oscura una frase"_**: digitando una frase
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
estraibile dal file — coerente con la promessa del prodotto di riferimento
("rimuove sia il testo visibile sia il livello di testo sottostante… il processo
è irreversibile"). Verificato: nel PDF generato stringhe come il codice fiscale
o l'IBAN non sono più presenti nei byte del file.

## Ripartizione front-end / back office

Nessuna logica di rilevamento è reimplementata nel FE: il lavoro pesante
(estrazione, layer AI, giudice LLM, OCR) resta nel **backend** del progetto e la
UI lo consuma via API. Il FE si occupa solo di render, interazione e della
generazione del PDF protetto lato client.

## Struttura

```
beta PDF/
├── index.html            # 3 viste: carica · elabora · editor (3 colonne)
├── css/beta.css          # stile (accento blu, card, pagina con ombra)
├── assets/logo.svg       # logo AiAnonimyzer (brand + favicon)
├── js/
│   ├── api.js             # client delle API del progetto (/api/pdf/*, /api/system/*)
│   ├── pdf-engine.js      # PDF.js: render, text-layer, ricerca occorrenze,
│   │                      # generazione del PDF protetto (rasterizzazione + pdf-lib)
│   └── app.js             # orchestrazione, colonna opzioni, modello a gruppi
└── sample/
    └── documento_gara_fake.pdf   # PDF di prova con dati sensibili FITTIZI
```

Librerie caricate da CDN (stesso approccio del progetto principale):
`pdf.js 3.11.174` e `pdf-lib 1.17.1`.

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
