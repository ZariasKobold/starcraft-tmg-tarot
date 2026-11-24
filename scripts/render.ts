// Developer tool: load unit files into the running app in headless Edge, then save PNG previews
// and the Letter / A4 / single-card PDFs, without going through a print dialog.
//   npm run dev   (in another terminal)
//   npx tsx scripts/render.ts <out folder> <faction> <file.json|file.pdf> [...more]
//   add --png to save one PNG per card instead of PDFs
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const png = process.argv.includes('--png');
const [out, faction, ...files] = args;
if (!out || !faction || !files.length) { console.error('usage: npx tsx scripts/render.ts <out> <terran|zerg|protoss> <files...> [--png]'); process.exit(1); }
const URL = process.env.TAROT_URL ?? 'http://localhost:5173/';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 3 });
await page.goto(URL);
await page.waitForSelector('input[type=file][multiple]', { state: 'attached' });
await page.setInputFiles('input[type=file][multiple]', files);
await page.waitForFunction((n) => document.querySelectorAll('.units li').length >= n, files.length);
await page.selectOption('.filters select >> nth=0', faction);
const waves = await page.$$eval('.filters select >> nth=1', (s) => [...(s[0] as HTMLSelectElement).options].map((o) => o.value));
const wave = waves.filter((w) => w !== 'all').pop()!;
await page.selectOption('.filters select >> nth=1', wave);
// wait for every card to have fitted its text
await page.waitForFunction(() => document.querySelectorAll('.grid .meta').length > 0 && [...document.querySelectorAll('.grid .meta')].every((m) => m.textContent));
const fac = faction[0].toUpperCase() + faction.slice(1);
const base = `StarCraft-${fac}-Wave${wave}-Unit-Cards-Tarot`;

const report = await page.$$eval('.units li', (lis) => lis.map((li) => li.textContent?.replace(/\s+/g, ' ').trim()));
console.log(report.join('\n'));
const fitsReport = await page.$$eval('.grid .cardwrap', (ws) => ws.map((w) => `${w.querySelector('.card')?.getAttribute('data-key')}: ${w.querySelector('.meta')?.textContent}`));
console.log(fitsReport.join('\n'));

if (png) {
  const cards = await page.$$('.grid .card');
  for (const c of cards) {
    const key = (await c.getAttribute('data-key'))!.replace(/[#]/g, '-');
    await c.screenshot({ path: path.join(out, `${key}.png`), scale: 'device' });
  }
  console.log(`saved ${cards.length} PNGs to ${out}`);
} else {
  await page.evaluate(() => { window.print = () => {}; });
  for (const [btn, name, size] of [['Letter sheets', 'Letter', null], ['A4 sheets', 'A4', null], ['Single cards', 'single-cards', null]] as const) {
    await page.getByRole('button', { name: btn }).click();
    await page.waitForSelector('.printbar');
    await page.waitForFunction(() => document.querySelector('.printbar b')?.textContent?.startsWith('Print dialog'));
    await page.emulateMedia({ media: 'print' });
    const file = path.join(out, `${base}-${name}.pdf`);
    await page.pdf({ path: file, preferCSSPageSize: true, printBackground: true });
    await page.emulateMedia({ media: 'screen' });
    console.log('saved', file, size ?? '');
    await page.getByRole('button', { name: 'Back' }).click();
    await page.waitForSelector('.grid');
  }
}
await browser.close();
