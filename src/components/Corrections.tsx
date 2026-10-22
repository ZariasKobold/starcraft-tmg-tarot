import { FACTIONS, type FactionId } from '../model';
import type { Rule } from '../lib/deck';

interface Props { rules: Rule[]; onChange: (r: Rule[]) => void; onClose: () => void; onDefaults: () => void }

/** Find-and-replace fixes applied to every card (typos in Archon's sheets and the like). */
export function Corrections({ rules, onChange, onClose, onDefaults }: Props) {
  const set = (i: number, patch: Partial<Rule>) => onChange(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="modal" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="edhead"><h2>Corrections</h2><button className="x" onClick={onClose}>✕</button></div>
        <p className="hint">Exact, case-sensitive find &amp; replace across every card’s text. Cost chips are written <code>{'{1 CP}'}</code>. Leave the faction blank to apply everywhere.</p>
        <table className="rules">
          <thead><tr><th>Find</th><th>Replace with</th><th>Faction</th><th>Why</th><th /></tr></thead>
          <tbody>
            {rules.map((r, i) => (
              <tr key={i}>
                <td><input value={r.find} onChange={(e) => set(i, { find: e.target.value })} /></td>
                <td><input value={r.replace} onChange={(e) => set(i, { replace: e.target.value })} /></td>
                <td>
                  <select value={r.faction ?? ''} onChange={(e) => set(i, { faction: (e.target.value || undefined) as FactionId | undefined })}>
                    <option value="">All</option>
                    {(Object.keys(FACTIONS) as FactionId[]).map((f) => <option key={f} value={f}>{FACTIONS[f].label}</option>)}
                  </select>
                </td>
                <td><input value={r.note ?? ''} onChange={(e) => set(i, { note: e.target.value })} /></td>
                <td><button className="x" title="Delete" onClick={() => onChange(rules.filter((_, j) => j !== i))}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="btnrow">
          <button onClick={() => onChange([...rules, { find: '', replace: '' }])}>Add a correction</button>
          <button onClick={() => { if (confirm('Replace your list with the built-in corrections?')) onDefaults(); }}>Restore defaults</button>
        </div>
      </div>
    </div>
  );
}
