import { useLayoutEffect, useRef } from 'react';
import { FACTIONS, PHASES, upgradeCount, type Ability, type Phase, type Weapon } from '../model';
import type { CardSpec } from '../lib/deck';
import type { Art } from '../parser/visual';
import { fontsReady } from '../lib/fonts';
import { ART_MIN, rich, type Fit } from '../lib/cardtext';
export type { Fit };
import './card.css';


const dash = (c: string) => (c === '-' || !c ? '–' : c);
const Box = () => <span className="ck" />;

function AbilityRow({ a }: { a: Ability }) {
  return (
    <div className={`ab${a.up ? ' up' : ''}`}>
      {a.up && <span className="uptag"><Box />UPGRADE</span>}
      <b className="an">{a.n.toUpperCase()}:</b> <span dangerouslySetInnerHTML={{ __html: rich(a.t) }} />
    </div>
  );
}

/** An upgrade that modifies the weapon right above it is drawn as an indented "↳" row instead of carrying a caption. */
const target = (note?: string) => note?.match(/^Upgrade for (.+)$/i)?.[1].toLowerCase();
function Weapons({ ws }: { ws: Weapon[] }) {
  const arrowed = ws.map((w, i) => {
    const t = target(w.note);
    if (!w.up || !t) return false;
    for (let j = i - 1; j >= 0; j--) {
      if (ws[j].c[0].toLowerCase() === t) return true;
      if (!(ws[j].up && target(ws[j].note) === t)) return false; // allow siblings upgrading the same weapon
    }
    return false;
  });
  return (
    <table className="wt">
      <thead><tr><th className="wn">Weapon</th><th>Rng</th><th>Target</th><th>RoA</th><th>Hit</th><th>Surge</th><th>S Dice</th><th>Dmg</th><th className="kwc">Keyword</th></tr></thead>
      <tbody>
        {ws.map((w, i) => (
          <tr key={i} className={w.up ? 'up' : ''}>
            <td className="wn">{arrowed[i] && <span className="arrow">↳</span>}{w.up && <Box />}{w.c[0].length <= 13 ? w.c[0].toUpperCase().replace(/ /g, '\u00a0') : w.c[0].toUpperCase()}{w.up && w.note && !arrowed[i] && <span className="wnote">{w.note}</span>}</td>
            {w.c.slice(1, 8).map((c, j) => <td key={j}>{dash(c).split(', ').flatMap((x, k) => (k ? [<br key={k} />, x] : [x]))}</td>)}
            <td className="kwc">{dash(w.c[8])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PhaseBox({ label, p }: { label: string; p: Phase }) {
  return (
    <section className="ph">
      <h3>{label}</h3>
      {p.weapons.length > 0 && <Weapons ws={p.weapons} />}
      {p.abilities.map((a, i) => <AbilityRow key={i} a={a} />)}
    </section>
  );
}

const SWORD = <svg className="ic" viewBox="0 0 24 24"><path d="M20.5 2.5 L22 2 L21.5 3.5 L10 15 L9 14 Z" fill="#fff" /><path d="M6.5 13.5 L10.5 17.5 L9.3 18.7 L8.2 17.6 L4.4 21.4 Q3.4 22.2 2.6 21.4 Q1.8 20.6 2.6 19.6 L6.4 15.8 L5.3 14.7 Z" fill="#fff" /></svg>;
const TARGET = <svg className="ic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.2" fill="none" stroke="#fff" strokeWidth="2.2" /><circle cx="12" cy="12" r="5" fill="none" stroke="#fff" strokeWidth="2.2" /><circle cx="12" cy="12" r="1.8" fill="#fff" /></svg>;
function Bar({ n }: { n: number }) {
  return (
    <div className={`bar${n ? '' : ' none'}`}>
      {SWORD}
      <svg className="sl5" viewBox="0 0 57 10">
        {[0, 1, 2, 3, 4].map((i) => { const x = 1 + i * 11; return <polygon key={i} points={`${x + 3},1 ${x + 11},1 ${x + 8},9 ${x},9`} className={i + 1 === n ? 'on' : ''} />; })}
      </svg>
      {TARGET}
    </div>
  );
}

interface Props {
  spec: CardSpec;
  art?: Art | null;
  focus: number; // 0..1
  /** Fixed sizing (print). Without it the card fits itself and reports through onFit. */
  fit?: Fit;
  maxArt?: number; // cap the banner height (keeps both halves of a split card matching)
  onFit?: (f: Fit) => void;
}

export function Card({ spec, art, focus, fit, maxArt, onFit }: Props) {
  const u = spec.unit;
  const ref = useRef<HTMLElement>(null);
  const t = FACTIONS[u.faction];
  const nUp = upgradeCount(u);
  const sub = [u.sub, spec.part && `(${spec.part})`].filter(Boolean).join(' ');
  const st = u.stats;

  // fit text: shrink type to 6.2pt, then the photo banner, then type again
  useLayoutEffect(() => {
    const c = ref.current;
    if (!c) return;
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      const body = c.querySelector('.body') as HTMLElement, fitEl = c.querySelector('.fit') as HTMLElement;
      const h2 = c.querySelector('h2') as HTMLElement, hrow = c.querySelector('.hrow') as HTMLElement, hr = c.querySelector('.hr') as HTMLElement;
      const apply = (f: Fit) => { c.style.setProperty('--fs', f.fs + 'pt'); c.style.setProperty('--art', f.art + 'mm'); c.style.setProperty('--nm', f.nm + 'pt'); };
      if (fit) { apply(fit); return; }
      const over = () => fitEl.scrollHeight > body.clientHeight - 1;
      const f: Fit = { fs: 6.6, art: Math.min(30, maxArt ?? 30), nm: 13, over: false };
      apply(f);
      while (h2.scrollWidth + hr.offsetWidth + 6 > hrow.clientWidth && f.nm > 9) { f.nm -= 0.5; apply(f); }
      while (over() && f.fs > 6.2) { f.fs = +(f.fs - 0.1).toFixed(1); apply(f); }
      while (over() && f.art > ART_MIN) { f.art -= 1; apply(f); }
      while (over() && f.fs > 4.6) { f.fs = +(f.fs - 0.1).toFixed(1); apply(f); }
      f.over = over();
      onFit?.(f);
    };
    fontsReady().then(run);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(u), spec.part, fit?.fs, fit?.art, fit?.nm, maxArt]);

  // aim the photo so the chosen point (usually a face) sits mid-banner
  useLayoutEffect(() => {
    const c = ref.current;
    if (!c || !art) return;
    const a = c.querySelector('.art') as HTMLElement;
    const W = a.clientWidth, h = a.clientHeight, H = W * art.ar;
    const bp = Math.max(0, Math.min(100, ((focus * H - h / 2) / (H - h)) * 100));
    a.style.backgroundPosition = `50% ${bp}%`;
  });

  const vars = { '--ac': t.accent, '--dk': t.dark, '--dk2': t.dark2, '--up': t.up, '--upbg': t.upbg, '--upline': t.upline, '--bg': t.bg, '--count': t.count } as React.CSSProperties;
  const stat = (v: string | undefined, l: string) => <div className="st"><div className="sv">{v === '-' ? '–' : v}</div><div className="sl">{l}</div></div>;
  const n = u.supply.length;

  return (
    <article className="card" ref={ref} style={vars} data-key={spec.key}>
      <div className="art" style={art ? { backgroundImage: `url(${art.url})` } : undefined}>
        <div className="chips">{u.chips.map((c) => <span key={c}>{c.toUpperCase()}</span>)}{u.unique && <span className="uq">UNIQUE</span>}</div>
        {u.base && <div className="basech">{u.base.toUpperCase()}</div>}
        <div className="hrow">
          <h2>{u.name.toUpperCase()}{sub && <small>{sub.toUpperCase()}</small>}</h2>
          <div className="hr">
            <Bar n={u.bar} />
            <div className="role">{u.role && <span className="rv">{u.role.toUpperCase()}</span>}{u.slot && <span className="slot">{u.slot.toUpperCase()}</span>}</div>
          </div>
        </div>
      </div>
      <div className="statband">
        {st.shield && stat(st.shield, 'SH')}{stat(st.speed, 'SP')}{stat(st.armour, 'AR')}{stat(st.evade, 'EV')}{stat(st.hp, 'HP')}{stat(st.size, 'SZ')}
        <div className="sprow">
          {u.supply.map(([m, s], i) => <div key={i} className="sp" style={{ '--k': n === 1 ? 1 : i / (n - 1) } as React.CSSProperties}><div className="sm">{m}</div><div className="ss">{s}</div></div>)}
        </div>
      </div>
      <div className="body"><div className="fit">{PHASES.map(([k, l]) => u.phases[k] && <PhaseBox key={k} label={l} p={u.phases[k]!} />)}</div></div>
      <footer><div className="tags"><span>Tags</span> {u.tags.toUpperCase()}</div>{nUp > 0 && <div className="upcount">{nUp} upgrade{nUp > 1 ? 's' : ''}</div>}</footer>
      <div className="legal">© 2026 Blizzard Entertainment, Inc. · © 2026 Archon · v{u.version} · personal reprint layout</div>
    </article>
  );
}
