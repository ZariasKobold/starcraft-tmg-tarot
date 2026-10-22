import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FACTIONS, type FactionId, type Override, type Unit } from './model';
import { DEFAULT_RULES, finalUnit, fixSource, MIN_PT, splitUnit, waveOf, type CardSpec, type Rule } from './lib/deck';
import { checkAgainstSource, isClean, type CheckResult } from './lib/check';
import { loadPdf, type Loaded } from './lib/load';
import * as store from './lib/store';
import { Card, type Fit } from './components/Card';
import { Editor } from './components/Editor';
import { Corrections } from './components/Corrections';
import { PrintView, type Layout } from './components/PrintView';
import type { Art } from './parser/visual';
import './App.css';

export interface Entry extends Loaded { key: string } // key = unit id

const DEFAULT_FOCUS = 0.3;
const sameFit = (a?: Fit, b?: Fit) => JSON.stringify(a) === JSON.stringify(b);

export default function App() {
  const [library, setLibrary] = useState<Entry[]>([]);
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [customArt, setCustomArt] = useState<Record<string, Art>>({});
  const [rules, setRules] = useState<Rule[]>(DEFAULT_RULES);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<{ faction: FactionId | 'all'; wave: string }>({ faction: 'all', wave: 'all' });
  const [fits, setFits] = useState<Record<string, Fit>>({});
  const [singleFits, setSingleFits] = useState<Record<string, Fit>>({});
  const [showRules, setShowRules] = useState(false);
  const [printing, setPrinting] = useState<Layout | null>(null);
  const [drag, setDrag] = useState(false);
  const [minPt, setMinPt] = useState(MIN_PT);
  const fileInput = useRef<HTMLInputElement>(null);

  // ---------- persistence (IndexedDB, so the library survives reloads) ----------
  useEffect(() => {
    (async () => {
      setLibrary((await store.get<Entry[]>('library')) ?? []);
      setOverrides((await store.get<Record<string, Override>>('overrides')) ?? {});
      setCustomArt((await store.get<Record<string, Art>>('customArt')) ?? {});
      setRules((await store.get<Rule[]>('rules')) ?? DEFAULT_RULES);
      setMinPt((await store.get<number>('minPt')) ?? MIN_PT);
      setReady(true);
    })();
  }, []);
  useEffect(() => { if (ready) store.set('library', library); }, [library, ready]);
  useEffect(() => { if (ready) store.set('overrides', overrides); }, [overrides, ready]);
  useEffect(() => { if (ready) store.set('customArt', customArt); }, [customArt, ready]);
  useEffect(() => { if (ready) store.set('rules', rules); }, [rules, ready]);
  useEffect(() => { if (ready) store.set('minPt', minPt); }, [minPt, ready]);

  // ---------- loading PDFs ----------
  const addFiles = useCallback(async (files: FileList | File[]) => {
    setError(null);
    const list = [...files].filter((f) => f.name.toLowerCase().endsWith('.pdf'));
    if (!list.length) return;
    try {
      const added: Entry[] = [];
      for (const f of list) {
        const got = await loadPdf(f, setBusy);
        if (!got.length) throw new Error(`${f.name} has no unit cards in it.`);
        added.push(...got.map((g) => ({ ...g, key: g.unit.id })));
      }
      setLibrary((lib) => {
        const keys = new Set(added.map((a) => a.key));
        return [...lib.filter((e) => !keys.has(e.key)), ...added];
      });
      setView({ faction: list.length === 1 ? added[0].unit.faction : 'all', wave: waveOf(list[0].name) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, []);

  // ---------- derived deck ----------
  const units = useMemo(() => library.map((e) => ({ e, u: finalUnit(e.unit, overrides[e.key], rules) })), [library, overrides, rules]);
  const inView = (e: Entry) => (view.faction === 'all' || e.unit.faction === view.faction) && (view.wave === 'all' || waveOf(e.unit.file) === view.wave);
  const visibleUnits = units.filter(({ e }) => inView(e));
  const shouldSplit = (key: string) => {
    const o = overrides[key]?.split;
    if (o !== undefined) return o;
    const f = singleFits[key];
    return !!f && (f.over || f.fs < minPt - 0.001);
  };
  const specsFor = (u: Unit): CardSpec[] => (shouldSplit(u.id) ? splitUnit(u) : [{ key: u.id, unit: u, artId: u.id }]);
  const artFor = (key: string) => customArt[key] ?? library.find((e) => e.key === key)?.art ?? null;
  const focusFor = (key: string) => overrides[key]?.focus ?? DEFAULT_FOCUS;
  const pairArt = (spec: CardSpec) => {
    if (!spec.part) return undefined;
    const arts = [1, 2].map((i) => fits[`${spec.artId}#${i}`]?.art).filter((x): x is number => x !== undefined);
    return arts.length === 2 ? Math.min(...arts) : undefined;
  };
  const checks = useMemo(() => {
    const r: Record<string, CheckResult> = {};
    for (const { e, u } of units) r[e.key] = checkAgainstSource(u, fixSource(e.plain, u.faction, rules));
    return r;
  }, [units, rules]);

  const setOverride = (key: string, patch: Partial<Override>) => setOverrides((o) => ({ ...o, [key]: { ...o[key], ...patch } }));
  const removeEntry = (key: string) => { setLibrary((l) => l.filter((e) => e.key !== key)); setSelected(null); };

  const factions = [...new Set(library.map((e) => e.unit.faction))];
  const waves = [...new Set(library.filter((e) => view.faction === 'all' || e.unit.faction === view.faction).map((e) => waveOf(e.unit.file)))].sort();
  const printSpecs = visibleUnits.filter(({ e }) => overrides[e.key]?.include !== false).flatMap(({ u }) => specsFor(u));
  const sel = units.find(({ e }) => e.key === selected);
  const measuring = units.some(({ e }) => !singleFits[e.key]);

  const printTitle = () => {
    const fac = view.faction === 'all' ? 'All' : FACTIONS[view.faction].label;
    const wave = view.wave === 'all' ? '' : `-Wave${view.wave}`;
    return `StarCraft-${fac}${wave}-Unit-Cards-Tarot`;
  };

  if (printing) {
    return <PrintView layout={printing} specs={printSpecs} artFor={artFor} focusFor={focusFor} pairArt={pairArt}
      title={`${printTitle()}-${printing === 'single' ? 'single-cards' : printing}`} label={printTitle().replace(/-/g, ' ')} onDone={() => setPrinting(null)} />;
  }

  return (
    <div className="app"
      onDragOver={(ev) => { ev.preventDefault(); setDrag(true); }}
      onDragLeave={(ev) => { if (!ev.relatedTarget) setDrag(false); }}
      onDrop={(ev) => { ev.preventDefault(); setDrag(false); addFiles(ev.dataTransfer.files); }}>
      <header className="top">
        <div className="brand"><span className="logo">◆</span> Tarot Forge <small>StarCraft TMG unit cards → 70 × 120 mm</small></div>
        <div className="actions">
          <button className="primary" onClick={() => fileInput.current?.click()}>Add Archon PDFs</button>
          <input ref={fileInput} type="file" accept="application/pdf" multiple hidden onChange={(ev) => { if (ev.target.files) addFiles([...ev.target.files]); ev.target.value = ''; }} />
          <button onClick={() => setShowRules(true)}>Corrections ({rules.length})</button>
          <div className="printgroup">
            <span>Print {printSpecs.length} card{printSpecs.length === 1 ? '' : 's'}</span>
            {(['Letter', 'A4', 'single'] as Layout[]).map((l) => (
              <button key={l} disabled={!printSpecs.length || measuring} onClick={() => setPrinting(l)}>{l === 'single' ? 'Single cards' : `${l} sheets`}</button>
            ))}
          </div>
        </div>
      </header>
      {busy && <div className="banner busy">Reading {busy}…</div>}
      {error && <div className="banner err">{error} <button onClick={() => setError(null)}>Dismiss</button></div>}

      {!library.length ? (
        ready && (
          <div className="empty" onClick={() => fileInput.current?.click()}>
            <div className="drop">
              <h1>Drop Archon card-sheet PDFs here</h1>
              <p>For example <code>StarCraft-Terran-P2P-W3-Card-Sheets-A4_EN.pdf</code>. Several at once is fine.</p>
              <p className="muted">The PDFs are read in this browser; nothing is uploaded anywhere.</p>
            </div>
          </div>
        )
      ) : (
        <div className={`main${sel ? ' with-editor' : ''}`}>
          <nav className="side">
            <div className="filters">
              <select value={view.faction} onChange={(e) => setView({ faction: e.target.value as FactionId | 'all', wave: 'all' })}>
                <option value="all">All factions</option>
                {factions.map((f) => <option key={f} value={f}>{FACTIONS[f].label}</option>)}
              </select>
              <select value={view.wave} onChange={(e) => setView((v) => ({ ...v, wave: e.target.value }))}>
                <option value="all">All waves</option>
                {waves.map((w) => <option key={w} value={w}>Wave {w}</option>)}
              </select>
            </div>
            <ul className="units">
              {visibleUnits.map(({ e, u }) => {
                const inc = overrides[e.key]?.include !== false;
                const ok = isClean(checks[e.key]);
                const sf = singleFits[e.key];
                return (
                  <li key={e.key} className={`${selected === e.key ? 'sel' : ''}${inc ? '' : ' off'}`} onClick={() => setSelected(e.key)}>
                    <input type="checkbox" checked={inc} onClick={(ev) => ev.stopPropagation()} onChange={(ev) => setOverride(e.key, { include: ev.target.checked })} title="Include when printing" />
                    <span className="dot" style={{ background: FACTIONS[u.faction].accent }} />
                    <span className="nm">{u.name}{u.sub ? <small> {u.sub}</small> : null}</span>
                    {shouldSplit(e.key) && <span className="tag" title="Printed as two cards">×2</span>}
                    {sf && <span className="pt" title="Text size if it were one card">{sf.fs.toFixed(1)}</span>}
                    <span className={`chk ${ok ? 'ok' : 'warn'}`} title={ok ? 'Matches the source sheet word for word' : 'Differs from the source sheet; open it to see how'}>{ok ? '✓' : '!'}</span>
                    {e.unit.warnings.length > 0 && <span className="chk warn" title={e.unit.warnings.join('\n')}>⚠</span>}
                  </li>
                );
              })}
            </ul>
            <div className="sidefoot">
              <label>Split into two cards below <input type="number" min={4.6} max={6.6} step={0.1} value={minPt} onChange={(e) => setMinPt(+e.target.value || MIN_PT)} /> pt</label>
              <div className="btnrow">
                <button onClick={() => {
                  const blob = new Blob([JSON.stringify({ version: 1, overrides, rules, minPt, customArt })], { type: 'application/json' });
                  const a = document.createElement('a');
                  a.href = URL.createObjectURL(blob);
                  a.download = 'tarot-forge-settings.json';
                  a.click();
                  URL.revokeObjectURL(a.href);
                }}>Back up settings</button>
                <label className="filebtn">Restore…<input type="file" accept="application/json" hidden onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  try {
                    const d = JSON.parse(await f.text());
                    if (d.overrides) setOverrides(d.overrides);
                    if (d.rules) setRules(d.rules);
                    if (d.minPt) setMinPt(d.minPt);
                    if (d.customArt) setCustomArt(d.customArt);
                  } catch { setError('That file isn’t a Tarot Forge settings backup.'); }
                }} /></label>
              </div>
              <p className="hint">Tick = include when printing. ✓ = every word matches Archon’s sheet. The number is the text size the unit would get on one card.</p>
            </div>
          </nav>

          <section className="grid">
            {visibleUnits.flatMap(({ e, u }) => specsFor(u).map((spec) => (
              <div key={spec.key} className={`cardwrap${selected === e.key ? ' sel' : ''}${overrides[e.key]?.include === false ? ' off' : ''}`} onClick={() => setSelected(e.key)}>
                <Card spec={spec} art={artFor(e.key)} focus={focusFor(e.key)} maxArt={pairArt(spec)}
                  onFit={(f) => setFits((x) => (sameFit(x[spec.key], f) ? x : { ...x, [spec.key]: f }))} />
                <div className="meta">{fits[spec.key] ? `${fits[spec.key].fs.toFixed(1)} pt text` : ''}{fits[spec.key]?.over && <b> · overflows</b>}</div>
              </div>
            )))}
          </section>

          {sel && (
            <Editor key={sel.e.key} entry={sel.e} unit={sel.u} override={overrides[sel.e.key] ?? {}} check={checks[sel.e.key]}
              singleFit={singleFits[sel.e.key]} split={shouldSplit(sel.e.key)} minPt={minPt} focus={focusFor(sel.e.key)} hasCustomArt={!!customArt[sel.e.key]}
              onChange={(patch) => setOverride(sel.e.key, patch)}
              onReset={() => setOverrides((o) => { const n = { ...o }; delete n[sel.e.key]; return n; })}
              onArt={(a) => setCustomArt((c) => { const n = { ...c }; if (a) n[sel.e.key] = a; else delete n[sel.e.key]; return n; })}
              onRemove={() => removeEntry(sel.e.key)} onClose={() => setSelected(null)} />
          )}
        </div>
      )}

      {/* off-screen: every unit laid out as one card, to decide which ones need splitting */}
      <div className="measure" aria-hidden>
        {units.map(({ e, u }) => (
          <Card key={e.key} spec={{ key: e.key, unit: u, artId: e.key }} focus={0.3}
            onFit={(f) => setSingleFits((x) => (sameFit(x[e.key], f) ? x : { ...x, [e.key]: f }))} />
        ))}
      </div>

      {showRules && <Corrections rules={rules} onChange={setRules} onClose={() => setShowRules(false)} onDefaults={() => setRules(DEFAULT_RULES)} />}
      {drag && <div className="dropveil">Drop PDFs to add them</div>}
    </div>
  );
}
