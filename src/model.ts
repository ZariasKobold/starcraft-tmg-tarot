// Card data model. Ability text uses a tiny markup:
//   **bold**   {P} {A} {R} = PASSIVE / ACTIVE / REACTION chips   {1 CP} {X BM} {0 PE} = cost chips   \n = line break
export type FactionId = 'terran' | 'zerg' | 'protoss';
export type PhaseKey = 'any' | 'move' | 'assault' | 'combat';
export const PHASES: [PhaseKey, string][] = [['any', 'Any Phase'], ['move', 'Movement Phase'], ['assault', 'Assault Phase'], ['combat', 'Combat Phase']];

export interface Ability { n: string; t: string; up?: boolean }
/** [name, rng, target, roa, hit, surge, sdice, dmg, keyword] */
export type WeaponCells = [string, string, string, string, string, string, string, string, string];
export interface Weapon { c: WeaponCells; up?: boolean; note?: string }
export interface Phase { weapons: Weapon[]; abilities: Ability[] }

export interface Stats { shield?: string; speed: string; armour: string; evade: string; hp: string; size: string }

export interface Unit {
  id: string;
  faction: FactionId;
  file: string;
  page: number; // 1-based page in the source PDF
  version: string; // e.g. 1.09.26
  name: string;
  sub?: string; // second title line, e.g. "(Zergling)"
  chips: string[]; // faction / sub-faction chips, e.g. ["Terran", "Nova Covert Ops"]
  unique: boolean;
  role: string;
  slot?: string;
  bar: number; // 0 = no combat bar, 1 = close ... 5 = ranged
  stats: Stats;
  supply: [string, string][]; // [models, supply]
  base: string;
  tags: string;
  phases: Partial<Record<PhaseKey, Phase>>;
  warnings: string[]; // things the parser wasn't sure about
}

/** User adjustments, saved separately so re-importing a PDF keeps them. */
export interface Override {
  include?: boolean;
  focus?: number; // 0..1, vertical position of the face in the photo
  split?: boolean;
  edits?: Partial<Unit>; // any field replaced wholesale (name, phases, …)
}

export const FACTIONS: Record<FactionId, { label: string; accent: string; dark: string; dark2: string; up: string; upbg: string; upline: string; bg: string; count: string }> = {
  terran: { label: 'Terran', accent: '#1d5d9b', dark: '#081220', dark2: '#14202e', up: '#d9822b', upbg: '#fff1e3', upline: '#f1d5b8', bg: '#eff2f5', count: '#ffb366' },
  zerg: { label: 'Zerg', accent: '#6a1f6e', dark: '#120616', dark2: '#2a0f2e', up: '#c98a12', upbg: '#fff6e2', upline: '#ecdcb6', bg: '#f3f1f4', count: '#f0b53a' },
  protoss: { label: 'Protoss', accent: '#8f650b', dark: '#141006', dark2: '#2a2210', up: '#1b8fb0', upbg: '#e7f6fb', upline: '#bfe3ef', bg: '#f4f2ec', count: '#63c3e2' },
};

export const upgradeCount = (u: Pick<Unit, 'phases'>) =>
  Object.values(u.phases).reduce((n, p) => n + (p?.abilities.filter((a) => a.up).length ?? 0) + (p?.weapons.filter((w) => w.up).length ?? 0), 0);
