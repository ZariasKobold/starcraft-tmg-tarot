// Browser-only: pull the unit photo out of a sheet and read the close/ranged combat bar.
import { OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PDFPageProxy } from 'pdfjs-dist';
import type { Item } from './layout';

export interface Art { url: string; ar: number } // ar = height / width

function getObj(page: PDFPageProxy, id: string): Promise<any> {
  // images shared between pages (the sheet background) live in commonObjs
  const objs = id.startsWith('g_') ? page.commonObjs : page.objs;
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 4000);
    try {
      objs.get(id, (o: unknown) => { clearTimeout(timer); resolve(o); });
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

/** The miniature photo: the largest portrait image on the sheet that isn't the page background. */
export async function extractArt(page: PDFPageProxy): Promise<Art | null> {
  const ops = await page.getOperatorList();
  // the photo is painted twice, once on each half of the fold-over card
  const uses = new Map<string, number>();
  ops.fnArray.forEach((fn, i) => {
    if (fn === OPS.paintImageXObject) uses.set(ops.argsArray[i][0], (uses.get(ops.argsArray[i][0]) ?? 0) + 1);
  });
  let best: { obj: any; score: number } | null = null;
  for (const [id, n] of uses) {
    const obj = await getObj(page, id);
    if (!obj) continue;
    const { width: w, height: h } = obj;
    if (w > 1100 || h / w < 1.15) continue; // skip the page background and square tactical art
    const score = (n >= 2 ? 1e9 : 0) + w * h;
    if (!best || score > best.score) best = { obj, score };
  }
  if (!best) return null;
  const { obj } = best;
  const c = document.createElement('canvas');
  c.width = obj.width;
  c.height = obj.height;
  const ctx = c.getContext('2d')!;
  if (obj.bitmap) ctx.drawImage(obj.bitmap, 0, 0);
  else if (obj.data) {
    const img = ctx.createImageData(obj.width, obj.height);
    const src: Uint8ClampedArray = obj.data;
    const n = obj.width * obj.height;
    const comps = src.length / n; // 3 = RGB, 4 = RGBA, 1 = gray
    for (let p = 0; p < n; p++) {
      const o = p * 4;
      if (comps >= 3) {
        img.data[o] = src[p * comps];
        img.data[o + 1] = src[p * comps + 1];
        img.data[o + 2] = src[p * comps + 2];
      } else img.data[o] = img.data[o + 1] = img.data[o + 2] = src[p];
      img.data[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  } else return null;
  return { url: c.toDataURL('image/jpeg', 0.92), ar: obj.height / obj.width };
}

/**
 * Combat bar: five slanted slots between the CLOSE COMBAT and RANGED COMBAT labels; one is filled white.
 * Returns 1–5, or 0 when the bar is greyed out (summons, structures).
 */
export async function readBar(page: PDFPageProxy, items: Item[], H: number, W: number): Promise<number> {
  const close = items.filter((i) => i.str.trim() === 'CLOSE COMBAT');
  const ranged = items.filter((i) => i.str.trim() === 'RANGED COMBAT');
  if (!close.length) return 0;
  const scale = 2.5;
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(vp.width);
  canvas.height = Math.ceil(vp.height);
  const ctx = canvas.getContext('2d', )!;
  await page.render({ canvasContext: ctx, viewport: vp, canvas } as any).promise;
  const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const lumAt = (x: number, y: number) => {
    const o = (Math.round(y) * canvas.width + Math.round(x)) * 4;
    return 0.299 * px[o] + 0.587 * px[o + 1] + 0.114 * px[o + 2];
  };
  const results: number[][] = [];
  for (const c of close) {
    const r = ranged.find((x) => x.half === c.half && Math.abs(x.y - c.y) < 2);
    if (!r) continue;
    const x0 = c.x, x1 = r.x + r.w, yc = c.y - 12.6;
    const slotW = (x1 - x0) / 5;
    const lum: number[] = [];
    for (let k = 0; k < 5; k++) {
      // share of near-white pixels inside the slot: a filled slot is mostly white, an empty one only has its outline
      const cx = x0 + (k + 0.5) * slotW;
      let bright = 0, n = 0;
      for (let dx = -slotW * 0.3; dx <= slotW * 0.3; dx += 0.35) for (let dy = -1.6; dy <= 1.6; dy += 0.4) {
        const nx = cx + dx, ny = yc + dy;
        const [vx, vy] = c.half === 'up' ? vp.convertToViewportPoint(nx, H - ny) : vp.convertToViewportPoint(W - nx, ny);
        if (lumAt(vx, vy) > 215) bright++;
        n++;
      }
      lum.push(Math.round((100 * bright) / n));
    }
    results.push(lum);
  }
  canvas.width = canvas.height = 0;
  for (const lum of results) {
    const sorted = [...lum].sort((a, b) => b - a);
    if (sorted[0] >= 25 && sorted[0] >= 1.8 * sorted[1]) return lum.indexOf(sorted[0]) + 1;
  }
  return 0;
}
