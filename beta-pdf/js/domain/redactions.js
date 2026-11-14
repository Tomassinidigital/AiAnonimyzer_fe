/* Modello delle redazioni: gruppi (un valore, es. un'email) con le loro
   occorrenze nel documento. Funzioni pure sullo stato, nessun DOM.

   Gruppo:     { id, source: "ai"|"manual", label, labelIt, color, value,
                 occurrences, active, severity?, rank? }
   Occorrenza: { page, boxes, on, char?: [start,end], severity?, score?, rank? } */

const LABELS_IT = {
  PERSONA: "Nome e cognome", EMAIL: "Indirizzo e-mail", PEC: "PEC", TELEFONO: "Numero di telefono",
  CF: "Codice fiscale", IBAN: "IBAN / dati bancari", INDIRIZZO: "Indirizzo fisico", IVA: "Partita IVA",
};

export function prettyLabel(l) {
  return LABELS_IT[l] || (l.charAt(0) + l.slice(1).toLowerCase()).replace(/_/g, " ");
}

export function makeGroup(state, source, label, labelIt, color, value, occurrences) {
  return {
    id: state.seq++, source, label, labelIt: labelIt || label, color: color || "#334155",
    value, occurrences: occurrences || [], active: true,
  };
}

const occKey = (page, char) => page + "|" + char[0] + "|" + char[1];

/* Gruppi IA dall'overlay del backend. Le occorrenze con stesso range di
   caratteri (redazione multi-riga) sono unite; i valori uguali dello stesso tipo
   formano un gruppo. Le redazioni IA che l'utente aveva annullato restano
   annullate (l'overlay viene ricalcolato a ogni cambio di modulo, baseline,
   ranking o gravità). `toClientBox(b)` porta un box del backend nello spazio
   del client. Ritorna { scanned, scannedMsg, analyzedPages, groups } dove
   `groups` contiene anche le redazioni manuali esistenti, invariate. */
export function groupsFromOverlay(state, overlay, toClientBox) {
  const manual = state.groups.filter((g) => g.source === "manual");
  if (overlay.is_scanned) {
    return {
      scanned: true,
      scannedMsg: overlay.message || "PDF scansionato (solo immagine): overlay non disponibile.",
      analyzedPages: 0,
      groups: manual,
    };
  }
  const off = new Set();
  state.groups.forEach((g) => {
    if (g.source !== "ai") return;
    g.occurrences.forEach((o) => { if ((!g.active || !o.on) && o.char) off.add(occKey(o.page, o.char)); });
  });

  const occMap = new Map();
  (overlay.boxes || []).forEach((b) => {
    if (!state.docModel.pages[b.page]) return; // pagina non presente nel PDF caricato
    const cb = toClientBox(b);
    cb.masked = b.masked || ""; cb.severity = b.severity || "";
    const key = occKey(b.page, [b.char_start, b.char_end]);
    let o = occMap.get(key);
    if (!o) {
      o = { page: b.page, boxes: [], text: b.text || "", label: b.label || "—", severity: b.severity || "",
        char: [b.char_start, b.char_end], score: b.score, rank: b.rank || 1 };
      occMap.set(key, o);
    }
    o.boxes.push(cb);
  });

  const byValue = new Map();
  occMap.forEach((o, key) => {
    const gk = o.label + "|" + o.text.toLowerCase();
    let g = byValue.get(gk);
    if (!g) {
      g = makeGroup(state, "ai", o.label, prettyLabel(o.label), state.sevColors[o.severity] || "#334155", o.text || o.label, []);
      g.severity = o.severity; g.rank = o.rank;
      byValue.set(gk, g);
    }
    g.rank = Math.min(g.rank, o.rank); // il gruppo mostra il ranking migliore
    g.occurrences.push({ page: o.page, boxes: o.boxes, on: !off.has(key), char: o.char,
      severity: o.severity, score: o.score, rank: o.rank });
  });

  const ai = Array.from(byValue.values());
  ai.forEach((g) => { g.active = g.occurrences.some((o) => o.on); });
  return { scanned: false, scannedMsg: "", analyzedPages: (overlay.pages || []).length, groups: [...ai, ...manual] };
}

/* Aggiunge (o riattiva) la redazione manuale di una frase. */
export function addManualPhrase(state, value, occurrences) {
  const existing = state.groups.find((g) => g.source === "manual" && g.value.toLowerCase() === value.toLowerCase());
  if (existing) { existing.active = true; existing.occurrences.forEach((o) => (o.on = true)); return; }
  state.groups.unshift(makeGroup(state, "manual", "MANUAL", "Redazione manuale", "#111827", value,
    occurrences.map((o) => ({ ...o, on: true }))));
}

export function setGroupActive(g, on) {
  g.active = on;
  if (on) g.occurrences.forEach((o) => (o.on = true));
}

export function setAllActive(state, on) { state.groups.forEach((g) => setGroupActive(g, on)); }

export function removeGroup(state, g) { state.groups = state.groups.filter((x) => x !== g); }

const isLive = (state, o) => o.on && !state.deletedPages.has(o.page);

// Occorrenze da imprimere nel PDF: gruppi attivi, occorrenze accese, pagine non eliminate.
export function activeOccurrences(state) {
  const out = [];
  state.groups.forEach((g) => {
    if (!g.active) return;
    g.occurrences.forEach((o) => { if (isLive(state, o)) out.push({ page: o.page, boxes: o.boxes }); });
  });
  return out;
}

// { active: occorrenze attive, groups: gruppi con almeno un'occorrenza attiva }
export function counts(state) {
  let active = 0, groups = 0;
  state.groups.forEach((g) => {
    if (!g.active) return;
    const on = g.occurrences.filter((o) => isLive(state, o)).length;
    if (on) groups++;
    active += on;
  });
  return { active, groups };
}

// Range dei rilevamenti IA deselezionati: il server non li oscura.
export function excludedRanges(state) {
  const out = [];
  state.groups.forEach((g) => {
    if (g.source !== "ai") return;
    g.occurrences.forEach((o) => { if ((!g.active || !o.on) && o.char) out.push(o.char); });
  });
  return out;
}

export const hasActiveManual = (state) => state.groups.some((g) => g.source === "manual" && g.active);

// Tipo selezionato dal filtro "Solo <tipo>" della lista, o null.
export const onlyLabel = (filter) => (filter.startsWith("only:") ? filter.slice(5) : null);

/* Occorrenze attive in ordine di lettura (pagina, dall'alto, da sinistra),
   rispettando il filtro della lista: base della navigazione ▲▼. */
export function navigationOrder(state) {
  const only = onlyLabel(state.listFilter);
  const list = [];
  state.groups.forEach((g) => {
    if (!g.active || (only && g.label !== only)) return;
    g.occurrences.forEach((occ, oi) => {
      if (!isLive(state, occ) || !occ.boxes.length) return;
      const top = Math.max(...occ.boxes.map((b) => b.y1)); // origine in basso: y1 = alto
      const left = Math.min(...occ.boxes.map((b) => b.x0));
      list.push({ gid: g.id, oi, page: occ.page, top, left });
    });
  });
  return list.sort((a, b) => a.page - b.page || b.top - a.top || a.left - b.left);
}

// Pagine (array) su cui il gruppo ha occorrenze.
export const groupPages = (g) => [...new Set(g.occurrences.map((o) => o.page))];
