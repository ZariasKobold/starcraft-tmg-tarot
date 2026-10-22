import { useState } from 'react';
import type { Override, Unit } from '../model';
import type { CheckResult } from '../lib/check';
import type { Entry } from '../App';
import type { Fit } from './Card';
import type { Art } from '../parser/visual';

interface Props {
  entry: Entry;
  unit: Unit; // after corrections + edits
  override: Override;
  check: CheckResult;
  singleFit?: Fit;
  split: boolean;
  minPt: number;
  focus: number;
  hasCustomArt: boolean;
  onChange: (patch: Partial<Override>) => void;
  onReset: () => void;
  onArt: (a: Art | null) => void;
  onRemove: () => void;
  onClose: () => void;
}

// The fields a user may hand-edit as JSON.
const EDITABLE = ['name', 'sub', 'chips', 'unique', 'role', 'slot', 'bar', 'stats', 'supply', 'base', 'tags', 'phases'] as const;
const pick = (u: Unit) => Object.fromEntries(EDITABLE.map((k) => [k, u[k]]));

async function readImage(file: File): Promise<Art> {
  const url = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(file); });
  const img = new Image();
  img.src = url;
  await img.decode();
  return { url, ar: img.naturalHeight / img.naturalWidth };
}

export function Editor({ entry, unit, override, check, singleFit, split, minPt, focus, hasCustomArt, onChange, onReset, onArt, onRemove, onClose }: Props) {
  const [json, setJson] = useState(() => JSON.stringify(pick(unit), null, 2));
  const [jsonErr, setJsonErr] = useState<string | null>(null);
  const [showJson, setShowJson] = useState(false);
  const edits = override.edits ?? {};
  const setEdit = (patch: Partial<Unit>) => onChange({ edits: { ...edits, ...patch } });
  const splitMode = override.split === undefined ? 'auto' : override.split ? 'two' : 'one';
  const clean = !check.added.length && !check.dropped.length && !check.outOfOrder.length;

  return (
    <aside className="editor">
      <div className="edhead">
        <div>
          <h2>{unit.name} {unit.sub && <small>{unit.sub}</small>}</h2>
          <div className="src">{entry.unit.file} · page {entry.unit.page} · v{unit.version}</div>
        </div>
        <button className="x" onClick={onClose} title="Close">✕</button>
      </div>

      <label className="row"><input type="checkbox" checked={override.include !== false} onChange={(e) => onChange({ include: e.target.checked })} /> Include when printing</label>

      <fieldset>
        <legend>Photo</legend>
        <label className="slider">Aim at <input type="range" min={0} max={100} value={Math.round(focus * 100)} onChange={(e) => onChange({ focus: +e.target.value / 100 })} /> <span>{Math.round(focus * 100)}% down</span></label>
        <p className="hint">Drag until a face sits in the banner. 0% is the top of the photo.</p>
        <div className="btnrow">
          <label className="filebtn">Replace photo…<input type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) onArt(await readImage(f)); e.target.value = ''; }} /></label>
          {hasCustomArt && <button onClick={() => onArt(null)}>Use the PDF’s photo</button>}
        </div>
      </fieldset>

      <fieldset>
        <legend>Card count</legend>
        <div className="seg">
          {(['auto', 'one', 'two'] as const).map((m) => (
            <button key={m} className={splitMode === m ? 'on' : ''} onClick={() => onChange({ split: m === 'auto' ? undefined : m === 'two' })}>
              {m === 'auto' ? 'Auto' : m === 'one' ? 'One card' : 'Two cards'}
            </button>
          ))}
        </div>
        <p className="hint">
          {singleFit ? <>On one card the text would be <b>{singleFit.fs.toFixed(1)} pt</b>{singleFit.over ? ' and still overflow' : ''}. </> : null}
          Auto splits anything under {minPt.toFixed(1)} pt. {split ? 'Printing as two cards.' : 'Printing as one card.'}
        </p>
      </fieldset>

      <fieldset>
        <legend>Header</legend>
        <label className="field">Name <input value={unit.name} onChange={(e) => setEdit({ name: e.target.value })} /></label>
        <label className="field">Subtitle <input value={unit.sub ?? ''} placeholder="(Zergling)" onChange={(e) => setEdit({ sub: e.target.value || undefined })} /></label>
        <label className="field">Combat bar
          <select value={unit.bar} onChange={(e) => setEdit({ bar: +e.target.value })}>
            <option value={0}>None (greyed out)</option>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} {n === 1 ? '(close)' : n === 5 ? '(ranged)' : ''}</option>)}
          </select>
        </label>
      </fieldset>

      <fieldset>
        <legend>Source check</legend>
        {clean ? <p className="ok">✓ Every word matches Archon’s sheet (after your corrections).</p> : (
          <div className="diffs">
            {check.added.length > 0 && <p><b>On the card but not the sheet:</b> {check.added.join(', ')}</p>}
            {check.dropped.length > 0 && <p><b>On the sheet but not the card:</b> {check.dropped.join(', ')}</p>}
            {check.outOfOrder.length > 0 && <p><b>Wording differs:</b> {check.outOfOrder.join(', ')}</p>}
          </div>
        )}
        {entry.unit.warnings.length > 0 && <ul className="warns">{entry.unit.warnings.map((w, i) => <li key={i}>⚠ {w}</li>)}</ul>}
      </fieldset>

      <fieldset>
        <legend>Card text</legend>
        <button onClick={() => { setJson(JSON.stringify(pick(unit), null, 2)); setShowJson((s) => !s); }}>{showJson ? 'Hide' : 'Edit everything as JSON'}</button>
        {showJson && (
          <>
            <p className="hint">Markup: <code>**bold**</code>, <code>{'{P} {A} {R}'}</code> for PASSIVE/ACTIVE/REACTION, <code>{'{1 CP}'}</code> for cost chips, <code>\n</code> for a line break. Upgrades have <code>"up": true</code>.</p>
            <textarea value={json} spellCheck={false} onChange={(e) => setJson(e.target.value)} />
            {jsonErr && <p className="err">{jsonErr}</p>}
            <button className="primary" onClick={() => {
              try { setEdit(JSON.parse(json)); setJsonErr(null); } catch (e) { setJsonErr((e as Error).message); }
            }}>Apply</button>
          </>
        )}
      </fieldset>

      <div className="btnrow end">
        <button onClick={onReset} title="Forget every change to this unit">Reset to PDF</button>
        <button className="danger" onClick={() => { if (confirm(`Remove ${unit.name} from the library?`)) onRemove(); }}>Remove</button>
      </div>
    </aside>
  );
}
