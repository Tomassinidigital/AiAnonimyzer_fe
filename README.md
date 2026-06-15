# Anonimizzatore — Frontend SPA (public_api)

Frontend **completamente indipendente e API-based** dell'Anonimizzatore Documenti
di Gara. Non dipende dal rendering server-side Jinja: parla con il backend FastAPI
solo via HTTP/JSON e replica **tutte** le feature del frontend originale
(`public/`).

## Stack tecnologico

| Ambito | Tecnologia |
| --- | --- |
| Linguaggio | TypeScript 5 |
| Bundler / dev server | Vite 6 |
| UI framework | React 19 (React Compiler stabile) |
| Component library | Ant Design v6 + `@ant-design/icons` 6 |
| Routing | React Router v7 |
| Server state / fetching | TanStack Query v5 |
| UI state locale | Zustand 5 |
| Form e validazione | React Hook Form v7 + Zod v3 + `@hookform/resolvers` |
| HTTP client | Axios 1 (con interceptor) |
| Rendering PDF | `pdfjs-dist` 4 |
| Package manager | pnpm |

## Configurazione del path delle API

Il base URL del backend è **completamente configurabile** (requisito di un
frontend indipendente). Priorità (la prima definita vince):

1. `window.__API_BASE_URL__` — override a **runtime** (in `index.html`, nessun
   rebuild necessario). Utile per il deploy: stesso bundle, backend diversi.
2. `VITE_API_BASE_URL` — variabile di **build** (file `.env`).
3. Fallback `http://localhost:8000` — comodo per i test locali.

Per i test in locale è sufficiente copiare `.env.example` in `.env` (già
preconfigurato su `http://localhost:8000`).

```bash
cp .env.example .env
```

## Avvio in locale

Prerequisito: il backend FastAPI in esecuzione (di default su `:8000`). Dalla
root del repository:

```bash
uvicorn web.app:app --reload --port 8000
```

Il backend abilita automaticamente il **CORS** per le origini `localhost`/
`127.0.0.1` in sviluppo (configurabile con `CORS_ORIGINS`). Poi, in questa
cartella:

```bash
pnpm install
pnpm dev          # dev server su http://localhost:5173
```

### Build di produzione

```bash
pnpm build        # type-check + bundle in dist/
pnpm preview      # anteprima del build
```

In produzione imposta `VITE_API_BASE_URL` (o `window.__API_BASE_URL__`) sull'URL
pubblico del backend e `CORS_ORIGINS` lato backend sull'origine del frontend.

## Deploy su GitHub Pages con backend su Hugging Face

Il workflow [`.github/workflows/deploy-pages.yml`](../.github/workflows/deploy-pages.yml)
builda la SPA e la pubblica su GitHub Pages puntando le API a un **Hugging Face
Space** (Docker) che esegue il backend FastAPI (`web.app`).

### 1. Backend sullo Space Hugging Face
- Lo Space deve eseguire `uvicorn web.app:app --host 0.0.0.0 --port 7860`
  (HF espone la porta 7860). L'URL sarà `https://<utente>-<space>.hf.space`.
- Imposta sullo Space la variabile d'ambiente **CORS_ORIGINS** con l'origine di
  Pages, altrimenti il browser blocca le chiamate cross-origin:
  ```
  CORS_ORIGINS=https://<utente>.github.io
  ```
- Backend e frontend devono essere entrambi **HTTPS** (gli Space `.hf.space` lo
  sono; Pages lo è) per evitare il blocco *mixed content*.

### 2. Frontend su GitHub Pages
- In **Settings → Pages → Source** scegli **GitHub Actions**.
- In **Settings → Secrets and variables → Actions → Variables** aggiungi la
  variabile **`HF_API_BASE_URL`** con l'URL dello Space, es.
  `https://<utente>-<space>.hf.space`.
- Il workflow parte ad ogni push su `main` che tocca `public_api/`, oppure
  manualmente (**Actions → Deploy FE → Run workflow**), dove puoi anche passare
  un `api_base_url` una tantum.
- Il `base` degli asset è impostato automaticamente a `/<repo>/`
  (project site). Il sito sarà su `https://<utente>.github.io/<repo>/`.

> Nota: con repo **privato**, GitHub Pages richiede un piano a pagamento
> (Pro/Team/Enterprise); il sito pubblicato resta comunque pubblico. In
> alternativa il `dist/` può essere servito da Cloudflare Pages/Netlify o
> direttamente dallo Space.

## Feature replicate dal frontend originale

- Sorgente **Testo** o **PDF** (con opzione *fast* — solo prime 4 pagine) e
  caricamento di **testi demo**.
- **Profili** di rilevamento (GDPR / GDPR+ / Documenti gare / Debug) con scelta
  manuale dei **layer** in modalità Debug (incluso l'isolamento dell'LLM).
- **Confidenza minima**, **Verifica LLM** (giudice) con scelta del modello e
  modalità *simula llm*.
- **Modalità di offuscamento** e **livelli di gravità** applicati in re-render
  (senza nuova analisi).
- Viste risultati: **Evidenziato** (con offuscamento manuale "Oscura"/
  "Ripristina" e layout PDF), **Anonimizzato** (singolo e multi-modalità),
  **Report**, **JSON** (copia/scarica), **Anteprima PDF** (overlay con
  navigazione pagine/frasi, lista elementi, download redatto/offuscato),
  **Confronto**, **Metodi**, **Debug**.
- Flusso a due fasi con **giudice LLM in background**, **job asincroni** con
  avanzamento, **riepilogo tempi**, **monitor di sistema** (GPU/VRAM), modale
  introduttiva, banner "risultati obsoleti", avviso stato giudice, e modale
  **"server non raggiungibile"**.

## Endpoint backend usati

Tutti sotto il base URL configurato:

- `GET /api/system/ui-config` — bootstrap (modalità, colori gravità, soglia,
  versione, flag monitor). *Aggiunto per la SPA.*
- `GET /api/system/stats`, `GET /api/detection/layers`, `GET /api/approvers`,
  `GET /api/demo/list`, `GET /api/demo/{key}`
- `POST /api/detect`, `POST /api/detect/start`, `POST /api/render`
- `POST /api/detect/compare/start`, `POST /api/detect/debug`,
  `POST /api/detect/debug/start`, `GET /api/job/{id}`,
  `GET /api/detect/timings/{doc_id}`
- `POST /api/pdf/upload`, `GET /api/pdf/job/{id}`, `GET /api/pdf/layout/{doc_id}`,
  `GET /api/pdf/render/{doc_id}`, `GET /api/pdf/overlay/{doc_id}`,
  `GET /api/pdf/raw/{doc_id}`, `GET /api/pdf/download/{doc_id}/redact`
- `GET /healthz`

## Struttura

```
src/
  api/         client Axios, tipi DTO, endpoint, hook TanStack Query, polling job
  config/      risoluzione del base URL delle API
  store/       Zustand: catalogo, impostazioni UI, sessione, feedback, stato server
  features/    orchestrazione imperativa delle run (Analizza/Debug, testo/PDF)
  components/  shell, settings (pannello sinistro), results (viste), feedback, modals
  utils/       formattazione, offuscamento locale, snapshot config, avvisi LLM
  styles/      CSS riusato dal frontend originale + override per Ant Design
```
