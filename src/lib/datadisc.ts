// Units from the SCTMG Data Disc API (api/v1/units/<id>.json), for waves Archon hasn't
// published card-sheet PDFs for yet. Each file becomes the same Unit a parsed PDF page would.
import type { Ability, FactionId, PhaseKey, Unit, Weapon, WeaponCells } from '../model';

interface DDWeapon {
  phase: string; name: string; range: number | string; target: string; rateOfAttack: number | string;
  hit: string; surgeType: string[]; surgeDice: string | null; damage: number | string; keywords: string[];
}
interface DDAbility { phase: string; name: string; kind: string | null; text: string | null }
interface DDUpgrade extends DDAbility { replaces: string | null; weapon: DDWeapon | null }
export interface DDUnit {
  id: string; name: string; race: FactionId; factionTags: string[]; unique: boolean;
  armySlot: string | null; combatRole: string | null; base: string | null;
  stats: { shield: number | null; speed: string | null; armour: string | null; evade: string | null; hitPoints: number | null; size: number | null };
  combatTags: string[]; supplyByModels: { min: number; max: number; supply: number }[];
  abilities: DDAbility[]; weapons: DDWeapon[]; upgrades: DDUpgrade[];
}

const PHASE: Record<string, PhaseKey> = { Any: 'any', Movement: 'move', Assault: 'assault', Combat: 'combat' };
const inch = (s: string) => s.replace(/″/g, '"');
const str = (v: unknown) => (v === null || v === undefined || v === '' ? '-' : String(v));

/** "Reaction · 1 BM" → "{R} {1 BM}" */
function chips(kind: string | null) {
  if (!kind) return '';
  return kind.split('·').map((s) => s.trim()).map((s) =>
    s === 'Passive' ? '{P}' : s === 'Active' ? '{A}' : s === 'Reaction' ? '{R}' : /^[0-9X]+ (BM|CP|PE)$/.test(s) ? `{${s}}` : s).join(' ');
}

/** Bold the rules keywords (all-caps words, with any "(2)" / "6″" that follows), as Archon's sheets do. */
const boldKeywords = (t: string) => t.replace(/\b[A-Z][A-Z-]+(?: [A-Z][A-Z-]+)*(?: (?:Status|RoA|Speed|Armour|Armoured|Light|Range|Evade|Hit|Damage|Dmg|Size|Shield|Mechanical|Biological)\b)?(?: [0-9]+"?)?(?: \([^)]*\))?(?: [0-9]\+)?/g, (m) =>
  /[A-Z]{2}/.test(m) && !/^(BM|CP|PE|BT|FT)$/.test(m) ? `**${m}**` : m);

const cells = (w: DDWeapon): WeaponCells => [
  w.name, w.range === 'Engagement' ? 'E' : inch(str(w.range)), str(w.target), str(w.rateOfAttack), str(w.hit),
  w.surgeType.length ? w.surgeType.join(', ') : '-', str(w.surgeDice), str(w.damage),
  w.keywords.length ? inch(w.keywords.join(', ')) : '-',
];

export function fromDataDisc(d: DDUnit, file: string): { unit: Unit; plain: string } {
  const phases: Unit['phases'] = {};
  const at = (p: string) => (phases[PHASE[p] ?? 'any'] ??= { weapons: [], abilities: [] });
  const ability = (a: DDAbility, up: boolean): Ability => ({
    n: a.name, t: [chips(a.kind), boldKeywords(inch(a.text ?? ''))].filter(Boolean).join(' '), ...(up ? { up } : {}),
  });

  for (const w of d.weapons) at(w.phase).weapons.push({ c: cells(w) });
  for (const a of d.abilities) at(a.phase).abilities.push(ability(a, false));
  for (const u of d.upgrades) {
    if (u.weapon) {
      const w: Weapon = { c: cells(u.weapon), up: true, note: u.replaces ? `Upgrade for ${u.replaces}` : 'Additional weapon' };
      const list = at(u.weapon.phase).weapons;
      // sit an upgrade right under the weapon it replaces (after any earlier upgrades for it), like the sheets do
      let i = list.length;
      if (u.replaces) {
        const base = list.findIndex((x) => x.c[0].toLowerCase() === u.replaces!.toLowerCase());
        if (base >= 0) for (i = base + 1; i < list.length && list[i].up && list[i].note === w.note; i++);
      }
      list.splice(i, 0, w);
      if (u.text) at(u.phase).abilities.push(ability(u, true));
    } else at(u.phase).abilities.push(ability(u, true));
  }
  // keep the house phase order
  const ordered: Unit['phases'] = {};
  for (const k of ['any', 'move', 'assault', 'combat'] as PhaseKey[]) if (phases[k]) ordered[k] = phases[k];

  const [, name, sub] = d.name.match(/^(.*?)\s*(\([^)]*\))?$/) ?? ['', d.name];
  const s = d.stats;
  const warnings: string[] = [];
  if (!d.combatRole) warnings.push('Combat role not published yet');
  if (!d.base) warnings.push('Base size not published yet');
  warnings.push('No unit photo yet (Wave 4 has no card sheets); add one with Replace photo');

  const unit: Unit = {
    id: `${d.race}-${d.id}`, faction: d.race, file, page: 1, version: 'W4 online',
    name: name!, ...(sub ? { sub } : {}), chips: d.factionTags, unique: d.unique,
    role: d.combatRole ?? '', ...(d.armySlot ? { slot: d.armySlot } : {}), bar: 0,
    stats: {
      ...(s.shield !== null ? { shield: String(s.shield) } : {}),
      speed: str(s.speed), armour: str(s.armour), evade: str(s.evade), hp: str(s.hitPoints), size: str(s.size),
    },
    supply: d.supplyByModels.map((m) => [m.min === m.max ? String(m.min) : `${m.min}-${m.max}`, String(m.supply)]),
    base: d.base ?? '', tags: d.combatTags.join(', '), phases: ordered, warnings,
  };

  // the "source" the word-for-word check compares against: the Data Disc record itself
  const plain = [d.name, d.factionTags.join(' '), d.combatRole ?? '', d.armySlot ?? '', d.base ?? '', d.combatTags.join(' '),
    ...[...d.abilities, ...d.upgrades].flatMap((a) => [a.name, a.kind ?? '', inch(a.text ?? ''), chips(a.kind)]),
    ...[...d.weapons, ...d.upgrades.flatMap((u) => (u.weapon ? [u.weapon] : []))].flatMap((w) => cells(w)),
    ...d.upgrades.flatMap((u) => (u.replaces ? [u.replaces] : [])),
  ].join(' ');
  return { unit, plain };
}

/** Reads one Data Disc unit file (the API's {data, meta} wrapper, or the bare unit). */
export async function loadDataDisc(file: File): Promise<{ unit: Unit; plain: string }> {
  const j = JSON.parse(await file.text());
  const d: DDUnit = j.data ?? j;
  if (!d?.id || !d.race || !d.stats) throw new Error(`${file.name} isn't a Data Disc unit file`);
  const wave = file.name.match(/-W(\d+)-/)?.[1] ?? '4';
  const race = d.race[0].toUpperCase() + d.race.slice(1);
  return fromDataDisc(d, `DataDisc-${race}-W${wave}-${d.id}.json`);
}
