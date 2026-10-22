import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import type { FactionId, Unit } from '../model';
import { pageText } from '../parser/pdf';
import { isUnitPage, parseUnit } from '../parser/parse';
import { extractArt, readBar, type Art } from '../parser/visual';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export interface Loaded { unit: Unit; art: Art | null; plain: string }

function factionOf(name: string, text: string): FactionId | null {
  for (const f of ['terran', 'zerg', 'protoss'] as const) if (new RegExp(f, 'i').test(name) || new RegExp(`${f} FACTION`, 'i').test(text)) return f;
  return null;
}

export async function loadPdf(file: File, onProgress?: (msg: string) => void): Promise<Loaded[]> {
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data, fontExtraProperties: true, verbosity: 0 }).promise;
  const out: Loaded[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    onProgress?.(`${file.name}: page ${p} of ${doc.numPages}`);
    const page = await doc.getPage(p);
    const t = await pageText(page);
    if (!isUnitPage(t)) continue;
    const faction = factionOf(file.name, t.plain);
    if (!faction) throw new Error(`Can't tell which faction ${file.name} is for`);
    const unit = parseUnit(t, { faction, file: file.name, page: p });
    try {
      unit.bar = await readBar(page, t.items, t.H, t.W);
    } catch {
      unit.warnings.push('Could not read the combat bar');
    }
    const art = await extractArt(page).catch(() => null);
    if (!art) unit.warnings.push('No unit photo found');
    out.push({ unit, art, plain: t.plain });
  }
  await doc.loadingTask?.destroy?.();
  return out;
}
