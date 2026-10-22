# Tarot Forge

Turns Archon's official StarCraft: The Miniatures Game card-sheet PDFs into **single-sided, tarot-size (70 × 120 mm) unit cards**, with every upgrade printed on the front as a checkbox instead of hidden on the back of a fold-over card.

Drop in a PDF like `StarCraft-Terran-P2P-W3-Card-Sheets-A4_EN.pdf`, check the previews, and print Letter or A4 sheets with crop marks, or one card per page for a print shop. Everything runs in your browser: the PDFs are read locally and nothing is uploaded.

## Running it

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
npm run dev
```

Then open the address it prints (usually http://localhost:5173) in Chrome or Edge.

## Using it

1. **Add Archon PDFs.** Click the button or drag the files onto the window; several at once is fine. Each unit sheet becomes a card, and your library is kept in the browser between visits.
2. **Check the cards.** In the sidebar:
   - **✓** means every word on the card matches Archon's sheet (after your corrections).
   - **!** means something differs; click the unit to see what.
   - The number is the text size the unit would get on a single card.
   - **×2** means it's being split across two cards.
3. **Adjust a unit (optional).** Click its card to open the editor. There you can:
   - drag **Aim at** until a face sits in the photo banner;
   - swap in your own photo;
   - force one card or two;
   - fix the name or combat bar;
   - edit any text as JSON.
4. **Print.** Pick a faction and wave in the sidebar (or leave both on "All"), untick anything you don't want, and click **Letter sheets**, **A4 sheets** or **Single cards**. In Chrome's print dialog:
   - choose **Save as PDF**;
   - set Margins to **None** and Scale to **100%**;
   - turn **Background graphics** on.

   The file name is filled in for you, e.g. `StarCraft-Terran-Wave3-Unit-Cards-Tarot-Letter`.

### Corrections

**Corrections** is a find-and-replace list applied to every card. It ships with the fixes already approved for waves 1–2 (Concusive → Concussive, Impassible → Impassable, Riffle → Rifle, Glaves → Glaives, Armored → Armoured, and Zerg `{1 CP}` → `{1 BM}` for Glial Reconstitution). Add your own when Archon slips again; the source check then treats the corrected word as matching.

### Splitting dense cards

A unit is split into "Card 1 of 2" / "Card 2 of 2" when its text would otherwise drop below the threshold at the bottom of the sidebar (6.0 pt by default). The split falls between Movement and Assault unless that would be very lopsided. Lower the threshold to keep more units on one card.

### Backups

**Back up settings** saves your crops, splits, edits, corrections and replacement photos to a JSON file. **Restore…** loads one, which is handy on a new computer or browser. The library itself is rebuilt by adding the PDFs again.

## How it works

| Step | Code |
| --- | --- |
| Read text runs with their fonts and positions; fold both halves of a sheet into one upright coordinate space | `src/parser/layout.ts`, `src/parser/pdf.ts` |
| Find stats, supply, chips, role, base, tags, phase boxes, two-column abilities, weapon tables and upgrade boxes | `src/parser/parse.ts` |
| Pull the miniature photo (the image painted on both halves) and read which combat-bar slot is filled | `src/parser/visual.ts` |
| Apply corrections and edits, decide splits | `src/lib/deck.ts` |
| Word-for-word source check | `src/lib/check.ts` |
| Render a card and shrink text, then the banner, until it fits | `src/components/Card.tsx`, `card.css` |
| Print layouts with crop marks | `src/components/PrintView.tsx` |

Ability text uses a small markup: `**bold**`, `{P}` `{A}` `{R}` for the PASSIVE / ACTIVE / REACTION chips, `{1 CP}` / `{X BM}` / `{0 PE}` for cost chips, and `\n` for a line break.

For debugging a new wave without a browser:

```bash
npm run parse -- "path/to/Official Cards"          # summary of every unit
npm run parse -- path/to/sheet.pdf --json          # full parsed data
```

The parser was built against waves 1–3 (45 unit sheets) and reproduces every approved card apart from the corrections above. If a future wave changes Archon's layout, `npm run parse` is the quickest way to see what broke, and the editor's JSON box gets a card printed in the meantime.

## Legal

This is a fan tool for personal use. StarCraft is ©/™/® Blizzard Entertainment; the card text and miniature photos are © Archon and are **not** included in this repository. You supply Archon's free PDFs yourself. Share printed cards informally, don't sell them, and point people to Archon for the official versions.
