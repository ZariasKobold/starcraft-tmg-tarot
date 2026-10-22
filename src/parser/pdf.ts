// pdf.js access shared by the browser app and the Node test scripts.
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { normalise, type Item, type RawItem } from './layout';

export interface PageText {
  items: Item[];
  W: number;
  H: number;
  plain: string; // raw page text, used by the source check
}

export async function pageText(page: PDFPageProxy): Promise<PageText> {
  const [, , W, H] = page.view;
  await page.getOperatorList(); // makes font objects (and their real names) available
  const tc = await page.getTextContent();
  const raw = tc.items.filter((i): i is (typeof i & RawItem) => 'str' in i) as unknown as RawItem[];
  const fonts: Record<string, string> = {};
  for (const r of raw) {
    if (fonts[r.fontName] !== undefined) continue;
    try {
      fonts[r.fontName] = (page.commonObjs.get(r.fontName) as { name?: string })?.name ?? '';
    } catch {
      fonts[r.fontName] = '';
    }
  }
  // Join runs with a space, except fragments that touch (a word split across two runs, e.g. "Dama" + "ge").
  let plain = '';
  raw.forEach((r, i) => {
    const p = raw[i - 1];
    const touching = p && Math.abs(p.transform[5] - r.transform[5]) < 1 &&
      Math.min(Math.abs(r.transform[4] - (p.transform[4] + p.width)), Math.abs(r.transform[4] - (p.transform[4] - p.width))) < 0.6;
    plain += (i && !touching ? ' ' : '') + r.str;
  });
  return { items: normalise(raw, fonts, W, H), W, H, plain };
}

export async function pages(doc: PDFDocumentProxy) {
  const out: PDFPageProxy[] = [];
  for (let i = 1; i <= doc.numPages; i++) out.push(await doc.getPage(i));
  return out;
}
