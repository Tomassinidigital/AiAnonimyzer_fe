/** Formattazione tempi (specchio di fmtElapsed/fmtSec del frontend originale). */

export function fmtElapsed(sec: number): string {
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${String(sec % 60).padStart(2, "0")}s`;
}

export function fmtSec(s: number): string {
  if (s < 0.01) return "<0.01s";
  if (s < 10) return `${s.toFixed(2)}s`;
  if (s < 60) return `${s.toFixed(1)}s`;
  return fmtElapsed(Math.round(s));
}

export function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Nome breve del modello (ultimo segmento dopo "/"). */
export function shortModel(m: string | null | undefined): string {
  return m ? String(m).split("/").pop()! : (m ?? "");
}
