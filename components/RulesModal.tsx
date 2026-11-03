import React, { useEffect, useState } from 'react';
import { X, ScrollText, Trash2, Loader, Mic } from 'lucide-react';
import { UserRule, fetchRules, getRules, onRulesChange, removeRule, setRuleActive } from '../services/rulesService';

interface Props { af: boolean; onClose: () => void }

export const RulesModal: React.FC<Props> = ({ af, onClose }) => {
  const [rules, setRules] = useState<UserRule[]>(getRules());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void fetchRules(); return onRulesChange(() => setRules(getRules())); }, []);
  const run = async (id: string, f: () => Promise<unknown>) => { setBusy(id); setError(null); try { await f(); } catch (e: any) { setError(e?.message || 'Failed'); } finally { setBusy(null); } };

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/60 flex items-center justify-center p-4 anim-backdrop" role="dialog" aria-label={af ? 'My reëls' : 'My rules'}>
      <div className="anim-pop bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <div>
            <h2 className="text-lg text-indigo-600 flex items-center gap-2"><ScrollText size={16} /> {af ? 'My reëls vir toekomstige lesse' : 'My rules for future lessons'}</h2>
            <p className="text-[11px] text-slate-500 leading-snug">
              {af ? 'Hierdie reëls geld vir elke nuwe les wat jy maak en elke stemopname, en die gesels ken hulle. Hulle verander nie lesse wat reeds gemaak is nie.' : 'These rules apply to every new lesson you generate and every voicing, and the chat knows them. They do not change lessons already made.'}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100" aria-label="Close"><X size={16} /></button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2" data-testid="rules-list">
          {!rules.length && <p className="text-xs text-slate-400 text-center py-8">{af ? 'Nog geen reëls nie. Vra in die gesels vir \'n verandering en kies "ook vir alle toekomstige lesse".' : 'No rules yet. Ask for a change in the chat and choose "also for all future lessons".'}</p>}
          {rules.map((r) => (
            <div key={r.id} className={`rounded-xl border px-3 py-2.5 flex items-start gap-3 anim-fade-up ${r.active ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50 opacity-60'}`}>
              <input type="checkbox" checked={r.active} disabled={busy === r.id} onChange={(e) => run(r.id, () => setRuleActive(r.id, e.target.checked))} className="mt-1" aria-label={af ? 'Aan' : 'On'} />
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">{r.kind === 'pronunciation' ? <><Mic size={10} /> {af ? 'Uitspraak' : 'Pronunciation'}</> : (af ? 'Instruksie' : 'Instruction')}</div>
                <div className="text-xs text-slate-800 leading-snug">{r.kind === 'pronunciation' ? <><b>{r.word}</b> → {r.say}</> : r.text}</div>
              </div>
              <button onClick={() => run(r.id, () => removeRule(r.id))} disabled={busy === r.id} className="p-1.5 text-slate-300 hover:text-rose-500 rounded-lg" aria-label={af ? 'Verwyder' : 'Delete'}>
                {busy === r.id ? <Loader className="animate-spin" size={14} /> : <Trash2 size={14} />}
              </button>
            </div>
          ))}
          {error && <div className="text-[11px] text-rose-600">{error}</div>}
        </div>
      </div>
    </div>
  );
};
