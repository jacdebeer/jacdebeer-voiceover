import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Wand2, Loader, Download, Film, AlertCircle, CheckCircle2, Volume2 } from 'lucide-react';
import { VoiceOption } from '../types';
import { LessonData, buildPlayerHtml, checkScript } from '../services/lessonPlayer';
import { generateVisuals, narrateLines, VisualsLevel, NarrationReport } from '../services/visualsService';
import { buildHyperframesZip, buildHyperframesPreviewHtml } from '../services/hyperframesExport';
import { isAfrikaansText } from '../utils/language';

/** What is kept for one slide while the page stays open. */
export interface VisualsEntry {
  data: LessonData;
  audio: Record<string, string>;
  report?: NarrationReport;
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
  const [progress, setProgress] = useState({ done: 0, total: 0, phase: 'take' });
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const busy = phase !== 'idle';
  // the voice, the prompt and the stored result all follow the text itself, not just the toggle
  const textLang: 'en' | 'af' = isAfrikaansText(slideText, language) ? 'af' : 'en';
  const af = language === 'af';
  const stale = entry && (entry.slideText !== slideText || entry.lang !== textLang);
  const voiceChanged = entry && entry.voiceId !== voice.id;

  const run = async (reuseVisuals: boolean) => {
    const ctl = new AbortController();
    abortRef.current = ctl;
    setError(null);
    try {
      let data = reuseVisuals && entry ? entry.data : null;
      if (!data) {
        setPhase('visuals');
        data = await generateVisuals({ text: slideText, lang: textLang, level, currency }, ctl.signal);
      }
      setPhase('voice');
      const { audio, report } = await narrateLines(data, voice, textLang === 'af', (done, total, phase) => setProgress({ done, total, phase }), ctl.signal);
      onEntry({ data, audio, report, slideText, voiceId: voice.id, lang: textLang });
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

  const [view, setView] = useState<'player' | 'video'>('player');
  const [videoHtml, setVideoHtml] = useState('');
  const [videoBusy, setVideoBusy] = useState(false);
  useEffect(() => {
    // Build the HyperFrames preview when it is opened, and again whenever the visuals or voice change.
    setVideoHtml('');
    if (view !== 'video' || !entry) return;
    let cancelled = false;
    setVideoBusy(true);
    buildHyperframesPreviewHtml(entry.data, entry.audio, slideNumber)
      .then((h) => { if (!cancelled) setVideoHtml(h); })
      .catch((e) => { if (!cancelled) setError(e?.message || 'Could not build the video preview.'); })
      .finally(() => { if (!cancelled) setVideoBusy(false); });
    return () => { cancelled = true; };
  }, [view, entry, slideNumber]);

  const [exporting, setExporting] = useState(false);
  const exportVideo = async () => {
    if (!entry) return;
    setExporting(true);
    setError(null);
    try {
      const zip = await buildHyperframesZip(entry.data, entry.audio, slideNumber);
      const url = URL.createObjectURL(zip);
      const a = document.createElement('a');
      a.href = url;
      a.download = `slide-${slideNumber}-hyperframes.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e: any) {
      setError(e?.message || 'Could not build the video project.');
    } finally {
      setExporting(false);
    }
  };

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
                  : progress.phase === 'lines'
                    ? (af ? `Neem sin ${progress.done} van ${progress.total} op…` : `Voicing line ${progress.done} of ${progress.total}…`)
                    : progress.phase === 'split'
                      ? (af ? 'Sny die opname in sinne…' : 'Cutting the take into lines…')
                      : (af ? 'Neem die hele skyfie in een keer op en kontroleer die taal…' : 'Voicing the whole slide in one take and checking the language…')}
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
            {entry?.report && (
              <div className={`rounded-xl p-3 text-[11px] border space-y-1 ${entry.report.check?.heardDutch ? 'bg-amber-50 border-amber-100 text-amber-800' : 'bg-slate-50 border-slate-100 text-slate-600'}`}>
                <div className="font-bold">
                  {entry.report.mode === 'take' ? (af ? 'Een deurlopende opname' : 'One continuous take') : (af ? 'Sin vir sin opgeneem' : 'Voiced line by line')}
                </div>
                <div>
                  {!entry.report.check || !entry.report.check.checked
                    ? (af ? 'Taalkontrole: nie beskikbaar nie' : `Language check: not available${entry.report.check?.reason ? ` (${entry.report.check.reason})` : ''}`)
                    : (() => {
                        const c = entry.report.check!;
                        const pct = (x?: number | null) => (typeof x === 'number' ? `${Math.round(x * 100)}%` : '?');
                        const facts = `${c.language || '?'} ${pct(c.probability)}, ${af ? 'ooreenstemming met teks' : 'match with the script'} ${pct(c.matchPct)}${c.attempts > 1 ? `, ${c.attempts} ${af ? 'pogings' : 'tries'}` : ''}`;
                        if (c.heardDutch) return af ? `Taalkontrole: klink Nederlands (${facts}). Probeer 'n ander stem.` : `Language check: sounds Dutch (${facts}). Try another voice.`;
                        if (c.labelDutch) return af ? `Taalkontrole: aanvaar. Die tekens sê Nederlands, maar die teks stem ooreen (${facts}).` : `Language check: accepted. Scribe labelled it Dutch but the transcript matches the Afrikaans script (${facts}).`;
                        return af ? `Taalkontrole: Afrikaans (${facts})` : `Language check: Afrikaans (${facts})`;
                      })()}
                </div>
                {entry.report.note && <div className="opacity-80">{entry.report.note}</div>}
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
            <button onClick={exportVideo} disabled={!entry || busy || exporting}
              className="w-full py-2 rounded-xl border border-violet-200 text-violet-700 text-xs font-bold hover:bg-violet-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
              {exporting ? <Loader className="animate-spin" size={13} /> : <Film size={13} />} {af ? 'HyperFrames-video projek (.zip)' : 'HyperFrames video project (.zip)'}
            </button>
            <p className="text-[10px] text-slate-400 leading-snug">
              {af ? 'Render plaaslik: npx hyperframes render (Node 22 en FFmpeg).' : 'Render locally with npx hyperframes render (needs Node 22 and FFmpeg).'}
            </p>
          </div>

          <div className="flex-1 min-h-0 bg-slate-50 flex flex-col">
            <div className="flex-none flex gap-1 px-3 pt-2 border-b border-slate-100 bg-white">
              {([['player', af ? 'Speler' : 'Player'], ['video', af ? 'Video (HyperFrames)' : 'Video (HyperFrames)']] as const).map(([id, label]) => (
                <button key={id} onClick={() => setView(id)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-t-lg border-b-2 ${view === id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-400 hover:text-slate-700'}`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="flex-1 min-h-0">
              {!entry ? (
                <div className="h-full flex items-center justify-center text-xs text-slate-400 p-6 text-center">
                  {af ? 'Die beelde verskyn hier.' : 'The visuals appear here.'}
                </div>
              ) : view === 'player' ? (
                <iframe title="Slide visuals" srcDoc={html} className="w-full h-full border-0" />
              ) : videoHtml ? (
                <iframe title="HyperFrames video preview" srcDoc={videoHtml} className="w-full h-full border-0 bg-slate-900" />
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-slate-500 gap-2">
                  {videoBusy && <Loader className="animate-spin" size={13} />}
                  {af ? 'Bou die video-voorskou…' : 'Building the video preview…'}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
