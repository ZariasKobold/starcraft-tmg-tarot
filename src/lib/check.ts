import type { Unit } from '../model';

const tok = (s: string) => (s.replace(/[’‘]/g, "'").replace(/''/g, '"').toLowerCase().match(/[a-z0-9+]+/g) ?? []);
const IGNORE = new Set(tok('upgrade upgrades card of tags personal reprint layout blizzard entertainment inc archon sh sp ar ev hp sz weapon rng target roa hit surge s dice dmg keyword additional for passive active reaction any movement assault combat phase cont unique cp bm pe wip'));

function unitText(u: Unit) {
  const parts = [u.name, u.sub ?? '', u.chips.join(' '), u.role, u.slot ?? '', u.base, u.tags];
  for (const p of Object.values(u.phases)) {
    if (!p) continue;
    for (const a of p.abilities) parts.push(a.n, a.t.replace(/[{}*]/g, ' '));
    for (const w of p.weapons) parts.push(...w.c, w.note ?? '');
  }
  return parts.join(' ');
}

export interface CheckResult { added: string[]; dropped: string[]; outOfOrder: string[] }

/** Words on the card that aren't on the source sheet, words on the sheet that didn't make it, and abilities whose wording isn't a verbatim run of the source. */
export function checkAgainstSource(u: Unit, sourcePlain: string): CheckResult {
  const src = tok(sourcePlain);
  const srcSet = new Set(src);
  const mine = tok(unitText(u));
  const mineSet = new Set(mine);
  const num = (w: string) => /^[0-9+]+$/.test(w);
  const added = [...new Set(mine.filter((w) => !srcSet.has(w) && !IGNORE.has(w) && !num(w)))];
  const labels = new Set(tok('cards close ranged role slot army models supply points armour evade size speed shield faction fold here september october november december may june july august tm v type name d g p r u e mm upgrade unit cards terran zerg protoss'));
  const dropped = [...new Set(src.filter((w) => w.length > 1 && !mineSet.has(w) && !IGNORE.has(w) && !labels.has(w) && !num(w)))];
  const joined = ' ' + src.join(' ') + ' ';
  const outOfOrder: string[] = [];
  for (const p of Object.values(u.phases)) for (const a of p?.abilities ?? []) {
    const t = tok(a.n + ' ' + a.t.replace(/\{P\}/g, 'PASSIVE').replace(/\{A\}/g, 'ACTIVE').replace(/\{R\}/g, 'REACTION').replace(/[{}*]/g, ' ')).filter((w) => !['passive', 'active', 'reaction'].includes(w) && !/^\d+$/.test(w) && !['cp', 'bm', 'pe', 'x'].includes(w));
    const srcFiltered = ' ' + src.filter((w) => !['passive', 'active', 'reaction'].includes(w) && !/^\d+$/.test(w) && !['cp', 'bm', 'pe', 'x'].includes(w)).join(' ') + ' ';
    if (!srcFiltered.includes(' ' + t.join(' ') + ' ') && !joined.includes(' ' + t.join(' ') + ' ')) outOfOrder.push(a.n);
  }
  return { added, dropped, outOfOrder };
}

export const isClean = (r: CheckResult) => !r.added.length && !r.dropped.length && !r.outOfOrder.length;
