// Stage 1: turn pdf.js text items into positioned, styled text segments.
// Each card sheet holds one fold-over card: one half printed upright, the other rotated 180°.
// We normalise both halves into the same top-down coordinate space so one set of
// layout rules covers both.

export type Weight = 'regular' | 'bold' | 'xbold' | 'black';

export interface Item {
  str: string;
  x: number; // left edge, normalised (pt)
  y: number; // baseline, top-down (pt)
  w: number;
  size: number;
  font: string;
  weight: Weight;
  half: 'up' | 'rot';
}

export interface Segment {
  items: Item[];
  x: number;
  x2: number;
  y: number;
  half: 'up' | 'rot';
}

export interface RawItem {
  str: string;
  transform: number[];
  width: number;
  fontName: string;
}

export function weightOf(font: string): Weight {
  if (/Black/i.test(font)) return 'black';
  if (/ExtraBold|Heavy/i.test(font)) return 'xbold';
  if (/Bold|Semi/i.test(font)) return 'bold';
  return 'regular';
}

export function normalise(raw: RawItem[], fonts: Record<string, string>, W: number, H: number): Item[] {
  const out: Item[] = [];
  for (const r of raw) {
    if (!r.str) continue;
    const [a, , , d, e, f] = r.transform;
    if (Math.abs(a) < 0.01 && Math.abs(d) < 0.01) continue; // vertical text (fold marks etc.)
    const rot = a < 0;
    const size = Math.abs(d);
    const font = fonts[r.fontName] ?? '';
    out.push({
      str: r.str,
      x: rot ? W - e : e,
      y: rot ? f : H - f,
      w: r.width,
      size,
      font,
      weight: weightOf(font),
      half: rot ? 'rot' : 'up',
    });
  }
  // Some labels are drawn twice, slightly offset (fill + outline). Keep the first copy.
  return out.filter((it, i) => !it.str.trim() || !out.some((o, j) => j < i && o.str === it.str && o.half === it.half && Math.abs(o.x - it.x) < Math.max(1.5, it.size * 0.25) && Math.abs(o.y - it.y) < Math.max(1.5, it.size * 0.25)));
}

/** Group items into horizontal segments: same baseline, no big horizontal gap. */
export function segments(items: Item[], gap = 9): Segment[] {
  const byLine: Item[][] = [];
  const sorted = [...items].sort((p, q) => p.y - q.y || p.x - q.x);
  for (const it of sorted) {
    const line = byLine.find((l) => l[0].half === it.half && Math.abs(l[0].y - it.y) < 1.6);
    if (line) line.push(it);
    else byLine.push([it]);
  }
  const segs: Segment[] = [];
  for (const line of byLine) {
    line.sort((p, q) => p.x - q.x);
    let cur: Item[] = [];
    let end = -1e9;
    for (const it of line) {
      if (cur.length && it.x - end > gap && it.str.trim()) {
        segs.push(mk(cur));
        cur = [];
      }
      cur.push(it);
      end = Math.max(end, it.x + it.w);
    }
    if (cur.length) segs.push(mk(cur));
  }
  return segs
    .map((s) => ({ ...s, items: trimItems(s.items) }))
    .filter((s) => s.items.length)
    .sort((p, q) => p.y - q.y || p.x - q.x);
}

function trimItems(items: Item[]) {
  let a = 0, b = items.length;
  while (a < b && !items[a].str.trim()) a++;
  while (b > a && !items[b - 1].str.trim()) b--;
  return items.slice(a, b);
}

function mk(items: Item[]): Segment {
  const t = trimItems(items);
  const x = t.length ? t[0].x : items[0].x;
  const x2 = Math.max(...items.map((i) => i.x + i.w));
  return { items, x, x2, y: items[0].y, half: items[0].half };
}

export const text = (s: Segment | Item[]) => ('items' in s ? s.items : s).map((i) => i.str).join('').replace(/\s+/g, ' ').trim();
