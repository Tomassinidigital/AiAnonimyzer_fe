# public_api — client delle API (frontend beta PDF)

Client TypeScript **senza UI** con le sole chiamate API usate dal frontend
`beta PDF/`. La SPA React precedente è archiviata in `public_api_legacy/`.

| Funzione | Endpoint |
| --- | --- |
| `getUiConfig` | `GET /api/system/ui-config` |
| `getDetectionLayers` | `GET /api/detection/layers` |
| `getApprovers` | `GET /api/approvers` |
| `uploadPdf` · `getPdfJob` · `analyzePdf` | `POST /api/pdf/upload` · `GET /api/pdf/job/{id}` |
| `getPdfOverlay` | `GET /api/pdf/overlay/{doc_id}` |
| `searchPdfPhrase` | `GET /api/pdf/search/{doc_id}` |
| `downloadPdf` | `POST /api/pdf/download/{doc_id}/redact` |
| `deletePdfDocument` | `DELETE /api/pdf/{doc_id}` |

## Uso

```ts
import { setApiBase, analyzePdf, getPdfOverlay } from "./src/index";

setApiBase("https://backend.example");        // default: window.BETA_API_BASE, altrimenti stessa origine
const docId = await analyzePdf(file, { layers: ["rules"] });
const { boxes, pages } = await getPdfOverlay(docId, { mode: "initial" });
```

I box dell'overlay sono in punti PDF, origine in alto a sinistra, nello spazio
della pagina **visualizzata** (rotazione `/Rotate` già applicata).

## Comandi

```bash
pnpm install
pnpm typecheck
```

Il PDF non viene conservato dal server (GDPR): `downloadPdf` richiede di
**ricaricare** il file.
