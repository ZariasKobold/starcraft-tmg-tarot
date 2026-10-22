// Stage 2: turn the positioned segments of one card sheet into a Unit.
// Layout facts this relies on (true for Archon's P2P sheets, waves 1–3):
//  • the card body (phase boxes) sits at x ≥ 185pt; art, chips, tags and base live left of that
//  • phase boxes start with a black-weight "… PHASE" title; an "UPGRADE" tag on that line marks an upgrade box
//  • abilities start with an extra-bold NAME followed by ":"; two columns split around x ≈ 345pt
//  • weapon tables start with a "NAME RNG Target RoA Hit Surge type S Dice Dmg Keyword" header
import type { Ability, FactionId, Phase, PhaseKey, Stats, Unit, Weapon, WeaponCells } from '../model';
import { segments, text, type Item, type Segment } from './layout';
import type { PageText } from './pdf';

const BODY_X = 165;
const COL_SPLIT = 345;
const BOTTOM = 704;
const PHASE_RE = /^(ANY|MOVEMENT|ASSAULT|COMBAT) PHASE$/;
const PHASE_KEY: Record<string, PhaseKey> = { ANY: 'any', MOVEMENT: 'move', ASSAULT: 'assault', COMBAT: 'combat' };
const COST_RE = /^[0-9X]+ (CP|BM|PE)$/;
const clean = (s: string) => s.replace(/[-⬆↑]/g, '').replace(/\s+/g, ' ').trim();
const isChip = (i: Item) => i.weight === 'black' && i.size < 6.6 && /^(PASSIVE|ACTIVE|REACTION|[0-9X]+ (CP|BM|PE))$/.test(i.str.trim());
const isBold = (i: Item) => i.weight !== 'regular';

export const titleCase = (s: string) =>
  s.split(/(\s+)/).map((w) => (/\d/.test(w) ? w : w.toLowerCase())).join('').replace(/(^|[\s(\-–/])([a-z])/g, (_, p, c) => p + c.toUpperCase()).replace(/'S\b/g, "'s").replace(/’S\b/g, '’s');

export function isUnitPage(t: PageText) {
  return /MODELS \/ SUPPLY/.test(t.plain);
}

export function parseUnit(t: PageText, ctx: { faction: FactionId; file: string; page: number }): Unit {
  const warnings: string[] = [];
  const items = t.items.filter((i) => i.size < 30); // drop watermarks like "WIP"
  // Which half carries the stats ("main" side) and which carries role/slot ("back" side)?
  const halfOf = (re: RegExp) => items.find((i) => re.test(i.str))?.half;
  const main = halfOf(/^ARMOUR$/) ?? 'up';
  const back = main === 'up' ? 'rot' : 'up';
  const M = items.filter((i) => i.half === main);
  const B = items.filter((i) => i.half === back);

  // ---------- title ----------
  const titleLines = segments(M.filter((i) => i.size > 13 && i.size < 14.6 && i.x < 200)).map((s) => clean(text(s)));
  const full = titleLines.join(' ');
  const paren = full.match(/^(.*?)\s*(\([^)]*\))$/);
  let name: string, sub: string | undefined;
  if (paren) [name, sub] = [titleCase(paren[1]), titleCase(paren[2])];
  else if (titleLines.length > 1) [name, sub] = [titleCase(titleLines[0]), `(${titleCase(titleLines.slice(1).join(' '))})`];
  else name = titleCase(full || '?');
  const nameLine = titleLines;
  if (!nameLine.length) warnings.push('Could not find the unit name');

  // ---------- stats ----------
  const LABELS: [RegExp, keyof Stats][] = [[/^SHIELD$/, 'shield'], [/^SPEED/, 'speed'], [/^ARMOUR$/, 'armour'], [/^EVADE$/, 'evade'], [/^HIT POINTS$|^POINTS$/, 'hp'], [/^SIZE$/, 'size']];
  const labelSegs = segments(M.filter((i) => i.size < 5.5 && i.y > 420 && i.y < 470)).flatMap((s) => s.items).filter((i) => i.str.trim());
  // "HIT POINTS" sometimes arrives as two items; merge them
  const labels: { key: keyof Stats; cx: number; y: number }[] = [];
  for (const it of labelSegs) {
    const s = clean(it.str);
    if (s === 'HIT' || s === 'POINTS') {
      if (!labels.find((l) => l.key === 'hp')) labels.push({ key: 'hp', cx: it.x + it.w / 2 + (s === 'HIT' ? 8 : -8), y: it.y });
      continue;
    }
    const m = LABELS.find(([re]) => re.test(s));
    if (m && !labels.find((l) => l.key === m[1])) labels.push({ key: m[1], cx: it.x + (s.startsWith('SPEED') ? 7 : it.w / 2), y: it.y });
  }
  const bigVals = M.filter((i) => i.size >= 13.9 && i.x >= 200 && i.y > 420 && i.y < 470 && i.str.trim());
  const stats: Partial<Stats> = {};
  const used = new Set<Item>();
  for (const l of labels) {
    const cand = bigVals.filter((v) => !/^\d+-\d+$/.test(v.str.trim()) && v.y < l.y + 1 && l.y - v.y < 14);
    // values can be split into several items (e.g. "4", "/", "7"); gather all items under this label
    const mine = cand.filter((v) => Math.abs(v.x + v.w / 2 - l.cx) < 11).sort((a, b) => a.x - b.x);
    mine.forEach((v) => used.add(v));
    stats[l.key] = glyphs(mine) || '?';
  }
  for (const k of ['speed', 'armour', 'evade', 'hp', 'size'] as const) if (!stats[k]) { stats[k] = '?'; warnings.push(`Missing stat: ${k}`); }
  if (/^SPEED\d/.test(labelSegs.map((i) => i.str).join(''))) warnings.push('Speed label merged with value');

  // ---------- supply ----------
  const models = M.filter((i) => /^\d+-\d+$/.test(i.str.trim()) && i.size >= 13.9).sort((a, b) => a.x - b.x);
  const smallNums = M.filter((i) => /^\d+$/.test(i.str.trim()) && i.size > 6.5 && i.size < 8 && i.y > 440 && i.y < 470);
  const supply: [string, string][] = models.map((m) => {
    const cx = m.x + m.w / 2;
    const s = smallNums.filter((n) => n.y > m.y && n.y - m.y < 16).sort((a, b) => Math.abs(a.x + a.w / 2 - cx) - Math.abs(b.x + b.w / 2 - cx))[0];
    if (!s) warnings.push(`No supply value under ${m.str}`);
    return [m.str.trim(), s?.str.trim() ?? '?'];
  });

  // ---------- chips, unique, tags, base, role, slot ----------
  const unique = M.some((i) => i.str.trim() === 'UNIQUE');
  const chipItems = M.filter((i) => i.y > 660 && i.y < 700 && i.x < 200 && i.size >= 7.5 && i.size < 9 && isBold(i) && clean(i.str) && !/MM$|STAND$|^Ø$/.test(clean(i.str)));
  const chipGroups: Item[][] = [];
  for (const it of chipItems.sort((a, b) => a.x - b.x)) {
    const g = chipGroups.find((gr) => gr.some((o) => it.x < o.x + o.w + 2 && o.x < it.x + it.w + 2));
    if (g) g.push(it); else chipGroups.push([it]);
  }
  const chips = chipGroups.map((g) => titleCase(g.sort((a, b) => a.y - b.y || a.x - b.x).map((i) => clean(i.str)).join(' ')));
  if (!chips.length) warnings.push('No faction chip found');

  const segsM = segments(M);
  const tagLbl = segsM.find((s) => /COMBAT TAGS:/.test(text(s)));
  const tagSegs = tagLbl ? segsM.filter((s) => s.y >= tagLbl.y - 0.5 && s.y - tagLbl.y < 16 && s.x < 200 && Math.abs(s.x - tagLbl.x) < 40) : [];
  const tags = titleCase(clean(tagSegs.map(text).join(' ').replace(/COMBAT TAGS:/, '')));
  if (!tags) warnings.push('No combat tags found');

  const all = items;
  const baseSeg = segments(all.filter((i) => i.y > 660 && i.y < 700 && i.x < 200 && i.size >= 7.5 && i.size < 9)).find((s) => /MM$|STAND$/.test(clean(text(s))));
  const base = baseSeg ? clean(text(baseSeg)).replace(/^Ø\s*/, 'Ø').replace(/MM$/, 'mm').replace(/^FLIGHT STAND$/, 'Flight stand') : '';
  if (!base) warnings.push('No base size found');

  const valueUnder = (label: RegExp) => {
    const l = all.find((i) => label.test(i.str));
    if (!l) return undefined;
    const v = segments(all.filter((i) => i.half === l.half && isBold(i) && i.size >= 7.5 && i.size < 9 && i.y > l.y && i.y - l.y < 16 && i.x > l.x - 22 && i.x < l.x + 45));
    return v.length ? titleCase(clean(text(v[0]))) : undefined;
  };
  const role = valueUnder(/COMBAT ROLE:/) ?? '';
  const slot = valueUnder(/ARMY SLOT:/);
  if (!role) warnings.push('No combat role found');

  // ---------- phases ----------
  const phases: Partial<Record<PhaseKey, Phase>> = {};
  for (const half of [M, B]) {
    for (const sec of phaseSections(half)) {
      const p = (phases[sec.key] ??= { weapons: [], abilities: [] });
      const parsed = parseSection(sec.segs, sec.upgrade, warnings);
      p.weapons.push(...parsed.weapons);
      p.abilities.push(...parsed.abilities);
    }
  }

  const version = (t.plain.match(/\d\.\d\d\.\d\d/) ?? [''])[0];
  const id = `${ctx.faction}-${(name + (sub ? ' ' + sub : '')).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
  return {
    id, faction: ctx.faction, file: ctx.file, page: ctx.page, version,
    name, sub, chips, unique, role, slot, bar: 0,
    stats: stats as Stats, supply, base, tags, phases, warnings,
  };
}

/** Join items that may overlap (some values are drawn as "4", "4/", "/8", "8"). */
function glyphs(items: Item[]) {
  const cs: { c: string; x: number }[] = [];
  for (const it of items) {
    const s = it.str.trim();
    [...s].forEach((c, i) => cs.push({ c, x: it.x + (it.w * i) / s.length }));
  }
  cs.sort((a, b) => a.x - b.x);
  return cs.filter((g, i) => !cs.slice(0, i).some((o) => o.c === g.c && Math.abs(o.x - g.x) < 2.5)).map((g) => g.c).join('');
}

// ---------------------------------------------------------------------------

interface Section { key: PhaseKey; upgrade: boolean; segs: Segment[] }

function phaseSections(half: Item[]): Section[] {
  const body = half.filter((i) => i.x >= BODY_X - 12 && i.y < BOTTOM && i.size < 12);
  const heads = body.filter((i) => i.weight === 'black' && PHASE_RE.test(clean(i.str))).sort((a, b) => a.y - b.y);
  const out: Section[] = [];
  heads.forEach((h, k) => {
    const next = heads[k + 1]?.y ?? BOTTOM;
    const inSec = body.filter((i) => i.y > h.y - 1.6 && i.y < next - 1.6);
    // items on the title line: the title itself and an optional UPGRADE tag; anything after them is content
    const onTitle = inSec.filter((i) => Math.abs(i.y - h.y) < 3.5);
    const upgradeTag = onTitle.find((i) => /UPGRADE/.test(i.str));
    const titleEnd = Math.max(h.x + h.w, upgradeTag ? upgradeTag.x + upgradeTag.w : 0);
    const content = inSec.filter((i) => (Math.abs(i.y - h.y) < 3.5 ? i.x > titleEnd + 1 : true) && i !== h && i !== upgradeTag);
    out.push({ key: PHASE_KEY[clean(h.str).split(' ')[0]], upgrade: !!upgradeTag, segs: segments(content.filter((i) => i.x >= BODY_X)) });
  });
  return out;
}

const firstWord = (s: Segment) => s.items.find((i) => i.str.trim());

/** Does this segment start an ability? (an upper-case bold NAME followed by ":") */
const strong = (i: Item) => i.weight === 'xbold' || (i.weight === 'bold' && i.size >= 6.6);
function abilityStart(s: Segment) {
  const f = firstWord(s);
  if (!f || !strong(f)) return false;
  const lead: string[] = [];
  for (const i of s.items) {
    if (strong(i) || i.str.trim() === ':' || !i.str.trim()) lead.push(i.str);
    else break;
  }
  const m = lead.join('').match(/^([^:]*):/);
  return !!m && /^[A-Z0-9 '’!&.\-–]+$/.test(m[1].trim()) && /[A-Z]{2}/.test(m[1]);
}
const nameOnly = (s: Segment) => s.items.every((i) => strong(i) || !i.str.trim()) && !/:/.test(text(s)) && /^[A-Z0-9 '’!&.\-–]+$/.test(text(s));

function isTableHeader(s: Segment) {
  return /^NAME\b/.test(text(s)) || /^RNG\b.*Keyword/i.test(text(s));
}

function parseSection(segs: Segment[], upgrade: boolean, warnings: string[]) {
  const weapons: Weapon[] = [];
  const blocks: { col: 'L' | 'R'; segs: Segment[] }[] = [];
  let cols: { start: number; name: string }[] | null = null;
  let mode: 'abil' | 'table' = 'abil';
  let row: { cells: string[][]; note: string[]; up: boolean } | null = null;
  const flushRow = () => {
    if (!row) return;
    const c = row.cells.map((ws) => ws.join(' ').replace(/\s+/g, ' ').trim()) as WeaponCells;
    while (c.length < 9) c.push('');
    c[0] = titleCase(c[0]);
    const w: Weapon = { c: c.map((x) => x || '-') as WeaponCells };
    if (upgrade) {
      w.up = true;
      const note = clean(row.note.join(' ')).replace(/^[^A-Za-z]+/, '');
      w.note = note ? 'Upgrade ' + titleCase(note).replace(/^For\b/, 'for') : 'Additional weapon';
    }
    weapons.push(w);
    row = null;
  };

  // group segments of the same baseline so a table row is one "line"
  const lines: Segment[][] = [];
  for (const s of segs) {
    const l = lines.find((ln) => Math.abs(ln[0].y - s.y) < 1.6);
    if (l) l.push(s); else lines.push([s]);
  }
  lines.forEach((l) => l.sort((a, b) => a.x - b.x));

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const lineText = line.map(text).join(' ');
    if (line.some(isTableHeader)) {
      flushRow();
      mode = 'table';
      cols = tableColumns(line.flatMap((s) => s.items));
      continue;
    }
    if (mode === 'table' && cols) {
      const words = line.flatMap((s) => s.items).flatMap(splitWords);
      const inCol = (w: { x: number; w: number }) => colIndex(w.x + w.w / 2, cols!);
      const hasRange = words.some((w) => inCol(w) === 1);
      if (line.some(abilityStart)) {
        flushRow();
        mode = 'abil';
      } else {
        const small = hasRange ? [] : words.filter((w) => w.size < 6.6 && inCol(w) === 0);
        if (hasRange) {
          flushRow();
          row = { cells: Array.from({ length: 9 }, () => []), note: [], up: upgrade };
        }
        if (!row) { warnings.push(`Unplaced table text: ${lineText}`); continue; }
        for (const w of words) {
          if (small.includes(w)) row.note.push(w.s);
          else row.cells[inCol(w)].push(w.s);
        }
        continue;
      }
    }
    // ability text
    for (const s of line) {
      const col: 'L' | 'R' = s.x >= COL_SPLIT ? 'R' : 'L';
      const cur = [...blocks].reverse().find((b) => b.col === col);
      const next = lines[li + 1]?.find((n) => (n.x >= COL_SPLIT ? 'R' : 'L') === col);
      if (abilityStart(s) || (nameOnly(s) && next && abilityStart(next) && !cur?.segs.some((x) => x === s))) {
        if (cur && nameOnly(cur.segs[cur.segs.length - 1]) && cur.segs.length === 1) { cur.segs.push(s); continue; }
        blocks.push({ col, segs: [s] });
      } else if (cur) cur.segs.push(s);
      else if (col === 'R' && blocks.length) blocks[blocks.length - 1].segs.push(s); // full-width line that drifted right
      else warnings.push(`Text outside any ability: ${text(s)}`);
    }
  }
  flushRow();

  // reading order: left column, then right column, with full-width blocks acting as row breaks
  const full = (b: { col: string; segs: Segment[] }) => b.col === 'L' && b.segs.some((s) => s.x2 > COL_SPLIT + 12);
  const ordered: typeof blocks = [];
  let band: typeof blocks = [];
  const flushBand = () => { ordered.push(...band.filter((b) => b.col === 'L'), ...band.filter((b) => b.col === 'R')); band = []; };
  for (const b of [...blocks].sort((a, b2) => a.segs[0].y - b2.segs[0].y || a.segs[0].x - b2.segs[0].x)) {
    if (full(b)) { flushBand(); ordered.push(b); } else band.push(b);
  }
  flushBand();

  const abilities: Ability[] = ordered.map((b) => {
    const a = ability(b.segs);
    return upgrade ? { ...a, up: true } : a;
  });
  return { weapons, abilities };
}

interface Word { s: string; x: number; w: number; size: number; bold: boolean }
function splitWords(i: Item): Word[] {
  const out: Word[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  const n = i.str.length || 1;
  while ((m = re.exec(i.str))) {
    out.push({ s: m[0], x: i.x + (i.w * m.index) / n, w: (i.w * m[0].length) / n, size: i.size, bold: i.weight !== 'regular' });
  }
  return out;
}

const HEAD = ['NAME', 'RNG', 'Target', 'RoA', 'Hit', 'Surge', 'S', 'Dmg', 'Keyword'];
function tableColumns(items: Item[]) {
  const words = items.flatMap(splitWords).filter((w) => !['type', 'Dice'].includes(w.s));
  const cols = HEAD.map((h) => {
    const w = words.find((x) => x.s.toLowerCase() === h.toLowerCase());
    return { name: h, start: w ? w.x : NaN };
  });
  // the NAME column hugs the left edge
  if (Number.isNaN(cols[0].start)) cols[0].start = 190;
  return cols;
}
function colIndex(cx: number, cols: { start: number }[]) {
  let k = 0;
  for (let i = 0; i < cols.length; i++) if (!Number.isNaN(cols[i].start) && cols[i].start <= cx + 2) k = i;
  return k;
}

/** Build "NAME: text" markup from an ability block. */
function ability(segs: Segment[]): Ability {
  // text that overflows from the left column continues at the top of the right column
  segs = [...segs.filter((s) => s.x < COL_SPLIT), ...segs.filter((s) => s.x >= COL_SPLIT)];
  const items = segs.flatMap((s, k) => [...(k ? [{ str: '\u0000', x: 0, y: s.y, w: 0, size: 7, font: '', weight: 'regular', half: s.half } as Item] : []), ...s.items]);
  // name = leading extra-bold run up to the first colon
  let nameParts = '';
  let k = 0;
  for (; k < items.length; k++) {
    const it = items[k];
    if (it.str === '\u0000') { nameParts += ' '; continue; }
    if (strong(it) || it.str.trim() === ':' || !it.str.trim()) {
      const idx = it.str.indexOf(':');
      if (idx >= 0) {
        nameParts += it.str.slice(0, idx);
        const rest = it.str.slice(idx + 1);
        items[k] = { ...it, str: rest };
        if (!rest.trim()) k++;
        break;
      }
      nameParts += it.str;
    } else break;
  }
  const n = titleCase(clean(nameParts));
  return { n, t: markup(items.slice(k)) };
}

function markup(items: Item[]): string {
  // tokens: chip | text(bold?) | linebreak marker
  type Tok = { s: string; bold: boolean; chip?: boolean; br?: boolean };
  const toks: Tok[] = [];
  let lineStart = true;
  let prevLineBullet = false;
  let thisLineBullet = false;
  for (const it of items) {
    if (it.str === '\u0000') {
      toks.push({ s: '', bold: false, br: true });
      prevLineBullet = thisLineBullet;
      thisLineBullet = false;
      lineStart = true;
      continue;
    }
    if (lineStart && it.str.trim()) {
      const startsBullet = it.str.trim().startsWith('‣');
      const startsCost = isChip(it) && COST_RE.test(it.str.trim());
      const brk = toks.length && toks[toks.length - 1].br;
      if (brk) toks[toks.length - 1].s = startsBullet || startsCost || prevLineBullet ? '\n' : ' ';
      thisLineBullet = startsBullet;
      lineStart = false;
    }
    if (isChip(it)) {
      const s = it.str.trim();
      toks.push({ s: s === 'PASSIVE' ? '{P}' : s === 'ACTIVE' ? '{A}' : s === 'REACTION' ? '{R}' : `{${s}}`, bold: false, chip: true });
    } else toks.push({ s: it.str, bold: it.weight !== 'regular' && it.size >= 6.6 && !!it.str.trim() });
  }
  // a line break after a hyphenated word joins without a space ("non-" + "Unique")
  for (let i = 0; i < toks.length; i++) {
    if (toks[i].br && toks[i].s === ' ') {
      const prev = toks.slice(0, i).reverse().find((t) => t.s.trim());
      if (prev && /[A-Za-z]-$/.test(prev.s.trimEnd())) toks[i].s = '';
    }
  }
  // merge into markup, folding whitespace between bold runs into the run
  let out = '';
  let open = false;
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    const ws = !t.s.trim() && !t.chip;
    if (ws) {
      const nextBold = toks.slice(i + 1).find((x) => x.s.trim() || x.chip);
      if (open && (!nextBold?.bold || t.s === '\n')) { out += '**'; open = false; }
      out += t.s === '\n' ? '\n' : t.s ? ' ' : '';
      continue;
    }
    if (t.bold && !open) { out += '**'; open = true; }
    if (!t.bold && open) { out += '**'; open = false; }
    out += t.s;
  }
  if (open) out += '**';
  return out
    .replace(/\*\*\*\*/g, '')
    .replace(/\*\*( +)\*\*/g, '$1')
    .replace(/\*\*([^*]+?)\*\*/g, (_, inner: string) => {
      const lead = inner.match(/^\s*/)![0], trail = inner.match(/\s*$/)![0];
      return inner.trim() ? `${lead}**${inner.trim()}**${trail}` : inner;
    })
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .trim();
}
