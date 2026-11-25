import { useEffect, useMemo, useState } from 'react';
import { FACTIONS, type FactionId, type Unit } from '../model';
import { DATA_DISC, ddFile, ddIdOf, fetchDataDisc, fromDataDisc, type DDUnit } from '../lib/datadisc';
import { waveOf } from '../lib/deck';

interface Props {
  library: Unit[];
  onAdd: (got: { unit: Unit; plain: string }[]) => void;
  onClose: () => void;
}

const norm = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');

/** Pick units from the SCTMG Data Disc API, for waves Archon hasn't published card sheets for. */
export function DataDisc({ library, onAdd, onClose }: Props) {
  const [units, setUnits] = useState<DDUnit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [race, setRace] = useState<FactionId | 'all'>('all');
  const [newOnly, setNewOnly] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  // default to the wave after the newest card sheet you've loaded
  const sheetWaves = library.filter((u) => !ddIdOf(u.file)).map((u) => +waveOf(u.file));
  const nextWave = sheetWaves.length ? String(Math.max(...sheetWaves) + 1) : String(Math.max(1, ...library.map((u) => +waveOf(u.file))));
  const [wave, setWave] = useState(nextWave);

  useEffect(() => { fetchDataDisc().then(setUnits, (e) => setError(e instanceof Error ? e.message : String(e))); }, []);

  // what each Data Disc unit already is in the library: a card-sheet card, or an earlier Data Disc import
  const have = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of library) {
      const dd = ddIdOf(u.file);
      if (dd) m.set(dd, `added from the Data Disc as Wave ${waveOf(u.file)}`);
      else m.set('name:' + u.faction + norm(u.name), `on a Wave ${waveOf(u.file)} card sheet`);
    }
    return (d: DDUnit) => m.get(d.id) ?? m.get('name:' + d.race + norm(d.name));
  }, [library]);

  const shown = (units ?? []).filter((d) => (race === 'all' || d.race === race) && (!newOnly || !have(d)));
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOn = shown.length > 0 && shown.every((d) => picked.has(d.id));

  const add = () => {
    const got = (units ?? []).filter((d) => picked.has(d.id)).map((d) => fromDataDisc(d, ddFile(d, wave || '0')));
    onAdd(got);
    onClose();
  };

  return (
    <div className="modal" onClick={onClose}>
      <div className="sheet dd" onClick={(e) => e.stopPropagation()}>
        <div className="edhead"><h2>Add from the Data Disc</h2><button className="x" onClick={onClose}>✕</button></div>
        <p className="hint">For units Archon hasn’t published card sheets for yet. They come from the <a href={DATA_DISC + 'units.json'} target="_blank" rel="noreferrer">SCTMG Data Disc</a>, which has no unit photos, so add one with <b>Replace photo</b>.</p>
        <div className="ddbar">
          <select value={race} onChange={(e) => setRace(e.target.value as FactionId | 'all')}>
            <option value="all">All races</option>
            {(Object.keys(FACTIONS) as FactionId[]).map((f) => <option key={f} value={f}>{FACTIONS[f].label}</option>)}
          </select>
          <label><input type="checkbox" checked={newOnly} onChange={(e) => setNewOnly(e.target.checked)} /> Only units I don’t have</label>
          <label>File as Wave <input className="wave" value={wave} onChange={(e) => setWave(e.target.value.replace(/\D/g, ''))} /></label>
        </div>
        {error ? <div className="banner err">Couldn’t reach the Data Disc: {error}</div> : !units ? <p className="muted">Loading units…</p> : (
          <ul className="ddlist">
            <li className="all"><label><input type="checkbox" checked={allOn} onChange={() => setPicked((p) => { const n = new Set(p); for (const d of shown) if (allOn) n.delete(d.id); else n.add(d.id); return n; })} /> <b>{allOn ? 'Clear' : 'Select'} all {shown.length}</b></label></li>
            {shown.map((d) => (
              <li key={d.id}>
                <label>
                  <input type="checkbox" checked={picked.has(d.id)} onChange={() => toggle(d.id)} />
                  <span className="dot" style={{ background: FACTIONS[d.race].accent }} />
                  {d.name}
                  {have(d) && <small className="muted"> · {have(d)}</small>}
                </label>
              </li>
            ))}
            {!shown.length && <li className="muted">Nothing new here. Untick “Only units I don’t have” to see everything.</li>}
          </ul>
        )}
        <div className="btnrow end">
          <span className="muted">{picked.size} selected</span>
          <button className="primary" disabled={!picked.size || !wave} onClick={add}>Add {picked.size || ''} unit{picked.size === 1 ? '' : 's'}</button>
        </div>
      </div>
    </div>
  );
}
