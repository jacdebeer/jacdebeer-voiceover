import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Wand2, Loader, Download, Save, AlertCircle, CheckCircle2, Volume2, Maximize2, Minimize2 } from 'lucide-react';
import { VoiceOption } from '../types';
import { LessonData, buildPlayerHtml, checkScript } from '../services/lessonPlayer';
import { generateVisuals, narrateLines, VisualsLevel, VisualsMode, NarrationReport } from '../services/visualsService';
import { isAfrikaansText } from '../utils/language';
import { saveLesson, embedCode, compressAudio } from '../services/libraryService';
import { LessonChat } from './LessonChat';
import { useFullscreen } from '../utils/useFullscreen';
import { needsNewVoice, ChatProposal, LessonTimeline, LessonPos } from '../services/chatService';

/** What is kept for one slide while the page stays open. */
export interface VisualsEntry {
  data: LessonData;
  audio: Record<string, string>;
  report?: NarrationReport;
  mode?: VisualsMode;
  slideText: string;
  voiceId: string;
  lang: 'en' | 'af';
  /** changed in the chat, so it no longer matches the slide script word for word */
  edited?: boolean;
}

interface Props {
  slideNumber: number;
  slideText: string;
  language: 'en' | 'af';
  voice: VoiceOption;
  entry: VisualsEntry | undefined;
  onEntry: (entry: VisualsEntry | undefined) => void;
  onClose: () => void;
  /** the saved lesson this slide was opened from (if any), so saving again can update it */
  link?: { id: string; token: string; title: string } | null;
  onLink?: (link: { id: string; token: string; title: string } | null) => void;
}

const LEVELS: { id: VisualsLevel; label: string }[] = [
  { id: 'g8', label: 'Grade 8' },
  { id: 'g9', label: 'Grade 9' },
  { id: 'g10', label: 'Grade 10' },
  { id: 'g11', label: 'Grade 11' },
  { id: 'g12', label: 'Grade 12' },
  { id: 'univ', label: 'University' },
];

export const VisualsModal: React.FC<Props> = ({ slideNumber, slideText, language, voice, entry, onEntry, onClose, link, onLink }) => {
  const [level, setLevel] = useState<VisualsLevel>('univ');
  const [currency, setCurrency] = useState('R');
  // A short outline (just headings) cannot make a voice-over by itself, so it starts in Explain. A finished script starts in Read.
  const wordCount = slideText.trim().split(/\s+/).filter(Boolean).length;
  const [mode, setMode] = useState<VisualsMode>(wordCount < 70 ? 'explain' : 'read');
  const [phase, setPhase] = useState<'idle' | 'visuals' | 'voice'>('idle');
  const [progress, setProgress] = useState({ done: 0, total: 0, phase: 'take' });
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Get Sharp Academy branding on the page, the video and the saved lesson (on by default; one setting for both windows)
  const [brand, setBrand] = useState(() => { try { return localStorage.getItem('brand-on') !== '0'; } catch { return true; } });
  useEffect(() => { try { localStorage.setItem('brand-on', brand ? '1' : '0'); } catch { /* storage unavailable */ } }, [brand]);
  const branded = (d: LessonData): LessonData => ({ ...d, brand });

  const { ref: winRef, full, toggle: toggleFull } = useFullscreen<HTMLDivElement>();
  const busy = phase !== 'idle';
  // the voice, the prompt and the stored result all follow the text itself, not just the toggle
  const textLang: 'en' | 'af' = isAfrikaansText(slideText, language) ? 'af' : 'en';
  const af = language === 'af';
  const stale = entry && (entry.slideText !== slideText || entry.lang !== textLang || (entry.mode ?? 'read') !== mode);
  const voiceChanged = entry && entry.voiceId !== voice.id;

  const run = async (reuseVisuals: boolean) => {
    const ctl = new AbortController();
    abortRef.current = ctl;
    setError(null);
    try {
      let data = reuseVisuals && entry ? entry.data : null;
      if (!data) {
        setPhase('visuals');
        data = await generateVisuals({ text: slideText, lang: textLang, level, currency, mode }, ctl.signal);
      }
      setPhase('voice');
      const { audio, report } = await narrateLines(data, voice, textLang === 'af', (done, total, phase) => setProgress({ done, total, phase }), ctl.signal, data.pronunciations as Record<string, string> | undefined);
      setHistory([]);
      onEntry({ data, audio, report, slideText, voiceId: voice.id, lang: textLang, mode });
    } catch (e: any) {
      if (e?.name === 'AbortError') setError('Stopped.');
      else if (e?.isQuotaExceeded) setError(e.message && e.message !== 'QUOTA_EXCEEDED' ? e.message : 'The narrator voice has reached its quota. Try another voice, or wait and retry.');
      else setError(e?.message || 'Something went wrong.');
    } finally {
      setPhase('idle');
      abortRef.current = null;
    }
  };

  // Earlier versions of this slide, so a chat change can be undone (the last three are kept).
  const [history, setHistory] = useState<VisualsEntry[]>([]);
  // The player reports where the video is and when each line is said, so the chat can talk in times instead of beat numbers.
  const playerRef = useRef<HTMLIFrameElement>(null);
  const [timeline, setTimeline] = useState<LessonTimeline | null>(null);
  const [pos, setPos] = useState<LessonPos | null>(null);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (!playerRef.current || e.source !== playerRef.current.contentWindow) return;
      if (e.data?.lessonTimeline) setTimeline(e.data.lessonTimeline as LessonTimeline);
      if (e.data?.lessonPos) setPos(e.data.lessonPos as LessonPos);
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);
  const applyEdit = async (proposal: ChatProposal) => {
    if (!entry) return;
    const before = entry;
    const data = proposal.lesson;
    let next: VisualsEntry;
    if (needsNewVoice(proposal.changes)) {
      const ctl = new AbortController();
      abortRef.current = ctl;
      setPhase('voice');
      setProgress({ done: 0, total: 3, phase: 'take' });
      try {
        const { audio, report } = await narrateLines(data, voice, before.lang === 'af', (done, total, ph) => setProgress({ done, total, phase: ph }), ctl.signal, data.pronunciations as Record<string, string> | undefined);
        next = { ...before, data, audio, report, voiceId: voice.id, edited: true };
      } catch (e: any) {
        if (e?.name === 'AbortError') throw new Error(af ? 'Gestop. Die les is nie verander nie.' : 'Stopped. The lesson was not changed.');
        if (e?.isQuotaExceeded) throw new Error(e.message && e.message !== 'QUOTA_EXCEEDED' ? e.message : 'The narrator voice has reached its quota. The lesson was not changed.');
        throw e;
      } finally {
        setPhase('idle');
        abortRef.current = null;
      }
    } else {
      next = { ...before, data, edited: true };
    }
    setHistory((h) => [...h.slice(-2), before]);
    onEntry(next);
  };
  const undoEdit = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    onEntry(prev);
  };

  const html = useMemo(() => (entry ? buildPlayerHtml(branded(entry.data), entry.audio) : ''), [entry, brand]);
  const check = useMemo(() => (entry && (entry.mode ?? 'read') === 'read' && !entry.edited ? checkScript(entry.data, entry.slideText) : null), [entry]);

  const [saving, setSaving] = useState<{ done: number; total: number; phase: string } | null>(null);
  const [savedAs, setSavedAs] = useState<{ title: string; token: string } | null>(null);
  useEffect(() => setSavedAs(null), [entry]);
  const saveToLibrary = async (asCopy = false) => {
    if (!entry) return;
    const update = !!link && !asCopy;
    const suggested = `${af ? 'Skyfie' : 'Slide'} ${slideNumber}: ${String(entry.data.title || '').trim() || (af ? 'Les' : 'Lesson')}`;
    const title = update ? link!.title : window.prompt(af ? 'Naam vir hierdie les in die biblioteek:' : 'Name for this lesson in the library:', suggested);
    if (!title || !title.trim()) return;
    setError(null);
    setSaving({ done: 0, total: 0, phase: 'create' });
    try {
      const r = await saveLesson(
        {
          title: title.trim(), slideLabel: `${af ? 'Skyfie' : 'Slide'} ${slideNumber}`, voiceLabel: voice.label, lang: entry.lang, mode: entry.mode, data: branded(entry.data), audio: entry.audio,
          source: { slideText: entry.slideText, mode: entry.mode, voiceId: entry.voiceId, lang: entry.lang },
          replace: update ? { id: link!.id, token: link!.token } : undefined,
        },
        (done, total, phase) => setSaving({ done, total, phase }),
      );
      onLink?.({ id: r.id, token: r.token, title: title.trim() });
      setSavedAs({ title: title.trim(), token: r.token });
    } catch (e: any) {
      setError(e?.message || 'Could not save the lesson.');
    } finally {
      setSaving(null);
    }
  };
  const [downloading, setDownloading] = useState(false);
  const download = async () => {
    if (!entry) return;
    setDownloading(true);
    setError(null);
    try {
      // MP3 instead of WAV: the same voice-over at about a tenth of the file size
      const mp3 = await compressAudio(entry.audio);
      const url = URL.createObjectURL(new Blob([buildPlayerHtml(branded(entry.data), mp3)], { type: 'text/html' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `slide-${slideNumber}-visuals.html`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e: any) {
      setError(e?.message || 'Could not build the .html file.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className={`fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center ${full ? 'p-0' : 'p-4'} anim-backdrop`}>
      <div ref={winRef} className={`bg-white shadow-2xl w-full flex flex-col overflow-hidden anim-pop ${full ? 'h-screen max-w-none rounded-none' : 'max-w-6xl h-[92vh] rounded-2xl'}`}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-extrabold text-slate-800">
              {af ? `Skyfie ${slideNumber}: beelde by die stem` : `Slide ${slideNumber}: visuals matched to the voice`}
            </h2>
            <p className="text-[11px] text-slate-500 flex items-center gap-1">
              <Volume2 size={11} /> {voice.label}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={toggleFull} className="p-1.5 rounded-lg hover:bg-slate-100" aria-label={full ? 'Exit full screen' : 'Full screen'} title={full ? 'Exit full screen (Esc)' : 'Full screen'} data-testid="fullscreen">
              {full ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button onClick={() => { abortRef.current?.abort(); onClose(); }} className="p-1.5 rounded-lg hover:bg-slate-100" aria-label="Close">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col md:flex-row">
          <div className="md:w-72 flex-none border-b md:border-b-0 md:border-r border-slate-100 p-4 space-y-3 overflow-y-auto">
            <div className="space-y-1.5">
              <div className="text-[11px] font-bold text-slate-700">{af ? 'Stemopname' : 'Voice-over'}</div>
              {([
                ['explain', af ? 'Verduidelik die skyfie' : 'Explain the slide', af ? 'Claude skryf \'n dosent se verduideliking uit die skyfie-opskrifte, met voorbeelde en rekeningkundige beelde.' : 'Claude writes a lecturer\'s explanation from the slide outline, with a worked example and accounting visuals. Best for short slides.'],
                ['read', af ? 'Lees die skyfieteks presies' : 'Read the slide text exactly', af ? 'Die stem sê net wat op die skyfie staan. Beste vir \'n voltooide skrif.' : 'The voice says exactly what is on the slide. Best for a finished script.'],
              ] as const).map(([id, label, hint]) => (
                <label key={id} className={`block rounded-lg border p-2 cursor-pointer ${mode === id ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50'} ${busy ? 'opacity-60 pointer-events-none' : ''}`}>
                  <div className="flex items-center gap-2 text-[11px] font-bold text-slate-700">
                    <input type="radio" name="visuals-mode" checked={mode === id} onChange={() => setMode(id)} /> {label}
                  </div>
                  <div className="text-[10px] text-slate-500 leading-snug mt-0.5">{hint}</div>
                </label>
              ))}
              {mode === 'read' && wordCount < 70 && (
                <div className="text-[10px] text-amber-700 leading-snug">
                  {af ? `Die skyfie het net ${wordCount} woorde. Kies Verduidelik vir 'n volle stemopname.` : `This slide has only ${wordCount} words, so the voice will only say those. Choose Explain for a full voice-over.`}
                </div>
              )}
            </div>
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

            <label className="flex items-center gap-2 text-[11px] font-bold text-slate-700">
              <input type="checkbox" checked={brand} onChange={(e) => setBrand(e.target.checked)} /> {af ? 'Get Sharp Academy-handelsmerk' : 'Get Sharp Academy branding'}
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
            {entry?.report?.mode === 'lines' && !busy && (
              <div className="rounded-xl p-3 text-[11px] bg-amber-50 border border-amber-200 text-amber-900 space-y-2" data-testid="not-one-take">
                <div className="font-bold flex items-center gap-1.5"><AlertCircle size={13} /> {af ? 'Nie in een opname gemaak nie' : 'Not made as one take'}</div>
                <div className="leading-snug">{af
                  ? 'Elke sin is apart opgeneem, sonder taalkontrole. Dan kan die uitspraak of die taal van sin tot sin verskil (ook Nederlands). Neem die stem weer op.'
                  : 'Each sentence was voiced on its own, without the language check, so the voice or accent can differ from line to line (Dutch included). Voice it again.'}</div>
                <button onClick={() => run(true)} className="w-full py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold">{af ? 'Neem die stem weer op' : 'Voice it again as one take'}</button>
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
            <button onClick={download} disabled={!entry || busy || downloading}
              className="w-full py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
              {downloading ? <Loader className="animate-spin" size={13} /> : <Download size={13} />} {af ? 'Laai .html af' : 'Download standalone .html'}
            </button>
            <button onClick={() => saveToLibrary(false)} disabled={!entry || busy || !!saving} data-testid="save-library"
              className="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
              {saving ? <Loader className="animate-spin" size={13} /> : <Save size={13} />}
              {saving
                ? (saving.phase === 'audio' ? (af ? `Stoor klank ${saving.done} van ${saving.total}…` : `Saving audio ${saving.done} of ${saving.total}…`) : (af ? 'Stoor…' : 'Saving…'))
                : link ? (af ? `Dateer "${link.title}" op in biblioteek` : `Update "${link.title}" in the library`) : (af ? 'Stoor in biblioteek' : 'Save to library')}
            </button>
            {link && (
              <button onClick={() => saveToLibrary(true)} disabled={!entry || busy || !!saving} data-testid="save-copy"
                className="w-full py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 disabled:opacity-40">{af ? 'Stoor as nuwe kopie' : 'Save as a new copy'}</button>
            )}
            {savedAs && (
              <div className="rounded-xl p-2.5 text-[10px] bg-emerald-50 border border-emerald-100 text-emerald-800 leading-snug">
                {af ? `Gestoor as "${savedAs.title}". Maak dit oop onder Biblioteek in die kopstuk om dit te deel of in te bed.` : `Saved as "${savedAs.title}". Open it under Library in the header to share or embed it.`}
              </div>
            )}
          </div>

          <div className="flex-1 min-h-[50vh] md:min-h-0 min-w-0 bg-slate-50 flex flex-col">
            <div className="flex-1 min-h-0">
              {!entry ? (
                <div className="h-full flex items-center justify-center text-xs text-slate-400 p-6 text-center">
                  {af ? 'Die beelde verskyn hier.' : 'The visuals appear here.'}
                </div>
              ) : (
                <iframe ref={playerRef} title="Slide visuals" srcDoc={html} className="w-full h-full border-0" onLoad={() => playerRef.current?.contentWindow?.postMessage('lesson-timeline?', '*')} />
              )}
            </div>
          </div>

          {entry && (
            <div className="md:w-80 flex-none h-[60vh] md:h-auto border-t md:border-t-0 md:border-l border-slate-100">
              <LessonChat af={af} lesson={entry.data} lang={entry.lang} mode={entry.mode ?? 'read'} busy={busy}
                canUndo={history.length > 0} timeline={timeline} pos={pos} onApply={applyEdit} onUndo={undoEdit} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
