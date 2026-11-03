import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { X, Library, Loader, Trash2, Download, Link2, Globe, Lock, Pencil, Check, AlertCircle, Play } from 'lucide-react';
import { LessonSummary, listLessons, deleteLesson, updateLesson, loadLesson, standaloneHtml, embedCode, embedUrl } from '../services/libraryService';
import { buildPlayerHtml, LessonData } from '../services/lessonPlayer';

interface Props {
  language: 'en' | 'af';
  onClose: () => void;
}

const fmtDuration = (s: number | null) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '-');
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export const LibraryModal: React.FC<Props> = ({ language, onClose }) => {
  const af = language === 'af';
  const [lessons, setLessons] = useState<LessonSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ id: string; html: string; data: LessonData; audio: Record<string, string> } | null>(null);
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLessons(await listLessons());
    } catch (e: any) {
      setError(e?.message || 'Could not load the library.');
      setLessons([]);
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const open = async (l: LessonSummary) => {
    setSelected(l.id);
    setBusyId(l.id);
    setError(null);
    setPreview(null);
    try {
      const { data, audio } = await loadLesson(l.id);
      setPreview({ id: l.id, html: buildPlayerHtml(data, audio), data, audio });
    } catch (e: any) {
      setError(e?.message || 'Could not open this lesson.');
    } finally {
      setBusyId(null);
    }
  };

  const download = async (l: LessonSummary) => {
    setBusyId(l.id);
    setError(null);
    try {
      const loaded = preview && preview.id === l.id ? preview : { ...(await loadLesson(l.id)), id: l.id, html: '' };
      const url = URL.createObjectURL(new Blob([standaloneHtml(loaded.data, loaded.audio)], { type: 'text/html' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${l.title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'les'}.html`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e: any) {
      setError(e?.message || 'Could not download this lesson.');
    } finally {
      setBusyId(null);
    }
  };

  const togglePublic = async (l: LessonSummary) => {
    setBusyId(l.id);
    try {
      const u = await updateLesson(l.id, { isPublic: !l.isPublic });
      setLessons((prev) => prev && prev.map((x) => (x.id === l.id ? u : x)));
    } catch (e: any) {
      setError(e?.message || 'Could not change sharing.');
    } finally {
      setBusyId(null);
    }
  };

  const saveTitle = async () => {
    if (!editing || !editing.title.trim()) return;
    try {
      const u = await updateLesson(editing.id, { title: editing.title });
      setLessons((prev) => prev && prev.map((x) => (x.id === u.id ? u : x)));
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

  const copy = async (text: string, key: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 1500); } catch { window.prompt(af ? 'Kopieer:' : 'Copy:', text); }
  };

  const sel = useMemo(() => lessons?.find((l) => l.id === selected) ?? null, [lessons, selected]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 anim-backdrop">
      <div className="anim-pop bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[92vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Library size={16} className="text-indigo-600" />
            <h2 className="text-sm font-extrabold text-slate-800">{af ? 'Biblioteek' : 'Lesson library'}</h2>
            {lessons && <span className="text-[11px] text-slate-400">{lessons.length}</span>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100" aria-label="Close"><X size={16} /></button>
        </div>

        {error && (
          <div className="mx-4 mt-3 bg-rose-50 border border-rose-100 rounded-xl p-2.5 text-[11px] text-rose-700 flex gap-2">
            <AlertCircle size={13} className="flex-none mt-0.5" /> <span>{error}</span>
          </div>
        )}

        <div className="flex-1 min-h-0 flex flex-col md:flex-row">
          <div className="md:w-96 flex-none border-b md:border-b-0 md:border-r border-slate-100 overflow-y-auto">
            {lessons === null ? (
              <div className="p-6 text-xs text-slate-500 flex items-center gap-2"><Loader size={13} className="animate-spin" /> {af ? 'Laai…' : 'Loading…'}</div>
            ) : lessons.length === 0 ? (
              <div className="p-6 text-xs text-slate-500 leading-relaxed">
                {af ? 'Nog geen lesse gestoor nie. Maak beelde by Skyfie-beelde en kies "Stoor in biblioteek".' : 'No lessons saved yet. Build visuals with Slide visuals, then choose "Save to library".'}
              </div>
            ) : (
              lessons.map((l) => (
                <div key={l.id} className={`px-4 py-3 border-b border-slate-50 ${selected === l.id ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}>
                  {editing?.id === l.id ? (
                    <div className="flex gap-1">
                      <input autoFocus value={editing.title} onChange={(e) => setEditing({ id: l.id, title: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && saveTitle()}
                        className="flex-1 min-w-0 px-2 py-1 rounded border border-slate-300 text-xs" maxLength={200} />
                      <button onClick={saveTitle} className="p-1 rounded bg-indigo-600 text-white" aria-label="Save name"><Check size={12} /></button>
                    </div>
                  ) : (
                    <button onClick={() => open(l)} className="w-full text-left">
                      <div className="flex items-start gap-2">
                        <Play size={12} className="flex-none mt-1 text-indigo-500" />
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-800 truncate">{l.title}</div>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            {fmtDate(l.createdAt)} · {fmtDuration(l.seconds)} · {l.lang === 'af' ? 'AFR' : 'ENG'}{l.voiceLabel ? ` · ${l.voiceLabel}` : ''}{l.slideLabel ? ` · ${l.slideLabel}` : ''}
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
                    <button onClick={() => setEditing({ id: l.id, title: l.title })} className="p-1 rounded hover:bg-slate-200 text-slate-500" title={af ? 'Hernoem' : 'Rename'}><Pencil size={12} /></button>
                    <button onClick={() => download(l)} className="p-1 rounded hover:bg-slate-200 text-slate-500" title={af ? 'Laai .html af' : 'Download .html'}><Download size={12} /></button>
                    <button onClick={() => remove(l)} className="p-1 rounded hover:bg-rose-100 text-rose-500" title={af ? 'Skrap' : 'Delete'}><Trash2 size={12} /></button>
                  </div>
                </div>
              ))
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
