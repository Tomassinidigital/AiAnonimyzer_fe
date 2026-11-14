/* Client delle API del backend: un oggetto per risorsa, stesso trasporto. */

import { createAnalysisApi } from "./analysis.js";
import { createCatalogApi } from "./catalog.js";
import { createDocumentsApi } from "./documents.js";
import { createHttp } from "./http.js";

export function createApi(base) {
  const http = createHttp(base);
  return {
    catalog: createCatalogApi(http),
    analysis: createAnalysisApi(http),
    documents: createDocumentsApi(http),
  };
}
