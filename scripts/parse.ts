// Developer tool: parse Archon card-sheet PDFs in Node and print what the app would read.
//   npx tsx scripts/parse.ts path/to/folder-or.pdf [--json]
// (Photos and combat bars need a browser, so they're skipped here.)
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';
import path from 'path';
import { pageText } from '../src/parser/pdf';
import { isUnitPage, parseUnit } from '../src/parser/parse';
import type { FactionId, Unit } from '../src/model';

const arg = process.argv[2];
if (!arg) { console.error('usage: npx tsx scripts/parse.ts <folder or pdf> [--json]'); process.exit(1); }
const files = fs.statSync(arg).isDirectory() ? fs.readdirSync(arg).filter((f) => f.toLowerCase().endsWith('.pdf')).map((f) => path.join(arg, f)) : [arg];
const all: Unit[] = [];
for (const f of files.sort()) {
  const name = path.basename(f);
  const faction = (['terran', 'zerg', 'protoss'] as FactionId[]).find((x) => new RegExp(x, 'i').test(name));
  if (!faction) { console.error(`skipping ${name}: no faction in the file name`); continue; }
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(f)), verbosity: 0, fontExtraProperties: true }).promise;
  for (let p = 1; p <= doc.numPages; p++) {
    const t = await pageText((await doc.getPage(p)) as never);
    if (isUnitPage(t)) all.push(parseUnit(t, { faction, file: name, page: p }));
  }
}
if (process.argv.includes('--json')) console.log(JSON.stringify(all, null, 2));
else for (const u of all) {
  console.log(`${u.file} p${u.page}  ${u.name}${u.sub ? ' ' + u.sub : ''}  ${JSON.stringify(u.stats)}  ${u.role}/${u.slot ?? '-'}  ${u.base}`);
  for (const [k, p] of Object.entries(u.phases)) console.log(`   ${k}: ${p!.weapons.map((w) => (w.up ? '☐' : '') + w.c[0]).join(', ')}${p!.weapons.length ? ' | ' : ''}${p!.abilities.map((a) => (a.up ? '☐' : '') + a.n).join(', ')}`);
  if (u.warnings.length) console.log('   ⚠ ' + u.warnings.join('; '));
}
