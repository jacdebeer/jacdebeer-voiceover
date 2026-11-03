import React, { useEffect, useRef, useState } from 'react';
import { Send, Loader, Undo2, Check, X, MessageSquare, AlertCircle } from 'lucide-react';
import { LessonData } from '../services/lessonPlayer';
import { askChat, needsNewVoice, ChatProposal, ChatTurn } from '../services/chatService';

interface Props {
  af: boolean;
  lesson: LessonData;
  lang: 'en' | 'af';
  mode: 'read' | 'explain';
  /** true while the modal is generating or re-voicing */
  busy: boolean;
  canUndo: boolean;
  /** Applies a confirmed proposal (and re-voices if needed). Throws on failure. */
  onApply: (proposal: ChatProposal) => Promise<void>;
  onUndo: () => void;
}

interface Item { id: number; role: 'user' | 'assistant'; text: string; proposal?: ChatProposal | null; state?: 'pending' | 'applied' | 'discarded' | 'stale' }

const SUGGESTIONS_EN = ['Make the second beat show the journal entry before the T-accounts', 'Say "Bates" as "Baates" in the voice-over', 'Shorten the first explanation'];
const SUGGESTIONS_AF = ['Wys die joernaalinskrywing voor die T-rekeninge in die tweede deel', 'Sê "Bates" as "Baates" in die stemopname', 'Maak die eerste verduideliking korter'];

export const LessonChat: React.FC<Props> = ({ af, lesson, lang, mode, busy, canUndo, onApply, onUndo }) => {
  const [items, setItems] = useState<Item[]>([]);
  const [text, setText] = useState('');
  const [asking, setAsking] = useState(false);
  const [applyingId, setApplyingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const idRef = useRef(1);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const lessonRef = useRef(lesson);

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'end' }); }, [items, asking]);
  // a proposal was made against one version of the lesson; once the lesson changes any other open proposal is out of date
  useEffect(() => {
    if (lessonRef.current === lesson) return;
    lessonRef.current = lesson;
    setItems((cur) => cur.map((i) => (i.state === 'pending' ? { ...i, state: 'stale' } : i)));
  }, [lesson]);

  const send = async (override?: string) => {
    const q = (override ?? text).trim();
    if (!q || asking || busy || applyingId !== null) return;
    setError(null);
    setText('');
    const userItem: Item = { id: idRef.current++, role: 'user', text: q };
    const history = [...items, userItem];
    setItems(history.map((i) => (i.state === 'pending' ? { ...i, state: 'discarded' } : i)));
    setAsking(true);
    const ctl = new AbortController();
    abortRef.current = ctl;
    try {
      const turns: ChatTurn[] = history.map((i) => ({ role: i.role, text: i.text }));
      const answer = await askChat({ lesson, messages: turns, lang, mode }, ctl.signal);
      setItems((cur) => [...cur, { id: idRef.current++, role: 'assistant', text: answer.reply, proposal: answer.proposal, state: answer.proposal ? 'pending' : undefined }]);
    } catch (e: any) {
      if (e?.name !== 'AbortError') setError(e?.message || 'The chat failed.');
    } finally {
      setAsking(false);
      abortRef.current = null;
    }
  };

  const apply = async (item: Item) => {
    if (!item.proposal) return;
    setApplyingId(item.id);
    setError(null);
    try {
      await onApply(item.proposal);
      setItems((cur) => cur.map((i) => (i.id === item.id ? { ...i, state: 'applied' } : i)));
    } catch (e: any) {
      setError(e?.message || (af ? 'Kon nie die veranderinge toepas nie.' : 'Could not apply the changes.'));
    } finally {
      setApplyingId(null);
    }
  };

  const disabled = asking || busy || applyingId !== null;
  const suggestions = af ? SUGGESTIONS_AF : SUGGESTIONS_EN;

  return (
    <div className="h-full flex flex-col bg-white" data-testid="lesson-chat">
      <div className="flex-none flex items-center justify-between px-3 py-2 border-b border-slate-100">
        <div className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5"><MessageSquare size={13} /> {af ? 'Gesels met Claude' : 'Chat with Claude'}</div>
        <button onClick={onUndo} disabled={!canUndo || disabled}
          className="text-[10px] font-bold text-slate-600 border border-slate-200 rounded-lg px-2 py-1 hover:bg-slate-50 disabled:opacity-40 flex items-center gap-1">
          <Undo2 size={11} /> {af ? 'Ontdoen' : 'Undo'}
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2.5">
        {!items.length && (
          <div className="text-[11px] text-slate-500 space-y-2">
            <p>{af ? 'Sê wat jy in die beelde of klank wil verander. Claude stel die verandering voor; niks verander voordat jy bevestig nie.' : 'Say what you want changed in the visuals or the audio. Claude proposes the change; nothing changes until you confirm.'}</p>
            <div className="space-y-1">
              {suggestions.map((s) => (
                <button key={s} onClick={() => send(s)} disabled={disabled}
                  className="block w-full text-left px-2 py-1.5 rounded-lg border border-slate-200 hover:bg-indigo-50 hover:border-indigo-200 text-[11px] text-slate-700">{s}</button>
              ))}
            </div>
          </div>
        )}
        {items.map((it) => (
          <div key={it.id} className={it.role === 'user' ? 'flex justify-end' : 'flex'}>
            <div className={`max-w-[92%] rounded-xl px-3 py-2 text-[11px] leading-snug whitespace-pre-wrap ${it.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
              {it.text}
              {it.proposal && <ProposalCard af={af} item={it} onApply={() => apply(it)} onDiscard={() => setItems((cur) => cur.map((i) => (i.id === it.id ? { ...i, state: 'discarded' } : i)))} applying={applyingId === it.id} disabled={disabled} />}
            </div>
          </div>
        ))}
        {asking && (
          <div className="flex items-center gap-2 text-[11px] text-slate-500"><Loader className="animate-spin" size={12} /> {af ? 'Claude dink…' : 'Claude is thinking…'}</div>
        )}
        {error && (
          <div className="bg-rose-50 border border-rose-100 rounded-xl p-2.5 text-[11px] text-rose-700 flex gap-2"><AlertCircle size={13} className="flex-none mt-0.5" /> <span>{error}</span></div>
        )}
        <div ref={endRef} />
      </div>

      <form className="flex-none flex gap-2 p-2.5 border-t border-slate-100" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} disabled={disabled} maxLength={2000}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder={af ? 'Wat moet verander?' : 'What should change?'}
          className="flex-1 resize-none px-2.5 py-2 rounded-lg border border-slate-300 text-xs disabled:bg-slate-50" />
        <button type="submit" disabled={disabled || !text.trim()} aria-label={af ? 'Stuur' : 'Send'}
          className="self-end p-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white"><Send size={14} /></button>
      </form>
    </div>
  );
};

const ProposalCard: React.FC<{ af: boolean; item: Item; onApply: () => void; onDiscard: () => void; applying: boolean; disabled: boolean }> = ({ af, item, onApply, onDiscard, applying, disabled }) => {
  const p = item.proposal!;
  const c = p.changes;
  const voice = needsNewVoice(c);
  const lines = c.spoken.slice(0, 6);
  return (
    <div className="mt-2 rounded-lg border border-indigo-200 bg-white text-slate-800 p-2.5 space-y-1.5" data-testid="proposal">
      <div className="font-bold text-[11px]">{p.summary}</div>
      <ul className="text-[10px] text-slate-600 list-disc pl-4 space-y-0.5">
        {c.blocksChanged > 0 && <li>{af ? `${c.blocksChanged} visuele verandering(e)` : `${c.blocksChanged} visual change(s)`}</li>}
        {c.beatsAdded > 0 && <li>{af ? `${c.beatsAdded} deel(e) bygevoeg` : `${c.beatsAdded} section(s) added`}</li>}
        {c.beatsRemoved > 0 && <li>{af ? `${c.beatsRemoved} deel(e) verwyder` : `${c.beatsRemoved} section(s) removed`}</li>}
        {c.pronunciationsChanged && <li>{af ? 'Uitspraak verander' : 'Pronunciation changed'}</li>}
        {lines.map((s, i) => (
          <li key={i}>
            {s.kind === 'changed' && <><span className="line-through opacity-70">{s.from}</span> → <b>{s.to}</b></>}
            {s.kind === 'added' && <>+ <b>{s.to}</b></>}
            {s.kind === 'removed' && <>− <span className="line-through opacity-70">{s.from}</span></>}
          </li>
        ))}
        {c.spoken.length > lines.length && <li>{af ? `en ${c.spoken.length - lines.length} meer` : `and ${c.spoken.length - lines.length} more`}</li>}
      </ul>
      <div className={`text-[10px] rounded px-1.5 py-1 ${voice ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}>
        {voice
          ? (af ? 'Die hele skyfie word weer in een opname opgeneem (gebruik stemkrediete).' : 'The whole slide is voiced again in one take (uses voice credits).')
          : (af ? 'Net beelde: die bestaande stem bly, geen stemkrediete nodig nie.' : 'Visuals only: the existing voice is kept, no voice credits used.')}
      </div>
      {item.state === 'pending' && (
        <div className="flex gap-2 pt-0.5">
          <button onClick={onApply} disabled={disabled}
            className="flex-1 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-[11px] font-bold flex items-center justify-center gap-1">
            {applying ? <Loader className="animate-spin" size={11} /> : <Check size={11} />} {voice ? (af ? 'Bevestig en genereer weer' : 'Confirm and regenerate') : (af ? 'Bevestig en pas toe' : 'Confirm and apply')}
          </button>
          <button onClick={onDiscard} disabled={disabled} className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-[11px] font-bold text-slate-600 hover:bg-slate-50 flex items-center gap-1"><X size={11} /> {af ? 'Verwerp' : 'Discard'}</button>
        </div>
      )}
      {item.state === 'applied' && <div className="text-[10px] font-bold text-emerald-700">{af ? 'Toegepas.' : 'Applied.'}</div>}
      {item.state === 'discarded' && <div className="text-[10px] text-slate-400">{af ? 'Verwerp.' : 'Discarded.'}</div>}
      {item.state === 'stale' && <div className="text-[10px] text-slate-400">{af ? 'Verouderd: die les het intussen verander. Vra weer.' : 'Out of date: the lesson changed since. Ask again.'}</div>}
    </div>
  );
};
