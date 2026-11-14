/* Cronologia undo/redo delle redazioni (gruppi + pagine eliminate).

   Snapshot superficiali: i box sono condivisi tra gli snapshot (sola lettura,
   mai mutati), gruppi e occorrenze sono clonati. Nessun DOM: chi mostra lo stato
   dei pulsanti riceve `onChange`. */

const LIMIT = 50;

function snapshot(state) {
  return {
    groups: state.groups.map((g) => ({ ...g, occurrences: g.occurrences.map((o) => ({ ...o, boxes: o.boxes })) })),
    deleted: Array.from(state.deletedPages),
  };
}

function apply(state, snap) {
  state.groups = snap.groups.map((g) => ({ ...g, occurrences: g.occurrences.map((o) => ({ ...o })) }));
  state.deletedPages = new Set(snap.deleted);
}

/* `onRestore()` è chiamato dopo undo/redo (lo stato è già aggiornato);
   `onChange({canUndo, canRedo})` a ogni variazione della cronologia. */
export function createHistory(state, { onRestore, onChange }) {
  let stack = [], index = -1;
  const notify = () => onChange({ canUndo: index > 0, canRedo: index < stack.length - 1 });

  return {
    // Nuovo punto di partenza (documento caricato o rilevamenti ricalcolati).
    seed() { stack = [snapshot(state)]; index = 0; notify(); },
    push() {
      stack = stack.slice(0, index + 1);
      stack.push(snapshot(state));
      if (stack.length > LIMIT) stack.shift();
      index = stack.length - 1;
      notify();
    },
    undo() { if (index <= 0) return; index--; apply(state, stack[index]); onRestore(); notify(); },
    redo() { if (index >= stack.length - 1) return; index++; apply(state, stack[index]); onRestore(); notify(); },
  };
}
