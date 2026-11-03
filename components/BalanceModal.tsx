import React, { useMemo } from 'react';
import { X, Scissors, CheckCircle2, ArrowRight, AlertCircle } from 'lucide-react';
import { CoursePage } from '../types';
import { balanceSlides, describeBalance, slideSize, SLIDE_LIMITS, SlideLevel } from '../utils/slideBalance';

interface Props {
  pages: CoursePage[];
  language: 'en' | 'af';
  onApply: (slides: { text: string; keepId?: number }[]) => void;
  onClose: () => void;
}

const bar = (level: SlideLevel) => (level === 'toolong' ? 'bg-rose-500' : level === 'long' ? 'bg-amber-400' : 'bg-violet-400');

export const BalanceModal: React.FC<Props> = ({ pages, language, onApply, onClose }) => {
  const af = language === 'af';
  const texts = pages.map((p) => p.text);
  const result = useMemo(() => balanceSlides(texts), [pages]);
  const sum = describeBalance(texts, result);
  const nothing = sum.changed === 0;

  const row = (text: string, n: number, tag?: React.ReactNode) => {
    const s = slideSize(text);
    return (
      <div key={n} className="flex items-center gap-2 py-1">
        <span className="w-6 flex-none text-[10px] font-bold text-slate-400 text-right">{n}</span>
        <div className="flex-1 min-w-0">
          <div className="h-2 rounded bg-slate-100 overflow-hidden"><div className={`h-full ${bar(s.level)}`} style={{ width: `${Math.min(100, (s.chars / SLIDE_LIMITS.maxChars) * 100)}%` }} /></div>
        </div>
        <span className="w-24 flex-none text-[10px] text-slate-500 tabular-nums">{s.words} {af ? 'woorde' : 'words'}</span>
        {tag}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4" role="dialog" aria-label={af ? 'Balanseer skyfies' : 'Balance slides'}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <div>
            <h2 className="text-lg text-indigo-600 flex items-center gap-2"><Scissors size={16} /> {af ? 'Balanseer skyfies' : 'Balance slides'}</h2>
            <p className="text-[11px] text-slate-500">
              {af ? `'n Skyfie word een stem-opname en een beeld-generering. Die limiet is ${SLIDE_LIMITS.maxChars} karakters of ${SLIDE_LIMITS.maxWords} woorde.` : `A slide becomes one voice take and one visuals generation. The limit is ${SLIDE_LIMITS.maxChars} characters or ${SLIDE_LIMITS.maxWords} words.`}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100" aria-label="Close"><X size={16} /></button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <div className="brand-label text-[11px] text-slate-500 mb-1">{af ? 'Nou' : 'Now'} · {sum.before} {af ? 'skyfies' : 'slides'}</div>
            {pages.map((p, i) => row(p.text, i + 1, slideSize(p.text).level === 'toolong' ? <span className="text-[10px] font-bold text-rose-600 w-16 flex-none">{af ? 'te lank' : 'too long'}</span> : <span className="w-16 flex-none" />))}
          </div>
          <div>
            <div className="brand-label text-[11px] text-slate-500 mb-1 flex items-center gap-1"><ArrowRight size={11} /> {af ? 'Na balansering' : 'After balancing'} · {sum.after} {af ? 'skyfies' : 'slides'}</div>
            {result.map((r, i) => row(r.text, i + 1,
              <span className={`text-[10px] font-bold w-16 flex-none ${r.unchanged ? 'text-slate-400' : r.original === undefined ? 'text-emerald-700' : 'text-indigo-600'}`}>
                {r.unchanged ? (af ? 'dieselfde' : 'same') : r.original === undefined ? (af ? 'nuut' : 'new') : (af ? 'verander' : 'changed')}
              </span>))}
          </div>
        </div>

        <div className="flex-none px-5 py-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="text-[11px] text-slate-600 min-w-0">
            {nothing ? (
              <span className="flex items-center gap-1.5 text-emerald-700 font-bold"><CheckCircle2 size={13} /> {af ? 'Alle skyfies is binne die limiet. Niks om te skuif nie.' : 'Every slide is within the limit. Nothing to move.'}</span>
            ) : (
              <span>
                {af ? `Inhoud wat te veel is, skuif na die volgende skyfie, in volgorde. ${sum.tooLongBefore} te lank → ${sum.tooLongAfter}.` : `Content that does not fit moves on to the next slide, in order. ${sum.tooLongBefore} too long → ${sum.tooLongAfter}.`}
                {' '}{af ? 'Jy kan dit ontdoen.' : 'You can undo it.'}
              </span>
            )}
            {sum.tooLongAfter > 0 && <span className="flex items-center gap-1 text-rose-600 font-bold mt-1"><AlertCircle size={12} /> {af ? 'Sommige dele kon nie kleiner gemaak word nie.' : 'Some parts could not be made smaller.'}</span>}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50">{af ? 'Kanselleer' : 'Cancel'}</button>
            <button
              onClick={() => onApply(result.map((r) => ({ text: r.text, keepId: r.unchanged && r.original !== undefined ? pages[r.original].id : undefined })))}
              disabled={nothing}
              data-testid="apply-balance"
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-bold"
            >
              {af ? `Pas toe (${sum.after} skyfies)` : `Apply (${sum.after} slides)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
