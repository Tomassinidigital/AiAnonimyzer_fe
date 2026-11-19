# public_api — client delle API (frontend publicv3)

Client TypeScript **senza UI** con le sole chiamate API usate dal frontend
`publicv3/`. La SPA React precedente è archiviata in `public_api_legacy/`.

| Funzione | Endpoint |
| --- | --- |
| `getUiConfig` | `GET /api/system/ui-config` |
| `getDetectionModules` | `GET /api/detection/modules` |
| `getDetectionLayers` | `GET /api/detection/layers` |
| `getApprovers` | `GET /api/approvers` |
| `uploadPdf` · `getPdfJob` · `analyzePdf` | `POST /api/pdf/upload` · `GET /api/pdf/job/{id}` |
| `addPdfModules` | `POST /api/pdf/{doc_id}/modules` |
| `getPdfOverlay` | `GET /api/pdf/overlay/{doc_id}` |
| `searchPdfPhrase` | `GET /api/pdf/search/{doc_id}` |
| `downloadPdf` | `POST /api/pdf/download/{doc_id}/redact` |
| `deletePdfDocument` | `DELETE /api/pdf/{doc_id}` |

## Uso

```ts
import { setApiBase, analyzePdf, getPdfOverlay } from "./src/index";

setApiBase("https://backend.example");        // default: window.BETA_API_BASE, altrimenti stessa origine
const docId = await analyzePdf(file, { modules: ["gare"] });   // il modulo GDPR è sempre attivo
const { boxes, pages } = await getPdfOverlay(docId, { mode: "initial" });
await addPdfModules(docId, ["gare"]);                           // aggiunge un modulo a un PDF già analizzato
```

`getPdfOverlay` e `downloadPdf` accettano anche `modules`, `baseline` e `ranks` (array di
interi, default `[1, 2]`): si applicano ai candidati già in cache, senza nuova analisi.

I box dell'overlay sono in punti PDF, origine in alto a sinistra, nello spazio
della pagina **visualizzata** (rotazione `/Rotate` già applicata).

## Comandi

```bash
pnpm install
pnpm typecheck
```

Il PDF non viene conservato dal server (GDPR): `downloadPdf` richiede di
**ricaricare** il file.
