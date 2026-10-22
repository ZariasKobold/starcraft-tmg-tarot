/** Smallest photo banner (mm) before text starts shrinking below 6.2pt. */
export const ART_MIN = 14;
export interface Fit { fs: number; art: number; nm: number; over: boolean }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
/** Card text markup → HTML. */
export const rich = (s: string) => esc(s)
  .replace(/\{P\}/g, '<span class="kw p">PASSIVE</span>')
  .replace(/\{A\}/g, '<span class="kw a">ACTIVE</span>')
  .replace(/\{R\}/g, '<span class="kw r">REACTION</span>')
  .replace(/\{([0-9X]+ (?:BM|CP|PE))\}/g, '<span class="kw c">$1</span>')
  .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
  .replace(/\n/g, '<br>');
