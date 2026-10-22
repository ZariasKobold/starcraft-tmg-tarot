// Wait until every face the card uses is actually loaded. document.fonts.ready alone can resolve
// before a face has even been requested, which makes text measurements use fallback metrics.
let ready: Promise<void> | null = null;
export function fontsReady() {
  ready ??= Promise.all([
    ...[400, 500, 600, 700, 800].map((w) => document.fonts.load(`${w} 12px "Saira Semi Condensed"`)),
    ...[500, 700, 750, 800].map((w) => document.fonts.load(`${w} 12px "Noto Sans Variable"`)),
  ]).then(() => document.fonts.ready).then(() => undefined);
  return ready;
}
