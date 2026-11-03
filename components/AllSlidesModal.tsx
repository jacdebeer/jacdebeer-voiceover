import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Layers, Loader, Download, Film, Save, AlertCircle, CheckCircle2, Wand2, Volume2, Scissors, Clock3 } from 'lucide-react';
import { CoursePage, VoiceOption } from '../types';
import { LessonData, buildPlayerHtml } from '../services/lessonPlayer';
import { produceSlide, autoMode, VisualsLevel, VisualsMode } from '../services/visualsService';
import { mergeLessons, mergeAudio } from '../services/lessonMerge';
import { buildHyperframesZip } from '../services/hyperframesExport';
import { compressAudio, saveLesson } from '../services/libraryService';
import { isAfrikaansText } from '../utils/language';
import { slideSize, SLIDE_LIMITS } from '../utils/slideBalance';
import { VisualsEntry } from './VisualsModal';

interface Props {
  pages: CoursePage[];
  language: 'en' | 'af';
  voice: VoiceOption;
  entries: Record<number, VisualsEntry>;
  onEntry: (pageId: number, entry: VisualsEntry) => void;
  /** opens the balance window: slides that are too long cannot be produced */
  onBalance: () => void;
  onClose: () => void;
}

type Status = 'empty' | 'toolong' | 'todo' | 'revoice' | 'ready';

const LEVELS: { id: VisualsLevel; label: string }[] = [
  { id: 'g8', label: 'Grade 8' }, { id: 'g9', label: 'Grade 9' }, { id: 'g10', label: 'Grade 10' },
  { id: 'g11', label: 'Grade 11' }, { id: 'g12', label: 'Grade 12' }, { id: 'univ', label: 'University' },
];

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

export const AllSlidesModal: React.FC<Props> = ({ pages, language, voice, entries, onEntry, onBalance, onClose }) => {
  const af = language === 'af';
  const [level, setLevel] = useState<VisualsLevel>('univ');
  const [currency, setCurrency] = useState('R');
  const [modeChoice, setModeChoice] = useState<'auto' | VisualsMode>('auto');
  const [brand, setBrand] = useState(() => { try { return localStorage.getItem('brand-on') !== '0'; } catch { return true; } });
  const [title, setTitle] = useState(af ? 'Alle skyfies' : 'All slides');
  const [running, setRunning] = useState(false);
  const [now, setNow] = useState<{ index: number; phase: 'visuals' | 'voice'; sub: string; done: number; total: number } | null>(null);
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => { try { localStorage.setItem('brand-on', brand ? '1' : '0'); } catch { /* storage unavailable */ } }, [brand]);

  const modeFor = (p: CoursePage): VisualsMode => (modeChoice === 'auto' ? autoMode(p.text) : modeChoice);
  const langFor = (p: CoursePage): 'en' | 'af' => (isAfrikaansText(p.text, language) ? 'af' : 'en');

  const statusOf = (p: CoursePage): Status => {
    if (!p.text.trim()) return 'empty';
    if (slideSize(p.text).level === 'toolong') return 'toolong';
    const e = entries[p.id];
    if (e && e.slideText === p.text && e.lang === langFor(p) && (e.mode ?? 'read') === modeFor(p)) return e.voiceId === voice.id ? 'ready' : 'revoice';
    return 'todo';
  };
  const statuses = pages.map(statusOf);
  const count = (s: Status) => statuses.filter((x) => x === s).length;
  const toDo = count('todo') + count('revoice');
  const tooLong = count('toolong');
  const usable = pages.filter((_, i) => statuses[i] !== 'empty');
  const allReady = usable.length > 0 && statuses.every((s) => s === 'ready' || s === 'empty');

  const run = async () => {
    const ctl = new AbortController();
    abortRef.current = ctl;
    setRunning(true);
    setErrors({});
    setNotice(null);
    setBuilt(null);
    try {
      for (let i = 0; i < pages.length; i++) {
        const p = pages[i];
        const st = statuses[i];
        if (st !== 'todo' && st !== 'revoice') continue;
        if (ctl.signal.aborted) throw new DOMException('Stopped', 'AbortError');
        const lang = langFor(p);
        const mode = modeFor(p);
        setNow({ index: i, phase: 'visuals', sub: '', done: 0, total: 1 });
        try {
          const prev = entries[p.id];
          const { data, audio, report } = await produceSlide(
            { text: p.text, lang, level, currency, mode, voice, reuse: st === 'revoice' && prev ? prev.data : null },
            (phase, done, total, sub) => setNow({ index: i, phase, sub, done, total }),
            ctl.signal,
          );
          onEntry(p.id, { data, audio, report, slideText: p.text, voiceId: voice.id, lang, mode });
        } catch (e: any) {
          if (e?.name === 'AbortError') throw e;
          if (e?.isQuotaExceeded) {
            setErrors((cur) => ({ ...cur, [p.id]: e.message && e.message !== 'QUOTA_EXCEEDED' ? e.message : 'The narrator voice has reached its quota.' }));
            setNotice(af ? 'Gestop: die stem se krediete of kwota is op. Die skyfies wat klaar is, bly gestoor.' : 'Stopped: the narrator voice is out of credits or quota. Slides that are finished are kept.');
            break;
          }
          setErrors((cur) => ({ ...cur, [p.id]: e?.message || 'Failed' }));
        }
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') setNotice(af ? 'Gestop. Voltooide skyfies bly gestoor.' : 'Stopped. Finished slides are kept.');
    } finally {
      setRunning(false);
      setNow(null);
      abortRef.current = null;
    }
  };

  // ---- the one html file
  const [built, setBuilt] = useState<{ html: string; bytes: number; included: number; skipped: number; key: string } | null>(null);
  const [building, setBuilding] = useState(false);
  const ready = pages.map((p, i) => ({ p, i, e: entries[p.id], ok: statuses[i] === 'ready' || statuses[i] === 'revoice' })).filter((x) => x.ok && x.e);
  const key = [title, brand, ...ready.map((x) => `${x.p.id}:${x.e.slideText.length}:${x.e.voiceId}:${Object.keys(x.e.audio).length}`)].join('|');
  const combined = useMemo(() => {
    if (!ready.length) return null;
    const label = (i: number) => `${af ? 'Skyfie' : 'Slide'} ${i + 1}`;
    const data: LessonData = mergeLessons(ready.map((x) => ({ label: label(x.i), data: x.e.data })), { title: title.trim() || (af ? 'Alle skyfies' : 'All slides'), subtitle: `${ready.length} ${af ? 'skyfies' : 'slides'}`, brand });
    return { data, audio: mergeAudio(ready.map((x) => x.e.audio)) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const mixedLang = new Set(ready.map((x) => x.e.lang)).size > 1;

  const build = async () => {
    if (!combined) return;
    setBuilding(true);
    setNotice(null);
    try {
      const mp3 = await compressAudio(combined.audio); // MP3, so the one file stays a size that can be shared
      const html = buildPlayerHtml(combined.data, mp3);
      setBuilt({ html, bytes: html.length, included: ready.length, skipped: usable.length - ready.length, key });
    } catch (e: any) {
      setNotice(e?.message || 'Could not build the html file.');
    } finally {
      setBuilding(false);
    }
  };
  // build automatically when a run has finished and every slide is ready
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !running && allReady && combined) void build();
    wasRunning.current = running;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);
  const fresh = built && built.key === key;

  const download = () => {
    if (!built) return;
    const url = URL.createObjectURL(new Blob([built.html], { type: 'text/html' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'all-slides.html';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const [exporting, setExporting] = useState(false);
  const exportVideo = async () => {
    if (!combined) return;
    setExporting(true);
    setNotice(null);
    try {
      const zip = await buildHyperframesZip(combined.data, combined.audio, 'all');
      const url = URL.createObjectURL(zip);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'all-slides-hyperframes.zip';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e: any) {
      setNotice(e?.message || 'Could not build the video project.');
    } finally {
      setExporting(false);
    }
  };
  const [saving, setSaving] = useState<{ done: number; total: number } | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const saveToLibrary = async () => {
    if (!combined) return;
    setSaving({ done: 0, total: 0 });
    setSaved(null);
    try {
      await saveLesson(
        { title: title.trim() || (af ? 'Alle skyfies' : 'All slides'), slideLabel: af ? 'Alle skyfies' : 'All slides', voiceLabel: voice.label, lang: ready[0].e.lang, mode: 'combined', data: combined.data, audio: combined.audio },
        (done, total) => setSaving({ done, total }),
      );
      setSaved(title.trim() || (af ? 'Alle skyfies' : 'All slides'));
    } catch (e: any) {
      setNotice(e?.message || 'Could not save the lesson.');
    } finally {
      setSaving(null);
    }
  };

  const chip = (s: Status) => {
    const map: Record<Status, [string, string]> = {
      ready: [af ? 'Gereed' : 'Ready', 'bg-emerald-50 text-emerald-700 border-emerald-100'],
      revoice: [af ? 'Ander stem' : 'Other voice', 'bg-amber-50 text-amber-800 border-amber-100'],
      todo: [af ? 'Moet gemaak word' : 'To produce', 'bg-slate-50 text-slate-600 border-slate-200'],
      toolong: [af ? 'Te lank' : 'Too long', 'bg-rose-50 text-rose-700 border-rose-100'],
      empty: [af ? 'Leeg' : 'Empty', 'bg-slate-50 text-slate-400 border-slate-100'],
    };
    return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${map[s][1]}`}>{map[s][0]}</span>;
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4" role="dialog" aria-label={af ? 'Alle skyfies in een html' : 'All slides in one html file'}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[92vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <div>
            <h2 className="text-lg text-indigo-600">{af ? 'Alle skyfies in een html-lêer' : 'All slides in one html file'}</h2>
            <p className="text-[11px] text-slate-500 flex items-center gap-1"><Volume2 size={11} /> {voice.label} · {pages.length} {af ? 'skyfies' : 'slides'}</p>
          </div>
          <button onClick={() => { abortRef.current?.abort(); onClose(); }} className="p-1.5 rounded-lg hover:bg-slate-100" aria-label="Close"><X size={16} /></button>
        </div>

        <div className="flex-1 min-h-0 flex flex-col md:flex-row">
          {/* settings and actions */}
          <div className="md:w-72 flex-none border-b md:border-b-0 md:border-r border-slate-100 p-4 space-y-3 overflow-y-auto">
            <label className="block text-[11px] font-bold text-slate-700">
              {af ? 'Voice-over vir elke skyfie' : 'Voice-over for each slide'}
              <select value={modeChoice} onChange={(e) => setModeChoice(e.target.value as any)} disabled={running} className="mt-1 w-full px-2 py-1.5 rounded-lg border border-slate-300 text-xs">
                <option value="auto">{af ? 'Outomaties (kort = verduidelik, lank = lees)' : 'Automatic (short = explain, long = read)'}</option>
                <option value="explain">{af ? 'Verduidelik elke skyfie' : 'Explain every slide'}</option>
                <option value="read">{af ? 'Lees elke skyfie presies' : 'Read every slide exactly'}</option>
              </select>
            </label>
            <label className="block text-[11px] font-bold text-slate-700">
              {af ? 'Vir' : 'Audience'}
              <select value={level} onChange={(e) => setLevel(e.target.value as VisualsLevel)} disabled={running} className="mt-1 w-full px-2 py-1.5 rounded-lg border border-slate-300 text-xs">
                {LEVELS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
              </select>
            </label>
            <label className="block text-[11px] font-bold text-slate-700">
              {af ? 'Geldeenheid' : 'Currency symbol'}
              <input value={currency} onChange={(e) => setCurrency(e.target.value)} disabled={running} maxLength={4} className="mt-1 w-20 px-2 py-1.5 rounded-lg border border-slate-300 text-xs" />
            </label>
            <label className="block text-[11px] font-bold text-slate-700">
              {af ? 'Titel van die les' : 'Lesson title'}
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} className="mt-1 w-full px-2 py-1.5 rounded-lg border border-slate-300 text-xs" />
            </label>
            <label className="flex items-center gap-2 text-[11px] font-bold text-slate-700">
              <input type="checkbox" checked={brand} onChange={(e) => setBrand(e.target.checked)} /> {af ? 'Get Sharp Academy-handelsmerk' : 'Get Sharp Academy branding'}
            </label>

            {tooLong > 0 && (
              <div className="rounded-xl p-3 text-[11px] bg-rose-50 border border-rose-100 text-rose-700 space-y-2" data-testid="toolong-warning">
                <div className="flex gap-2"><AlertCircle size={13} className="flex-none mt-0.5" /> <span>
                  {af ? `${tooLong} skyfie(s) is te lank om betroubaar te maak (meer as ${SLIDE_LIMITS.maxChars} karakters of ${SLIDE_LIMITS.maxWords} woorde).` : `${tooLong} slide(s) are too long to produce reliably (over ${SLIDE_LIMITS.maxChars} characters or ${SLIDE_LIMITS.maxWords} words).`}
                </span></div>
                <button onClick={onBalance} className="w-full py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold flex items-center justify-center gap-1.5"><Scissors size={12} /> {af ? 'Balanseer skyfies' : 'Balance slides'}</button>
              </div>
            )}

            {running ? (
              <button onClick={() => abortRef.current?.abort()} className="w-full py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold">Stop</button>
            ) : (
              <button onClick={run} disabled={!toDo || tooLong > 0}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 disabled:from-slate-200 disabled:to-slate-200 text-white text-xs font-bold flex items-center justify-center gap-2" data-testid="run-all">
                <Wand2 size={14} /> {toDo
                  ? (af ? `Maak ${toDo} skyfie(s)` : `Produce ${toDo} slide${toDo === 1 ? '' : 's'}`)
                  : (af ? 'Alles is gereed' : 'Everything is ready')}
              </button>
            )}
            {toDo > 0 && !running && <p className="text-[10px] text-slate-400 leading-snug">{af ? 'Elke skyfie gebruik stemkrediete. Een skyfie nà die ander, in volgorde.' : 'Each slide uses voice credits. One slide after the other, in order.'}</p>}

            {running && now && (
              <div className="bg-indigo-50 rounded-xl p-3 border border-indigo-100 text-[11px] text-indigo-700 font-bold space-y-1.5" data-testid="progress">
                <div className="flex items-center gap-2"><Loader className="animate-spin" size={12} /> {af ? 'Skyfie' : 'Slide'} {now.index + 1} {af ? 'van' : 'of'} {pages.length}</div>
                <div className="font-normal">{now.phase === 'visuals' ? (af ? 'Claude bou die beelde…' : 'Claude is building the visuals…') : (af ? 'Neem die stem in een opname op…' : 'Voicing the slide in one take…')}</div>
                <div className="h-1.5 rounded bg-indigo-100 overflow-hidden"><div className="h-full bg-indigo-600" style={{ width: `${Math.round((statuses.slice(0, now.index).filter((s) => s === 'ready').length / Math.max(1, usable.length)) * 100)}%` }} /></div>
              </div>
            )}
            {notice && <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-[11px] text-amber-800 flex gap-2"><AlertCircle size={13} className="flex-none mt-0.5" /> <span>{notice}</span></div>}
            {mixedLang && <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-[11px] text-amber-800">{af ? 'Die skyfies is nie almal in dieselfde taal nie. Die les gebruik die opskrifte van die eerste skyfie.' : 'The slides are not all in one language. The lesson uses the labels of the first slide.'}</div>}

            <div className="pt-2 border-t border-slate-100 space-y-2">
              <button onClick={build} disabled={!combined || building || running}
                className="w-full py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold disabled:opacity-40 flex items-center justify-center gap-2" data-testid="build">
                {building ? <Loader className="animate-spin" size={13} /> : <Layers size={13} />} {af ? 'Bou een html-lêer' : 'Build the one html file'}
              </button>
              <button onClick={download} disabled={!fresh}
                className="w-full py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 disabled:opacity-40 flex items-center justify-center gap-2" data-testid="download">
                <Download size={13} /> {af ? 'Laai .html af' : 'Download .html'}{fresh ? ` (${(built!.bytes / 1048576).toFixed(1)} MB)` : ''}
              </button>
              <button onClick={saveToLibrary} disabled={!combined || !!saving || running}
                className="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-40 flex items-center justify-center gap-2">
                {saving ? <Loader className="animate-spin" size={13} /> : <Save size={13} />}
                {saving ? (af ? `Stoor klank ${saving.done} van ${saving.total}…` : `Saving audio ${saving.done} of ${saving.total}…`) : (af ? 'Stoor in biblioteek' : 'Save to library')}
              </button>
              {saved && <div className="rounded-xl p-2.5 text-[10px] bg-emerald-50 border border-emerald-100 text-emerald-800">{af ? `Gestoor as "${saved}" onder Biblioteek.` : `Saved as "${saved}" in the Library.`}</div>}
              <button onClick={exportVideo} disabled={!combined || exporting || running}
                className="w-full py-2 rounded-xl border border-violet-200 text-violet-700 text-xs font-bold hover:bg-violet-50 disabled:opacity-40 flex items-center justify-center gap-2">
                {exporting ? <Loader className="animate-spin" size={13} /> : <Film size={13} />} {af ? 'HyperFrames-video projek (.zip)' : 'HyperFrames video project (.zip)'}
              </button>
            </div>
          </div>

          {/* slides and the preview */}
          <div className="flex-1 min-h-0 min-w-0 flex flex-col bg-slate-50">
            <div className="flex-none px-4 py-2.5 bg-white border-b border-slate-100 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-600">
              <span className="brand-label text-[11px] text-slate-500">{af ? 'Skyfies' : 'Slides'}</span>
              <span><b className="text-emerald-700">{count('ready')}</b> {af ? 'gereed' : 'ready'}</span>
              {count('revoice') > 0 && <span><b className="text-amber-700">{count('revoice')}</b> {af ? 'ander stem' : 'other voice'}</span>}
              <span><b>{count('todo')}</b> {af ? 'nog te maak' : 'to produce'}</span>
              {tooLong > 0 && <span><b className="text-rose-700">{tooLong}</b> {af ? 'te lank' : 'too long'}</span>}
              {allReady && <span className="flex items-center gap-1 text-emerald-700 font-bold"><CheckCircle2 size={12} /> {af ? 'Alles gereed' : 'All ready'}</span>}
            </div>
            <div className={`${fresh ? 'h-40 md:h-48' : 'flex-1'} flex-none min-h-0 overflow-y-auto p-3 space-y-1.5`} data-testid="slide-list">
              {pages.map((p, i) => {
                const sz = slideSize(p.text);
                const st = statuses[i];
                const e = entries[p.id];
                const secs = e ? (Object.values(e.audio) as string[]).reduce<number>((n, u) => n + Math.max(0, (u.length * 0.75 - 44) / 48000), 0) : 0;
                return (
                  <div key={p.id} className={`bg-white rounded-xl border px-3 py-2 flex items-center gap-3 ${now?.index === i ? 'border-indigo-300 ring-2 ring-indigo-100' : 'border-slate-200'}`}>
                    <div className="w-7 h-7 flex-none rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">{i + 1}</div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-slate-800 truncate">{(e?.data.title as string) || p.text.trim().split(/\n/)[0].slice(0, 70) || '—'}</div>
                      <div className="text-[10px] text-slate-400">{sz.words} {af ? 'woorde' : 'words'} · {sz.chars} {af ? 'karakters' : 'characters'}{e && secs > 0 ? ` · ${mmss(secs)}` : ''}{p.text.trim() ? ` · ${modeFor(p) === 'explain' ? (af ? 'verduidelik' : 'explain') : (af ? 'lees' : 'read')}` : ''}</div>
                      {errors[p.id] && <div className="text-[10px] text-rose-600 mt-0.5">{errors[p.id]}</div>}
                    </div>
                    {now?.index === i ? <Loader className="animate-spin text-indigo-600" size={14} /> : chip(st)}
                  </div>
                );
              })}
            </div>
            {fresh ? (
              <div className="flex-1 min-h-0 border-t border-slate-200 flex flex-col">
                <div className="flex-none px-3 py-1.5 bg-white text-[11px] text-slate-500 flex items-center gap-2"><Clock3 size={12} /> {built!.included} {af ? 'skyfies in een les' : 'slides in one lesson'}{built!.skipped > 0 ? ` · ${built!.skipped} ${af ? 'nie ingesluit nie' : 'not included'}` : ''}</div>
                <iframe title="All slides" srcDoc={built!.html} className="flex-1 w-full border-0" />
              </div>
            ) : (
              <div className="flex-none px-4 pb-3 text-[11px] text-slate-400">{af ? 'Maak die skyfies, dan verskyn die hele les hier.' : 'Produce the slides and the whole lesson appears here.'}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
