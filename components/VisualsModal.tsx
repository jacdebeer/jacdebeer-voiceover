import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Wand2, Loader, Download, AlertCircle, CheckCircle2, Volume2 } from 'lucide-react';
import { VoiceOption } from '../types';
import { LessonData, buildPlayerHtml, checkScript } from '../services/lessonPlayer';
import { generateVisuals, narrateLines, VisualsLevel } from '../services/visualsService';

/** What is kept for one slide while the page stays open. */
export interface VisualsEntry {
  data: LessonData;
  audio: Record<string, string>;
  slideText: string;
  voiceId: string;
  lang: 'en' | 'af';
}

interface Props {
  slideNumber: number;
  slideText: string;
  language: 'en' | 'af';
  voice: VoiceOption;
  entry: VisualsEntry | undefined;
  onEntry: (entry: VisualsEntry | undefined) => void;
  onClose: () => void;
}

const LEVELS: { id: VisualsLevel; label: string }[] = [
  { id: 'g8', label: 'Grade 8' },
  { id: 'g9', label: 'Grade 9' },
  { id: 'g10', label: 'Grade 10' },
  { id: 'g11', label: 'Grade 11' },
  { id: 'g12', label: 'Grade 12' },
  { id: 'univ', label: 'University' },
];

export const VisualsModal: React.FC<Props> = ({ slideNumber, slideText, language, voice, entry, onEntry, onClose }) => {
  const [level, setLevel] = useState<VisualsLevel>('univ');
  const [currency, setCurrency] = useState('R');
  const [phase, setPhase] = useState<'idle' | 'visuals' | 'voice'>('idle');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const busy = phase !== 'idle';
  const af = language === 'af';
  const stale = entry && (entry.slideText !== slideText || entry.lang !== language);
  const voiceChanged = entry && entry.voiceId !== voice.id;

  const run = async (reuseVisuals: boolean) => {
    const ctl = new AbortController();
    abortRef.current = ctl;
    setError(null);
    try {
      let data = reuseVisuals && entry ? entry.data : null;
      if (!data) {
        setPhase('visuals');
        data = await generateVisuals({ text: slideText, lang: language, level, currency }, ctl.signal);
      }
      setPhase('voice');
      const audio = await narrateLines(data, voice, af, (done, total) => setProgress({ done, total }), ctl.signal);
      onEntry({ data, audio, slideText, voiceId: voice.id, lang: language });
    } catch (e: any) {
      if (e?.name === 'AbortError') setError('Stopped.');
      else if (e?.isQuotaExceeded) setError('The narrator voice has reached its quota. Try another voice, or wait and retry.');
      else setError(e?.message || 'Something went wrong.');
    } finally {
      setPhase('idle');
      abortRef.current = null;
    }
  };

  const html = useMemo(() => (entry ? buildPlayerHtml(entry.data, entry.audio) : ''), [entry]);
  const check = useMemo(() => (entry ? checkScript(entry.data, entry.slideText) : null), [entry]);

  const download = () => {
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `slide-${slideNumber}-visuals.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[92vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-extrabold text-slate-800">
              {af ? `Skyfie ${slideNumber}: beelde by die stem` : `Slide ${slideNumber}: visuals matched to the voice`}
            </h2>
            <p className="text-[11px] text-slate-500 flex items-center gap-1">
              <Volume2 size={11} /> {voice.label}
            </p>
          </div>
          <button onClick={() => { abortRef.current?.abort(); onClose(); }} className="p-1.5 rounded-lg hover:bg-slate-100" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 min-h-0 flex flex-col md:flex-row">
          <div className="md:w-72 flex-none border-b md:border-b-0 md:border-r border-slate-100 p-4 space-y-3 overflow-y-auto">
            <p className="text-[11px] text-slate-500 leading-relaxed">
              {af
                ? 'Die skyfieteks word die skrif. Claude bou die beelde daarom heen, en elke sin word met die gekose stem opgeneem sodat die beelde saam met die stem verskyn.'
                : 'The slide text is the script. Claude builds the visuals around it, and each sentence is voiced with the selected narrator so the visuals appear in step with the voice.'}
            </p>
            <label className="block text-[11px] font-bold text-slate-700">
              {af ? 'Vir' : 'Audience'}
              <select value={level} onChange={(e) => setLevel(e.target.value as VisualsLevel)} disabled={busy}
                className="mt-1 w-full px-2 py-1.5 rounded-lg border border-slate-300 text-xs">
                {LEVELS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
              </select>
            </label>
            <label className="block text-[11px] font-bold text-slate-700">
              {af ? 'Geldeenheid' : 'Currency symbol'}
              <input value={currency} onChange={(e) => setCurrency(e.target.value)} disabled={busy} maxLength={4}
                className="mt-1 w-20 px-2 py-1.5 rounded-lg border border-slate-300 text-xs" />
            </label>

            {busy ? (
              <button onClick={() => abortRef.current?.abort()}
                className="w-full py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold">
                {af ? 'Stop' : 'Stop'}
              </button>
            ) : (
              <>
                <button onClick={() => run(false)} disabled={!slideText.trim()}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 disabled:bg-slate-200 text-white text-xs font-bold flex items-center justify-center gap-2">
                  <Wand2 size={14} />
                  {entry ? (af ? 'Genereer beelde weer' : 'Regenerate visuals') : (af ? 'Genereer beelde en stem' : 'Generate visuals and voice')}
                </button>
                {entry && voiceChanged && !stale && (
                  <button onClick={() => run(true)}
                    className="w-full py-2 rounded-xl border-2 border-indigo-100 text-indigo-700 text-xs font-bold hover:bg-indigo-50">
                    {af ? 'Neem net die stem weer op' : 'Re-voice with the selected narrator'}
                  </button>
                )}
              </>
            )}

            {busy && (
              <div className="bg-indigo-50 rounded-xl p-3 border border-indigo-100 text-[11px] text-indigo-700 font-bold flex items-center gap-2">
                <Loader className="animate-spin" size={12} />
                {phase === 'visuals'
                  ? (af ? 'Claude bou die beelde…' : 'Claude is building the visuals…')
                  : (af ? `Neem sin ${progress.done} van ${progress.total} op…` : `Voicing line ${progress.done} of ${progress.total}…`)}
              </div>
            )}
            {error && (
              <div className="bg-rose-50 border border-rose-100 rounded-xl p-3 text-[11px] text-rose-700 flex gap-2">
                <AlertCircle size={13} className="flex-none mt-0.5" /> <span>{error}</span>
              </div>
            )}
            {entry && check && (
              <div className={`rounded-xl p-3 text-[11px] flex gap-2 border ${check.ok ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-amber-50 border-amber-100 text-amber-800'}`}>
                {check.ok ? <CheckCircle2 size={13} className="flex-none mt-0.5" /> : <AlertCircle size={13} className="flex-none mt-0.5" />}
                <span>{check.detail}</span>
              </div>
            )}
            {stale && (
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-[11px] text-amber-800">
                {af ? 'Die skyfieteks of taal het verander sedert hierdie beelde gebou is. Genereer weer.' : 'The slide text or language has changed since these visuals were built. Regenerate.'}
              </div>
            )}
            {entry && !stale && voiceChanged && (
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-[11px] text-amber-800">
                {af ? 'Die stem hier is nie die gekose verteller nie.' : 'The voice in this preview is not the currently selected narrator.'}
              </div>
            )}
            <button onClick={download} disabled={!entry || busy}
              className="w-full py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
              <Download size={13} /> {af ? 'Laai .html af' : 'Download standalone .html'}
            </button>
          </div>

          <div className="flex-1 min-h-0 bg-slate-50">
            {entry ? (
              <iframe title="Slide visuals" srcDoc={html} className="w-full h-full border-0" />
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400 p-6 text-center">
                {af ? 'Die beelde verskyn hier.' : 'The visuals appear here.'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
