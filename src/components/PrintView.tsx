import { useEffect, useRef, useState } from 'react';
import type { CardSpec } from '../lib/deck';
import type { Art } from '../parser/visual';
import { Card } from './Card';
import { fontsReady } from '../lib/fonts';

export type Layout = 'Letter' | 'A4' | 'single';
const PAPER: Record<Exclude<Layout, 'single'>, [number, number]> = { Letter: [215.9, 279.4], A4: [210, 297] };
const CW = 70, CH = 120, GAP = 6;

interface Props {
  layout: Layout;
  specs: CardSpec[];
  artFor: (key: string) => Art | null;
  focusFor: (key: string) => number;
  pairArt: (s: CardSpec) => number | undefined;
  title: string; // becomes the suggested PDF file name
  label: string;
  onDone: () => void;
}

export function PrintView({ layout, specs, artFor, focusFor, pairArt, title, label, onDone }: Props) {
  const fitted = useRef(new Set<string>());
  const [ready, setReady] = useState(false);
  const printed = useRef(false);
  const [W, H] = layout === 'single' ? [CW, CH] : PAPER[layout];

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `@page{size:${W}mm ${H}mm;margin:0}`;
    document.head.appendChild(style);
    const old = document.title;
    document.title = title;
    document.body.classList.add('printing');
    const after = () => onDone();
    window.addEventListener('afterprint', after);
    return () => { style.remove(); document.title = old; document.body.classList.remove('printing'); window.removeEventListener('afterprint', after); };
  }, [W, H, title, onDone]);

  useEffect(() => {
    if (!ready || printed.current) return;
    printed.current = true;
    (async () => {
      await fontsReady();
      await Promise.all(specs.map((s) => { const a = artFor(s.artId); if (!a) return null; const i = new Image(); i.src = a.url; return i.decode().catch(() => null); }));
      setTimeout(() => window.print(), 150);
    })();
  }, [ready, specs, artFor]);

  const onFit = (key: string) => () => {
    fitted.current.add(key);
    if (fitted.current.size >= specs.length) setReady(true);
  };
  const card = (s: CardSpec) => <Card spec={s} art={artFor(s.artId)} focus={focusFor(s.artId)} maxArt={pairArt(s)} onFit={onFit(s.key)} />;

  let pages: React.ReactNode[];
  if (layout === 'single') {
    pages = specs.map((s) => <div key={s.key} className="ppage" style={{ width: `${CW}mm`, height: `${CH}mm` }}>{card(s)}</div>);
  } else {
    const ox = (W - (2 * CW + GAP)) / 2, oy = (H - (2 * CH + GAP)) / 2;
    const xs = [ox, ox + CW, ox + CW + GAP, ox + 2 * CW + GAP], ys = [oy, oy + CH, oy + CH + GAP, oy + 2 * CH + GAP];
    pages = [];
    for (let i = 0; i < specs.length; i += 4) {
      pages.push(
        <div key={i} className="ppage" style={{ width: `${W}mm`, height: `${H}mm` }}>
          {specs.slice(i, i + 4).map((s, j) => (
            <div key={s.key} className="cell" style={{ left: `${ox + (j % 2) * (CW + GAP)}mm`, top: `${oy + Math.floor(j / 2) * (CH + GAP)}mm` }}>{card(s)}</div>
          ))}
          {xs.map((x, k) => <i key={`v${k}`} className="mark" style={{ left: `${x}mm`, top: `${oy - 6}mm`, height: '4.5mm', borderLeft: '.15mm solid #000' }} />)}
          {xs.map((x, k) => <i key={`w${k}`} className="mark" style={{ left: `${x}mm`, top: `${ys[3] + 1.5}mm`, height: '4.5mm', borderLeft: '.15mm solid #000' }} />)}
          {ys.map((y, k) => <i key={`h${k}`} className="mark" style={{ top: `${y}mm`, left: `${ox - 6}mm`, width: '4.5mm', borderTop: '.15mm solid #000' }} />)}
          {ys.map((y, k) => <i key={`g${k}`} className="mark" style={{ top: `${y}mm`, left: `${xs[3] + 1.5}mm`, width: '4.5mm', borderTop: '.15mm solid #000' }} />)}
          <div className="note">{label} · tarot 70×120 mm · print at 100% / actual size · sheet {i / 4 + 1}</div>
        </div>,
      );
    }
  }

  return (
    <div className="printroot">
      <div className="printbar">
        <b>{ready ? 'Print dialog opened.' : 'Laying out cards…'}</b>
        <span>Choose <b>Save as PDF</b>, margins <b>None</b>, scale <b>100%</b>, and turn on <b>Background graphics</b>.</span>
        <button onClick={() => window.print()} disabled={!ready}>Print again</button>
        <button onClick={onDone}>Back</button>
      </div>
      {pages}
    </div>
  );
}
