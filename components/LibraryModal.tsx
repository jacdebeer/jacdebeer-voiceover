import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { X, Library, Loader, Trash2, Download, Link2, Globe, Lock, Pencil, Check, AlertCircle, Play, Volume2, FolderOpen, Folder, ChevronDown, ChevronRight, FileArchive, PenLine } from 'lucide-react';
import {
  LessonSummary, CollectionSummary, LibraryEditPayload, listLibrary, deleteLesson, updateLesson, loadLesson, loadAudioClip, loadForEditing, zipOfLessons,
  renameCollection, deleteCollection, standaloneHtml, embedCode, embedUrl,
} from '../services/libraryService';
import { buildPlayerHtml, LessonData } from '../services/lessonPlayer';
import { downloadBlob, safeName } from '../utils/zip';

interface Props {
  language: 'en' | 'af';
  onClose: () => void;
  /** reopen saved work in the studio */
  onEdit: (payload: LibraryEditPayload) => void;
}

const fmtDuration = (s: number | null) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '-');
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export const LibraryModal: React.FC<Props> = ({ language, onClose, onEdit }) => {
  const af = language === 'af';
  const [lessons, setLessons] = useState<LessonSummary[] | null>(null);
  const [collections, setCollections] = useState<CollectionSummary[]>([]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ id: string; html: string } | null>(null);
  const [editing, setEditing] = useState<{ id: string; title: string; collection?: boolean } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await listLibrary();
      setLessons(r.lessons);
      setCollections(r.collections);
    } catch (e: any) {
      setError(e?.message || 'Could not load the library.');
      setLessons([]);
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const inCollection = useCallback((cid: string) => (lessons ?? []).filter((l) => l.collectionId === cid).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)), [lessons]);
  const loose = useMemo(() => (lessons ?? []).filter((l) => !l.collectionId || !collections.some((c) => c.id === l.collectionId)), [lessons, collections]);
  const sel = useMemo(() => lessons?.find((l) => l.id === selected) ?? null, [lessons, selected]);

  const play = async (l: LessonSummary) => {
    setSelected(l.id);
    setBusyId(l.id);
    setError(null);
    setPreview(null);
    try {
      if (l.kind === 'audio') {
        const { source } = await loadLesson(l.id);
        const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
        setPreview({ id: l.id, html: `<body style="font-family:system-ui;padding:16px"><audio controls style="width:100%" src="/api/library/${l.id}/audio/0"></audio><p style="white-space:pre-wrap;font-size:14px;line-height:1.5">${esc(source?.slideText ?? '')}</p></body>` });
      } else {
        const { data, audio } = await loadLesson(l.id);
        setPreview({ id: l.id, html: buildPlayerHtml(data, audio) });
      }
    } catch (e: any) {
      setError(e?.message || 'Could not open this lesson.');
    } finally {
      setBusyId(null);
    }
  };

  const fileName = (title: string) => title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'les';
  const download = async (l: LessonSummary) => {
    setBusyId(l.id);
    setError(null);
    try {
      if (l.kind === 'audio') downloadBlob(await loadAudioClip(l.id), `${fileName(l.title)}.mp3`, 'audio/mpeg');
      else { const loaded = await loadLesson(l.id); downloadBlob(standaloneHtml(loaded.data as LessonData, loaded.audio), `${fileName(l.title)}.html`, 'text/html'); }
    } catch (e: any) {
      setError(e?.message || 'Could not download this lesson.');
    } finally {
      setBusyId(null);
    }
  };

  const downloadZip = async (c: CollectionSummary) => {
    const items = inCollection(c.id);
    setBusyId(c.id);
    setError(null);
    try {
      const files: Parameters<typeof zipOfLessons>[0] = [];
      for (let i = 0; i < items.length; i++) {
        setNote(af ? `Berei zip voor: ${i + 1} van ${items.length}…` : `Preparing the zip: ${i + 1} of ${items.length}…`);
        const it = items[i];
        if (it.kind === 'audio') files.push({ name: it.title, kind: 'audio', mp3: await loadAudioClip(it.id) });
        else { const l = await loadLesson(it.id); files.push({ name: it.title, kind: 'lesson', data: l.data as LessonData, audio: l.audio }); }
      }
      downloadBlob(await zipOfLessons(files), `${safeName(c.title, 'kolleksie')}.zip`, 'application/zip');
    } catch (e: any) {
      setError(e?.message || 'Could not build the zip.');
    } finally {
      setNote(null);
      setBusyId(null);
    }
  };

  const edit = async (items: LessonSummary[], kind: LibraryEditPayload['kind'], title: string, collectionId: string | null, busyKey: string) => {
    if (!items.length) return;
    setBusyId(busyKey);
    setError(null);
    try {
      const slides = await loadForEditing(items, (d, t) => setNote(af ? `Maak oop: ${d} van ${t}…` : `Opening: ${d} of ${t}…`));
      const lang: 'en' | 'af' = items[0].lang === 'en' ? 'en' : 'af';
      onEdit({ kind, title, collectionId, lang, slides });
    } catch (e: any) {
      setError(e?.message || 'Could not open this for editing.');
    } finally {
      setNote(null);
      setBusyId(null);
    }
  };

  const togglePublic = async (l: LessonSummary) => {
    setBusyId(l.id);
    try {
      const u = await updateLesson(l.id, { isPublic: !l.isPublic });
      setLessons((prev) => prev && prev.map((x) => (x.id === l.id ? { ...x, ...u } : x)));
    } catch (e: any) {
      setError(e?.message || 'Could not change sharing.');
    } finally {
      setBusyId(null);
    }
  };

  const saveTitle = async () => {
    if (!editing || !editing.title.trim()) return;
    try {
      if (editing.collection) {
        const c = await renameCollection(editing.id, editing.title);
        setCollections((prev) => prev.map((x) => (x.id === c.id ? c : x)));
      } else {
        const u = await updateLesson(editing.id, { title: editing.title });
        setLessons((prev) => prev && prev.map((x) => (x.id === u.id ? { ...x, ...u } : x)));
      }
      setEditing(null);
    } catch (e: any) {
      setError(e?.message || 'Could not rename.');
    }
  };

  const remove = async (l: LessonSummary) => {
    if (!window.confirm(af ? `Skrap "${l.title}"? Dit kan nie ongedaan gemaak word nie. Enige inbed-skakel hou ook op werk.` : `Delete "${l.title}"? This cannot be undone, and any embed link stops working.`)) return;
    setBusyId(l.id);
    try {
      await deleteLesson(l.id);
      setLessons((prev) => prev && prev.filter((x) => x.id !== l.id));
      if (selected === l.id) { setSelected(null); setPreview(null); }
    } catch (e: any) {
      setError(e?.message || 'Could not delete.');
    } finally {
      setBusyId(null);
    }
  };

  const removeCollection = async (c: CollectionSummary) => {
    const n = inCollection(c.id).length;
    if (!window.confirm(af ? `Skrap die kolleksie "${c.title}" en al ${n} skyfies daarin? Dit kan nie ongedaan gemaak word nie.` : `Delete the collection "${c.title}" and all ${n} slides in it? This cannot be undone.`)) return;
    setBusyId(c.id);
    try {
      await deleteCollection(c.id);
      setCollections((prev) => prev.filter((x) => x.id !== c.id));
      setLessons((prev) => prev && prev.filter((x) => x.collectionId !== c.id));
      if (sel?.collectionId === c.id) { setSelected(null); setPreview(null); }
    } catch (e: any) {
      setError(e?.message || 'Could not delete.');
    } finally {
      setBusyId(null);
    }
  };

  const copy = async (text: string, key: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 1500); } catch { window.prompt(af ? 'Kopieer:' : 'Copy:', text); }
  };

  const total = (lessons?.length ?? 0);
  const iconBtn = 'p-1 rounded hover:bg-slate-200 text-slate-500';

  const row = (l: LessonSummary, nested: boolean) => (
    <div key={l.id} className={`${nested ? 'pl-8 pr-4' : 'px-4'} py-3 border-b border-slate-50 ${selected === l.id ? 'bg-indigo-50' : 'hover:bg-slate-50'}`} data-testid={`item-${l.kind}`}>
      {editing?.id === l.id && !editing.collection ? (
        <div className="flex gap-1">
          <input autoFocus value={editing.title} onChange={(e) => setEditing({ id: l.id, title: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && saveTitle()}
            className="flex-1 min-w-0 px-2 py-1 rounded border border-slate-300 text-xs" maxLength={200} />
          <button onClick={saveTitle} className="p-1 rounded bg-indigo-600 text-white" aria-label="Save name"><Check size={12} /></button>
        </div>
      ) : (
        <button onClick={() => play(l)} className="w-full text-left">
          <div className="flex items-start gap-2">
            {l.kind === 'audio' ? <Volume2 size={12} className="flex-none mt-1 text-emerald-600" /> : <Play size={12} className="flex-none mt-1 text-indigo-500" />}
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-800 truncate">{l.title}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                {l.kind === 'audio' ? (af ? 'Net klank · ' : 'Audio only · ') : ''}{fmtDate(l.createdAt)} · {fmtDuration(l.seconds)} · {l.lang === 'af' ? 'AFR' : 'ENG'}{l.voiceLabel ? ` · ${l.voiceLabel}` : ''}{l.slideLabel && !nested ? ` · ${l.slideLabel}` : ''}
              </div>
            </div>
          </div>
        </button>
      )}
      <div className="flex items-center gap-1 mt-2 pl-5">
        {l.isPublic ? <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded px-1.5 py-0.5 flex items-center gap-1"><Globe size={9} /> {af ? 'Openbaar' : 'Public'}</span>
          : <span className="text-[9px] font-bold text-slate-500 bg-slate-100 rounded px-1.5 py-0.5 flex items-center gap-1"><Lock size={9} /> {af ? 'Privaat' : 'Private'}</span>}
        <span className="flex-1" />
        {busyId === l.id && <Loader size={12} className="animate-spin text-slate-400" />}
        {l.mode === 'combined' ? null : (
          <button onClick={() => edit([l], l.kind === 'audio' ? 'audio' : 'lesson', l.title, null, l.id)} className="p-1 rounded hover:bg-indigo-100 text-indigo-600" title={l.kind === 'audio' ? (af ? 'Laai in die ateljee as nuwe skyfie' : 'Load into the studio as a new slide') : (af ? 'Maak oop in die ateljee om te wysig' : 'Open in the studio to edit')} data-testid="edit-item"><PenLine size={12} /></button>
        )}
        <button onClick={() => setEditing({ id: l.id, title: l.title })} className={iconBtn} title={af ? 'Hernoem' : 'Rename'}><Pencil size={12} /></button>
        <button onClick={() => download(l)} className={iconBtn} title={l.kind === 'audio' ? (af ? 'Laai .mp3 af' : 'Download .mp3') : (af ? 'Laai .html af' : 'Download .html')}><Download size={12} /></button>
        <button onClick={() => remove(l)} className="p-1 rounded hover:bg-rose-100 text-rose-500" title={af ? 'Skrap' : 'Delete'}><Trash2 size={12} /></button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 anim-backdrop">
      <div className="anim-pop bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[92vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Library size={16} className="text-indigo-600" />
            <h2 className="text-sm font-extrabold text-slate-800">{af ? 'Biblioteek' : 'Lesson library'}</h2>
            {lessons && <span className="text-[11px] text-slate-400">{total}</span>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100" aria-label="Close"><X size={16} /></button>
        </div>

        {error && (
          <div className="mx-4 mt-3 bg-rose-50 border border-rose-100 rounded-xl p-2.5 text-[11px] text-rose-700 flex gap-2">
            <AlertCircle size={13} className="flex-none mt-0.5" /> <span>{error}</span>
          </div>
        )}
        {note && <div className="mx-4 mt-3 bg-indigo-50 border border-indigo-100 rounded-xl p-2.5 text-[11px] text-indigo-700 flex gap-2 items-center"><Loader size={12} className="animate-spin" /> {note}</div>}

        <div className="flex-1 min-h-0 flex flex-col md:flex-row">
          <div className="md:w-96 flex-none border-b md:border-b-0 md:border-r border-slate-100 overflow-y-auto" data-testid="library-list">
            {lessons === null ? (
              <div className="p-6 text-xs text-slate-500 flex items-center gap-2"><Loader size={13} className="animate-spin" /> {af ? 'Laai…' : 'Loading…'}</div>
            ) : total === 0 && !collections.length ? (
              <div className="p-6 text-xs text-slate-500 leading-relaxed">
                {af ? 'Nog niks gestoor nie. Maak beelde by Skyfie-beelde of Alle skyfies en kies "Stoor in biblioteek", of stoor die klank van \'n skyfie.' : 'Nothing saved yet. Build visuals with Slide visuals or All slides and choose "Save to library", or save the audio of a slide.'}
              </div>
            ) : (
              <>
                {collections.map((c) => {
                  const items = inCollection(c.id);
                  const isOpen = open[c.id] ?? false;
                  return (
                    <div key={c.id} className="border-b border-slate-100" data-testid="collection">
                      <div className="px-4 py-3 bg-slate-50/70">
                        {editing?.id === c.id && editing.collection ? (
                          <div className="flex gap-1">
                            <input autoFocus value={editing.title} onChange={(e) => setEditing({ id: c.id, title: e.target.value, collection: true })} onKeyDown={(e) => e.key === 'Enter' && saveTitle()}
                              className="flex-1 min-w-0 px-2 py-1 rounded border border-slate-300 text-xs" maxLength={200} />
                            <button onClick={saveTitle} className="p-1 rounded bg-indigo-600 text-white" aria-label="Save name"><Check size={12} /></button>
                          </div>
                        ) : (
                          <button onClick={() => setOpen((o) => ({ ...o, [c.id]: !isOpen }))} className="w-full text-left flex items-start gap-2">
                            {isOpen ? <ChevronDown size={13} className="mt-0.5 text-slate-400" /> : <ChevronRight size={13} className="mt-0.5 text-slate-400" />}
                            {isOpen ? <FolderOpen size={14} className="mt-0.5 text-amber-600" /> : <Folder size={14} className="mt-0.5 text-amber-600" />}
                            <div className="min-w-0">
                              <div className="text-xs font-extrabold text-slate-800 truncate">{c.title}</div>
                              <div className="text-[10px] text-slate-500">{items.length} {af ? 'skyfies' : 'slides'} · {fmtDate(c.createdAt)} · {c.lang === 'af' ? 'AFR' : 'ENG'}</div>
                            </div>
                          </button>
                        )}
                        <div className="flex items-center gap-1 mt-2 pl-5">
                          <span className="flex-1" />
                          {busyId === c.id && <Loader size={12} className="animate-spin text-slate-400" />}
                          <button onClick={() => edit(items, 'collection', c.title, c.id, c.id)} disabled={!items.length || busyId === c.id} className="px-1.5 py-1 rounded hover:bg-indigo-100 text-indigo-600 text-[10px] font-bold flex items-center gap-1 disabled:opacity-40" title={af ? 'Maak al die skyfies oop in die ateljee om te wysig' : 'Open all the slides in the studio to edit'} data-testid="edit-collection"><PenLine size={12} /> {af ? 'Wysig' : 'Edit'}</button>
                          <button onClick={() => downloadZip(c)} disabled={!items.length || busyId === c.id} className={`${iconBtn} disabled:opacity-40`} title={af ? 'Laai al die skyfies as .zip af' : 'Download all the slides as a .zip'} data-testid="zip-collection"><FileArchive size={12} /></button>
                          <button onClick={() => setEditing({ id: c.id, title: c.title, collection: true })} className={iconBtn} title={af ? 'Hernoem' : 'Rename'}><Pencil size={12} /></button>
                          <button onClick={() => removeCollection(c)} className="p-1 rounded hover:bg-rose-100 text-rose-500" title={af ? 'Skrap kolleksie' : 'Delete collection'}><Trash2 size={12} /></button>
                        </div>
                      </div>
                      {isOpen && items.map((l) => row(l, true))}
                    </div>
                  );
                })}
                {loose.map((l) => row(l, false))}
              </>
            )}
          </div>

          <div className="flex-1 min-h-0 flex flex-col bg-slate-50">
            {sel && (
              <div className="flex-none bg-white border-b border-slate-100 px-4 py-2.5 space-y-2">
                <label className="flex items-center gap-2 text-[11px] font-bold text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={sel.isPublic} onChange={() => togglePublic(sel)} disabled={busyId === sel.id} />
                  {af ? 'Openbare inbed-skakel (enigiemand met die skakel kan dit speel)' : 'Public embed link (anyone with the link can play it)'}
                </label>
                {sel.isPublic ? (
                  <div className="space-y-1">
                    <div className="flex gap-1.5 items-center">
                      <code className="flex-1 min-w-0 truncate text-[10px] bg-slate-100 rounded px-2 py-1">{embedCode(sel.publicToken)}</code>
                      <button onClick={() => copy(embedCode(sel.publicToken), 'code')} className="flex-none text-[10px] font-bold px-2 py-1 rounded border border-slate-200 hover:bg-slate-50 flex items-center gap-1"><Link2 size={10} /> {copied === 'code' ? (af ? 'Gekopieer' : 'Copied') : (af ? 'Kopieer inbed-kode' : 'Copy embed code')}</button>
                      <button onClick={() => copy(embedUrl(sel.publicToken), 'url')} className="flex-none text-[10px] font-bold px-2 py-1 rounded border border-slate-200 hover:bg-slate-50">{copied === 'url' ? (af ? 'Gekopieer' : 'Copied') : (af ? 'Skakel' : 'Link')}</button>
                    </div>
                    <div className="text-[10px] text-slate-500">{af ? 'Skakel af die kontrolekassie om dit weer privaat te maak. Die skakel hou dan dadelik op werk.' : 'Untick the box to make it private again. The link then stops working at once.'}</div>
                  </div>
                ) : (
                  <div className="text-[10px] text-slate-500">{af ? 'Privaat: net jy kan dit sien.' : 'Private: only you can see it.'}</div>
                )}
              </div>
            )}
            <div className="flex-1 min-h-0">
              {preview ? (
                <iframe title="Saved lesson" srcDoc={preview.html} className="w-full h-full border-0" />
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-slate-400 p-6 text-center">
                  {busyId && selected ? (<span className="flex items-center gap-2"><Loader size={13} className="animate-spin" /> {af ? 'Maak les oop…' : 'Opening the lesson…'}</span>) : (af ? 'Kies \'n les om te speel.' : 'Choose a lesson to play it.')}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
