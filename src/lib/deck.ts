import { PHASES, type FactionId, type Override, type PhaseKey, type Unit } from '../model';

export interface Rule { find: string; replace: string; faction?: FactionId; note?: string }

/** Typo fixes you approved for waves 1–2. Edit them in the Corrections panel. */
export const DEFAULT_RULES: Rule[] = [
  { find: 'Concusive', replace: 'Concussive', note: 'Marauder typo' },
  { find: 'Impassible', replace: 'Impassable', note: 'Siege Tank typo' },
  { find: 'Riffle', replace: 'Rifle', note: 'C-14 Rifle label' },
  { find: 'Glaves', replace: 'Glaives', note: 'Adept typo' },
  { find: 'Armored', replace: 'Armoured', note: 'Pylon tag spelling' },
  { find: '{1 CP}', replace: '{1 BM}', faction: 'zerg', note: 'Glial Reconstitution: Zerg spend BM, not CP' },
];

export const fix = (s: string, rules: Rule[]) => rules.reduce((acc, r) => (r.find ? acc.split(r.find).join(r.replace) : acc), s);

export function applyRules(u: Unit, all: Rule[]): Unit {
  const rules = all.filter((r) => !r.faction || r.faction === u.faction);
  if (!rules.length) return u;
  const f = (s: string) => fix(s, rules);
  const phases: Unit['phases'] = {};
  for (const [k, p] of Object.entries(u.phases) as [PhaseKey, NonNullable<Unit['phases'][PhaseKey]>][]) {
    phases[k] = {
      abilities: p.abilities.map((a) => ({ ...a, n: f(a.n), t: f(a.t) })),
      weapons: p.weapons.map((w) => ({ ...w, c: w.c.map(f) as typeof w.c, note: w.note && f(w.note) })),
    };
  }
  return { ...u, name: f(u.name), sub: u.sub && f(u.sub), tags: f(u.tags), chips: u.chips.map(f), phases };
}

export function finalUnit(u: Unit, o: Override | undefined, rules: Rule[]): Unit {
  const corrected = applyRules(u, rules);
  return o?.edits ? { ...corrected, ...o.edits, warnings: u.warnings } : corrected;
}

export interface CardSpec {
  key: string; // unique per printed card
  unit: Unit; // phases already narrowed for split cards
  part?: string; // "Card 1 of 2"
  artId: string;
}

const textLen = (u: Unit, k: PhaseKey) => {
  const p = u.phases[k];
  if (!p) return 0;
  return p.abilities.reduce((n, a) => n + a.n.length + a.t.length, 0) + p.weapons.length * 60 + 40;
};

/** Split a unit into two cards at the phase boundary that balances the text best. */
export function splitUnit(u: Unit): CardSpec[] {
  const present = PHASES.map(([k]) => k).filter((k) => u.phases[k]);
  if (present.length < 2) return [{ key: u.id, unit: u, artId: u.id }];
  const score = (cut: number) => Math.max(
    present.slice(0, cut).reduce((n, k) => n + textLen(u, k), 0),
    present.slice(cut).reduce((n, k) => n + textLen(u, k), 0),
  );
  let best = 1;
  for (let cut = 2; cut < present.length; cut++) if (score(cut) < score(best)) best = cut;
  // house style: movement on card 1, assault on card 2, unless that's clearly lopsided
  const conventional = present.indexOf('assault');
  if (conventional > 0 && score(conventional) <= score(best) * 1.15) best = conventional;
  const groups = [present.slice(0, best), present.slice(best)];
  return groups.map((g, i) => ({
    key: `${u.id}#${i + 1}`,
    unit: { ...u, phases: Object.fromEntries(g.map((k) => [k, u.phases[k]])) },
    part: `Card ${i + 1} of 2`,
    artId: u.id,
  }));
}

export const MIN_PT = 6.0;

/** Apply the same corrections to raw source text, so the source check doesn't flag them. */
export const fixSource = (plain: string, faction: FactionId, rules: Rule[]) =>
  rules.filter((r) => r.find && (!r.faction || r.faction === faction)).reduce((acc, r) => {
    const find = r.find.replace(/[{}]/g, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return acc.replace(new RegExp(find, 'gi'), r.replace.replace(/[{}]/g, ''));
  }, plain);

/** Archon names later waves …-P2P-W2-…, -W3-…; the first wave has no number. */
export const waveOf = (file: string) => (file.match(/-W(\d+)-/)?.[1] ?? '1');
