import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Layers, Loader, Download, Save, AlertCircle, CheckCircle2, Wand2, Volume2, Scissors, Clock3, Maximize2, Minimize2 } from 'lucide-react';
import { CoursePage, VoiceOption } from '../types';
import { LessonData, buildPlayerHtml, forDisplay, spokenLines } from '../services/lessonPlayer';
import { produceSlide, autoMode, narrateLines, VisualsLevel, VisualsMode } from '../services/visualsService';
import { mergeLessons, mergeAudio } from '../services/lessonMerge';
import { exampleContext } from '../services/lessonContext';
import { compressAudio, saveLesson } from '../services/libraryService';
import { isAfrikaansText } from '../utils/language';
import { slideSize, SLIDE_LIMITS } from '../utils/slideBalance';
import { VisualsEntry } from './VisualsModal';
import { useFullscreen } from '../utils/useFullscreen';
import { LessonChat } from './LessonChat';
import { needsNewVoice, ChatProposal, LessonTimeline, LessonPos } from '../services/chatService';

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

// a small id per object, so a change to a slide's lesson or audio shows up in the key that decides when the file is rebuilt
const sigs = new WeakMap<object, number>();
let sigCount = 0;
const sigOf = (o: object) => { let v = sigs.get(o); if (v === undefined) { v = ++sigCount; sigs.set(o, v); } return v; };

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

export const AllSlidesModal: React.FC<Props> = ({ pages, language, voice, entries, onEntry, onBalance, onClose }) => {
  const af = language === 'af';
  const { ref: winRef, full, toggle: toggleFull } = useFullscreen<HTMLDivElement>();
  const [level, setLevel] = useState<VisualsLevel>('univ');
  const [currency, setCurrency] = useState('R');
  const [modeChoice, setModeChoice] = useState<'auto' | VisualsMode>('auto');
  const [brand, setBrand] = useState(() => { try { return localStorage.getItem('brand-on') !== '0'; } catch { return true; } });
  // the words inside the finished lesson follow the language of the lesson, not the language of this window
  const [titleText, setTitleText] = useState<string | null>(null);
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
    if (e && e.slideText === p.text && e.lang === langFor(p) && (e.mode ?? 'read') === modeFor(p)) return e.voiceId === voice.id && e.report?.mode !== 'lines' ? 'ready' : 'revoice';
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
      // the lessons of the slides before this one: the next slide continues the same example figures
      const made: LessonData[] = [];
      for (let i = 0; i < pages.length; i++) {
        const p = pages[i];
        const st = statuses[i];
        if (st === 'ready' && entries[p.id]) { made.push(entries[p.id].data); continue; }
        if (st !== 'todo' && st !== 'revoice') continue;
        if (ctl.signal.aborted) throw new DOMException('Stopped', 'AbortError');
        const lang = langFor(p);
        const mode = modeFor(p);
        setNow({ index: i, phase: 'visuals', sub: '', done: 0, total: 1 });
        try {
          const prev = entries[p.id];
          const { data, audio, report } = await produceSlide(
            { text: p.text, lang, level, currency, mode, voice, reuse: st === 'revoice' && prev ? prev.data : null, context: st === 'todo' ? exampleContext(made) : undefined },
            (phase, done, total, sub) => setNow({ index: i, phase, sub, done, total }),
            ctl.signal,
          );
          onEntry(p.id, { data, audio, report, slideText: p.text, voiceId: voice.id, lang, mode });
          made.push(data);
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
  // ---- the chat: edits the lesson as a whole, by the time in the video
  const playerRef = useRef<HTMLIFrameElement>(null);
  const [timeline, setTimeline] = useState<LessonTimeline | null>(null);
  const [pos, setPos] = useState<LessonPos | null>(null);
  const [editing, setEditing] = useState<{ label: string; phase: string; done: number; total: number } | null>(null);
  const [needBuild, setNeedBuild] = useState(false);
  const [history, setHistory] = useState<{ entries: Record<number, VisualsEntry>; titleText: string | null }[]>([]);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (!playerRef.current || e.source !== playerRef.current.contentWindow) return;
      if (e.data?.lessonTimeline) setTimeline(e.data.lessonTimeline as LessonTimeline);
      if (e.data?.lessonPos) setPos(e.data.lessonPos as LessonPos);
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);
  const [built, setBuilt] = useState<{ html: string; bytes: number; included: number; skipped: number; key: string } | null>(null);
  const [building, setBuilding] = useState(false);
  const ready = pages.map((p, i) => ({ p, i, e: entries[p.id], ok: statuses[i] === 'ready' || statuses[i] === 'revoice' })).filter((x) => x.ok && x.e);
  // the language of the lesson itself (what the model wrote), not of this window
  const firstLang = ready[0]?.e.data.lang;
  const lessonLang: 'en' | 'af' = firstLang === 'af' || firstLang === 'en' ? firstLang : ready[0]?.e.lang ?? language;
  const defaultTitle = lessonLang === 'af' ? 'Alle skyfies' : 'All slides';
  const title = titleText ?? defaultTitle;
  const key = [title, brand, lessonLang, ...ready.map((x) => `${x.p.id}:${x.e.slideText.length}:${x.e.voiceId}:${sigOf(x.e.data)}:${sigOf(x.e.audio)}`)].join('|');
  const combined = useMemo(() => {
    if (!ready.length) return null;
    const label = (i: number) => `${lessonLang === 'af' ? 'Skyfie' : 'Slide'} ${i + 1}`;
    const data: LessonData = mergeLessons(ready.map((x) => ({ label: label(x.i), data: x.e.data })), { title: title.trim() || defaultTitle, subtitle: `${ready.length} ${lessonLang === 'af' ? 'skyfies' : 'slides'}`, brand });
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
  // after a chat edit the file is built again
  useEffect(() => {
    if (needBuild && combined && !running && !editing) { setNeedBuild(false); void build(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needBuild, combined]);

  const sliceLabel = (i: number) => `${lessonLang === 'af' ? 'Skyfie' : 'Slide'} ${i + 1}`;

  /** The chat changed the whole lesson: hand every beat back to the slide it belongs to, and voice again only the slides whose words changed. */
  const applyEdit = async (proposal: ChatProposal) => {
    if (!combined) return;
    const next = proposal.lesson;
    let lastGroup = sliceLabel(ready[0].i);
    const beats = (next.beats ?? []).map((b) => { const g = (b.group as string) || lastGroup; lastGroup = g; return { ...b, group: g }; });
    const labels = ready.map((x) => sliceLabel(x.i));
    const bySlide = new Map<string, any[]>(labels.map((l) => [l, []] as [string, any[]]));
    for (const b of beats) {
      const arr = bySlide.get(b.group as string);
      if (!arr) throw new Error(af ? 'Die verandering raak \'n skyfie wat nie in die les is nie.' : 'The change touches a slide that is not in the lesson.');
      const { group: _g, ...rest } = b;
      arr.push(rest);
    }
    if ([...bySlide.values()].some((a) => !a.length)) throw new Error(af ? 'Elke skyfie moet minstens een deel hê.' : 'Every slide needs at least one section.');

    const pron = (next.pronunciations as Record<string, string> | undefined) ?? {};
    const oldPron = (combined.data.pronunciations as Record<string, string> | undefined) ?? {};
    const changedWords = Array.from(new Set([...Object.keys(pron), ...Object.keys(oldPron)])).filter((w) => pron[w] !== oldPron[w]);
    const plan = ready.map((x, k) => {
      const old = forDisplay(x.e.data);
      const nd: LessonData = { ...x.e.data, beats: bySlide.get(labels[k]) as LessonData['beats'] };
      if (Object.keys(pron).length) nd.pronunciations = pron; else delete nd.pronunciations;
      const words = spokenLines(nd).join(' ').toLowerCase();
      const revoice = spokenLines(nd).join('\n') !== spokenLines(old).join('\n') || changedWords.some((w) => w && words.includes(w.toLowerCase()));
      const touched = revoice || JSON.stringify(nd.beats) !== JSON.stringify(old.beats);
      return { x, nd, revoice, touched };
    });
    const titleChanged = typeof next.title === 'string' && next.title !== combined.data.title;
    if (!plan.some((p) => p.touched) && !titleChanged) return;

    const ctl = new AbortController();
    abortRef.current = ctl;
    const results: { id: number; entry: VisualsEntry }[] = [];
    try {
      const todo = plan.filter((p) => p.revoice);
      let n = 0;
      for (const p of plan) {
        if (!p.touched) continue;
        if (p.revoice) {
          n++;
          setEditing({ label: sliceLabel(p.x.i), phase: 'take', done: n, total: todo.length });
          const { audio, report } = await narrateLines(p.nd, voice, p.x.e.lang === 'af', (done, total, ph) => setEditing({ label: sliceLabel(p.x.i), phase: ph, done: n, total: todo.length }), ctl.signal, p.nd.pronunciations as Record<string, string> | undefined);
          results.push({ id: p.x.p.id, entry: { ...p.x.e, data: p.nd, audio, report, voiceId: voice.id, edited: true } });
        } else {
          results.push({ id: p.x.p.id, entry: { ...p.x.e, data: p.nd, edited: true } });
        }
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') throw new Error(af ? 'Gestop. Niks is verander nie.' : 'Stopped. Nothing was changed.');
      if (e?.isQuotaExceeded) throw new Error(e.message && e.message !== 'QUOTA_EXCEEDED' ? `${e.message} Nothing was changed.` : 'The narrator voice has reached its quota. Nothing was changed.');
      throw e;
    } finally {
      setEditing(null);
      abortRef.current = null;
    }
    // every slide is ready: change them together
    const snap: Record<number, VisualsEntry> = {};
    for (const r of results) snap[r.id] = entries[r.id];
    setHistory((h) => [...h.slice(-2), { entries: snap, titleText }]);
    for (const r of results) onEntry(r.id, r.entry);
    if (titleChanged) setTitleText(String(next.title));
    setNeedBuild(true);
  };
  const undoEdit = () => {
    const last = history[history.length - 1];
    if (!last) return;
    for (const [id, entry] of Object.entries(last.entries)) onEntry(Number(id), entry);
    setTitleText(last.titleText);
    setHistory((h) => h.slice(0, -1));
    setNeedBuild(true);
  };
  const allRead = ready.length > 0 && ready.every((x) => (x.e.mode ?? 'read') === 'read');

  const download = () => {
    if (!built) return;
    const url = URL.createObjectURL(new Blob([built.html], { type: 'text/html' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'all-slides.html';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const [saving, setSaving] = useState<{ done: number; total: number } | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const saveToLibrary = async () => {
    if (!combined) return;
    setSaving({ done: 0, total: 0 });
    setSaved(null);
    try {
      await saveLesson(
        { title: title.trim() || defaultTitle, slideLabel: defaultTitle, voiceLabel: voice.label, lang: ready[0].e.lang, mode: 'combined', data: combined.data, audio: combined.audio },
        (done, total) => setSaving({ done, total }),
      );
      setSaved(title.trim() || defaultTitle);
    } catch (e: any) {
      setNotice(e?.message || 'Could not save the lesson.');
    } finally {
      setSaving(null);
    }
  };

  const chip = (s: Status) => {
    const map: Record<Status, [string, string]> = {
      ready: [af ? 'Gereed' : 'Ready', 'bg-emerald-50 text-emerald-700 border-emerald-100'],
      revoice: [af ? 'Stem weer nodig' : 'Voice again', 'bg-amber-50 text-amber-800 border-amber-100'],
      todo: [af ? 'Moet gemaak word' : 'To produce', 'bg-slate-50 text-slate-600 border-slate-200'],
      toolong: [af ? 'Te lank' : 'Too long', 'bg-rose-50 text-rose-700 border-rose-100'],
      empty: [af ? 'Leeg' : 'Empty', 'bg-slate-50 text-slate-400 border-slate-100'],
    };
    return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${map[s][1]}`}>{map[s][0]}</span>;
  };

  return (
    <div className={`fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center ${full ? 'p-0' : 'p-4'} anim-backdrop`} role="dialog" aria-label={af ? 'Alle skyfies in een html' : 'All slides in one html file'}>
      <div ref={winRef} className={`bg-white shadow-2xl w-full flex flex-col overflow-hidden anim-pop ${full ? 'h-screen max-w-none rounded-none' : 'max-w-6xl h-[92vh] rounded-2xl'}`}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <div>
            <h2 className="text-lg text-indigo-600">{af ? 'Alle skyfies in een html-lêer' : 'All slides in one html file'}</h2>
            <p className="text-[11px] text-slate-500 flex items-center gap-1"><Volume2 size={11} /> {voice.label} · {pages.length} {af ? 'skyfies' : 'slides'}</p>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={toggleFull} className="p-1.5 rounded-lg hover:bg-slate-100" aria-label={full ? 'Exit full screen' : 'Full screen'} title={full ? 'Exit full screen (Esc)' : 'Full screen'} data-testid="fullscreen">
              {full ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button onClick={() => { abortRef.current?.abort(); onClose(); }} className="p-1.5 rounded-lg hover:bg-slate-100" aria-label="Close"><X size={16} /></button>
          </div>
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
              <input value={title} onChange={(e) => setTitleText(e.target.value)} maxLength={120} className="mt-1 w-full px-2 py-1.5 rounded-lg border border-slate-300 text-xs" />
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
                <div className="h-1.5 rounded bg-indigo-100 overflow-hidden"><div className="h-full bg-indigo-600 anim-shimmer transition-all duration-500" style={{ width: `${Math.round((statuses.slice(0, now.index).filter((s) => s === 'ready').length / Math.max(1, usable.length)) * 100)}%` }} /></div>
              </div>
            )}
            {editing && (
              <div className="bg-indigo-50 rounded-xl p-3 border border-indigo-100 text-[11px] text-indigo-700 font-bold space-y-1" data-testid="editing-progress">
                <div className="flex items-center gap-2"><Loader className="animate-spin" size={12} /> {editing.label}: {af ? 'neem die stem weer op' : 'voicing again'} ({editing.done}/{editing.total})</div>
                <div className="font-normal">{af ? 'Net die skyfies waarvan die woorde verander het.' : 'Only the slides whose words changed.'}</div>
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
            </div>
          </div>

          {/* slides and the preview */}
          <div className="flex-1 min-h-0 min-w-0 flex flex-col bg-slate-50">
            <div className="flex-none px-4 py-2.5 bg-white border-b border-slate-100 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-600">
              <span className="brand-label text-[11px] text-slate-500">{af ? 'Skyfies' : 'Slides'}</span>
              <span><b className="text-emerald-700">{count('ready')}</b> {af ? 'gereed' : 'ready'}</span>
              {count('revoice') > 0 && <span title={af ? 'Ander verteller, of nie in een deurlopende opname gemaak nie' : 'Another narrator, or not made as one continuous take'}><b className="text-amber-700">{count('revoice')}</b> {af ? 'stem weer nodig' : 'voice again'}</span>}
              <span><b>{count('todo')}</b> {af ? 'nog te maak' : 'to produce'}</span>
              {tooLong > 0 && <span><b className="text-rose-700">{tooLong}</b> {af ? 'te lank' : 'too long'}</span>}
              {allReady && <span className="flex items-center gap-1 text-emerald-700 font-bold"><CheckCircle2 size={12} /> {af ? 'Alles gereed' : 'All ready'}</span>}
            </div>
            <div className={`${built ? 'h-40 md:h-48' : 'flex-1'} flex-none min-h-0 overflow-y-auto p-3 space-y-1.5`} data-testid="slide-list">
              {pages.map((p, i) => {
                const sz = slideSize(p.text);
                const st = statuses[i];
                const e = entries[p.id];
                const secs = e ? (Object.values(e.audio) as string[]).reduce<number>((n, u) => n + Math.max(0, (u.length * 0.75 - 44) / 48000), 0) : 0;
                return (
                  <div key={p.id} style={{ animationDelay: `${Math.min(i, 14) * 30}ms` }} className={`anim-fade-up bg-white rounded-xl border px-3 py-2 flex items-center gap-3 transition-shadow ${now?.index === i ? 'border-indigo-300 ring-2 ring-indigo-100' : 'border-slate-200'}`}>
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
            {built ? (
              <div className="flex-1 min-h-0 border-t border-slate-200 flex flex-col">
                <div className="flex-none px-3 py-1.5 bg-white text-[11px] text-slate-500 flex items-center gap-2"><Clock3 size={12} /> {built!.included} {af ? 'skyfies in een les' : 'slides in one lesson'}{built!.skipped > 0 ? ` · ${built!.skipped} ${af ? 'nie ingesluit nie' : 'not included'}` : ''}</div>
                <iframe ref={playerRef} title="All slides" srcDoc={built!.html} className="flex-1 w-full border-0" onLoad={() => playerRef.current?.contentWindow?.postMessage('lesson-timeline?', '*')} />
              </div>
            ) : (
              <div className="flex-none px-4 pb-3 text-[11px] text-slate-400">{af ? 'Maak die skyfies, dan verskyn die hele les hier.' : 'Produce the slides and the whole lesson appears here.'}</div>
            )}
          </div>

          {built && combined && (
            <div className="md:w-80 flex-none h-[60vh] md:h-auto border-t md:border-t-0 md:border-l border-slate-100" data-testid="all-chat">
              <LessonChat af={af} lesson={combined.data} lang={lessonLang} mode={allRead ? 'read' : 'explain'} busy={running || building || !!editing}
                canUndo={history.length > 0} timeline={timeline} pos={pos} onApply={applyEdit} onUndo={undoEdit} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
