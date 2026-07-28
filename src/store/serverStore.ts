import { create } from "zustand";

/**
 * Stato di raggiungibilità del backend.
 *
 * L'interceptor axios (api/client.ts) imposta `down=true` quando una richiesta
 * fallisce a livello di rete (server giù/non avviato), `down=false` su una
 * risposta riuscita. La App mostra/nasconde la modale "Server non raggiungibile"
 * di conseguenza — stessa UX del frontend originale.
 */
interface ServerState {
  down: boolean;
  setDown: (down: boolean) => void;
}

export const useServerStore = create<ServerState>((set) => ({
  down: false,
  setDown: (down) => set((s) => (s.down === down ? s : { down })),
}));
