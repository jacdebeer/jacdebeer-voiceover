import { LessonData, buildPlayerHtml, spokenLines } from './lessonPlayer';
import { pcmToMp3 } from '../utils/mp3';
import { bytesToBase64 } from '../utils/audioClean';

export interface LessonSummary {
  id: string;
  /** lesson: visuals + voice. audio: the voice-over of one slide */
  kind: 'lesson' | 'audio';
  collectionId: string | null;
  position: number | null;
  title: string;
  lang: string;
  mode: string | null;
  voiceLabel: string | null;
  slideLabel: string | null;
  words: number | null;
  seconds: number | null;
  clipCount: number;
  isPublic: boolean;
  publicToken: string;
  createdAt: string;
}

/** The saved version(s) the open project came from, so saving again can update them instead of making copies. */
export interface LibraryLink { collectionId: string | null; title: string; slides: Record<number, { id: string; token: string }> }

export interface CollectionSummary { id: string; title: string; lang: string; createdAt: string }

/** What a lesson was made from, so it can be opened again in the studio. */
export interface LessonSource { slideText: string; mode?: string; voiceId?: string; lang?: string }

async function api(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(path, init);
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error('Your session has ended. Sign in again.');
  if (!res.ok) throw new Error(body.error || `Request failed (HTTP ${res.status}).`);
  return body;
}

const jsonInit = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export async function listLibrary(): Promise<{ lessons: LessonSummary[]; collections: CollectionSummary[] }> {
  const r = await api('/api/library');
  return { lessons: (r.lessons ?? []) as LessonSummary[], collections: (r.collections ?? []) as CollectionSummary[] };
}
export async function createCollection(title: string, lang: 'en' | 'af'): Promise<CollectionSummary> {
  return (await api('/api/library/collections', jsonInit('POST', { title, lang }))) as CollectionSummary;
}
export async function renameCollection(id: string, title: string): Promise<CollectionSummary> {
  return (await api(`/api/library/collections/${id}`, jsonInit('PATCH', { title }))) as CollectionSummary;
}
export async function deleteCollection(id: string): Promise<void> {
  await api(`/api/library/collections/${id}`, { method: 'DELETE' });
}
export async function deleteLesson(id: string): Promise<void> {
  await api(`/api/library/${id}`, { method: 'DELETE' });
}
export async function updateLesson(id: string, patch: { title?: string; isPublic?: boolean }): Promise<LessonSummary> {
  return (await api(`/api/library/${id}`, jsonInit('PATCH', patch))) as LessonSummary;
}

export const embedUrl = (token: string) => `${location.origin}/api/embed/${token}`;
export const embedCode = (token: string) =>
  `<iframe src="${embedUrl(token)}" width="100%" height="720" style="border:0" loading="lazy" title="Les"></iframe>`;

/** The WAV data URI a finished lesson carries per line, back to raw 24 kHz PCM. */
function wavUriToPcm(uri: string): Uint8Array {
  const bin = atob(uri.slice(uri.indexOf(',') + 1));
  const bytes = new Uint8Array(bin.length - 44);
  for (let i = 44; i < bin.length; i++) bytes[i - 44] = bin.charCodeAt(i);
  return bytes;
}

const wordCount = (data: LessonData) => spokenLines(data).join(' ').split(/\s+/).filter(Boolean).length;

/**
 * Saves a finished lesson. Each line's audio is compressed to MP3 and sent on its own, so no request is large; the embed page
 * is built last (it needs the lesson's public token) and the lesson only appears in the library once everything has arrived.
 */
export async function saveLesson(
  input: {
    title: string; slideLabel: string; voiceLabel: string; lang: 'en' | 'af'; mode?: string; data: LessonData; audio: Record<string, string>;
    collectionId?: string | null; position?: number; source?: LessonSource;
    /** editing a saved lesson: the new version takes its place and keeps its embed link and sharing */
    replace?: { id: string; token: string };
  },
  onProgress: (done: number, total: number, phase: string) => void,
): Promise<{ id: string; token: string }> {
  const lines = Array.from(new Set(spokenLines(input.data))).filter((l) => input.audio[l]);
  const total = lines.length;
  let seconds = 0;
  for (const l of lines) seconds += (atob(input.audio[l].slice(input.audio[l].indexOf(',') + 1)).length - 44) / 48000;

  onProgress(0, total, 'create');
  const created = await api('/api/library', jsonInit('POST', {
    title: input.title,
    slideLabel: input.slideLabel,
    voiceLabel: input.voiceLabel,
    lang: input.lang,
    mode: input.mode,
    words: wordCount(input.data),
    seconds: Math.round(seconds * 10) / 10,
    clipCount: total,
    collectionId: input.collectionId ?? undefined,
    position: input.position,
    source: input.source,
    // which clip belongs to which line, so opening the lesson later needs no guessing
    lesson: { ...input.data, audioIndex: Object.fromEntries(lines.map((l, i) => [l, i])) },
  }));

  try {
    const urls: Record<string, string> = {};
    let done = 0;
    let next = 0;
    const worker = async () => {
      while (next < total) {
        const idx = next++;
        const mp3 = await pcmToMp3(wavUriToPcm(input.audio[lines[idx]]));
        await api(`/api/library/${created.id}/audio/${idx}`, { method: 'PUT', headers: { 'Content-Type': 'audio/mpeg' }, body: mp3 as BodyInit });
        urls[lines[idx]] = `${embedUrl(input.replace?.token ?? created.token)}/audio/${idx}`;
        onProgress(++done, total, 'audio');
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    onProgress(total, total, 'finish');
    await api(`/api/library/${created.id}/finish`, jsonInit('POST', { html: buildPlayerHtml(input.data, urls), replaces: input.replace?.id }));
  } catch (e) {
    // do not leave a half-saved lesson behind
    await fetch(`/api/library/${created.id}`, { method: 'DELETE' }).catch(() => {});
    throw e;
  }
  return { id: created.id, token: input.replace?.token ?? created.token };
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The page behind the embed link of a saved voice-over: the text and a player. */
function audioPageHtml(title: string, text: string, src: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>` +
    `<style>body{font-family:system-ui,sans-serif;margin:0;padding:16px;color:#1e293b}h1{font-size:16px;margin:0 0 10px}audio{width:100%}p{white-space:pre-wrap;font-size:14px;line-height:1.5}</style></head>` +
    `<body><h1>${esc(title)}</h1><audio controls preload="metadata" src="${esc(src)}"></audio><p>${esc(text)}</p></body></html>`;
}

/** Saves the voice-over of one slide (no visuals): its text and one MP3 clip. */
export async function saveAudio(
  input: { title: string; text: string; pcm: Uint8Array; lang: 'en' | 'af'; voiceLabel: string; slideLabel: string; collectionId?: string | null; position?: number },
  onProgress?: (phase: string) => void,
): Promise<{ id: string; token: string }> {
  const seconds = input.pcm.length / 48000;
  onProgress?.('create');
  const created = await api('/api/library', jsonInit('POST', {
    kind: 'audio', title: input.title, slideLabel: input.slideLabel, voiceLabel: input.voiceLabel, lang: input.lang,
    words: input.text.split(/\s+/).filter(Boolean).length, seconds: Math.round(seconds * 10) / 10, clipCount: 1,
    collectionId: input.collectionId ?? undefined, position: input.position,
    lesson: { kind: 'audio', text: input.text, audioIndex: { audio: 0 } },
    source: { slideText: input.text, lang: input.lang },
  }));
  try {
    onProgress?.('audio');
    const mp3 = await pcmToMp3(input.pcm);
    await api(`/api/library/${created.id}/audio/0`, { method: 'PUT', headers: { 'Content-Type': 'audio/mpeg' }, body: mp3 as BodyInit });
    await api(`/api/library/${created.id}/finish`, jsonInit('POST', { html: audioPageHtml(input.title, input.text, `${embedUrl(created.token)}/audio/0`) }));
  } catch (e) {
    await fetch(`/api/library/${created.id}`, { method: 'DELETE' }).catch(() => {});
    throw e;
  }
  return { id: created.id, token: created.token };
}

/** The saved clip of a voice-over as MP3 bytes. */
export async function loadAudioClip(id: string): Promise<Uint8Array> {
  const res = await fetch(`/api/library/${id}/audio/0`);
  if (!res.ok) throw new Error('Could not load the audio.');
  return new Uint8Array(await res.arrayBuffer());
}

/** Opens a saved lesson: its data plus every clip as a data URI, ready for the player. */
export async function loadLesson(id: string): Promise<{ summary: LessonSummary; data: LessonData; audio: Record<string, string>; source: LessonSource | null }> {
  const doc = await api(`/api/library/${id}`);
  const { audioIndex, ...data } = doc.lesson as LessonData & { audioIndex?: Record<string, number> };
  const audio: Record<string, string> = {};
  for (const [line, idx] of Object.entries(audioIndex ?? {})) {
    const res = await fetch(`/api/library/${id}/audio/${idx}`);
    if (!res.ok) throw new Error(`Could not load audio clip ${idx + 1} of ${doc.clipCount}.`);
    audio[line] = 'data:audio/mpeg;base64,' + bytesToBase64(new Uint8Array(await res.arrayBuffer()));
  }
  return { summary: doc as LessonSummary, data, audio, source: (doc.source as LessonSource | null) ?? null };
}

/** The same clips as MP3 data URIs (about a tenth of the size of WAV). Clips that are already MP3 are kept as they are. */
export async function compressAudio(audio: Record<string, string>, onProgress?: (done: number, total: number) => void): Promise<Record<string, string>> {
  const entries = Object.entries(audio);
  const out: Record<string, string> = {};
  let done = 0;
  for (const [line, uri] of entries) {
    out[line] = uri.startsWith('data:audio/wav') ? 'data:audio/mpeg;base64,' + bytesToBase64(await pcmToMp3(wavUriToPcm(uri))) : uri;
    onProgress?.(++done, entries.length);
  }
  return out;
}

export function standaloneHtml(data: LessonData, audio: Record<string, string>): string {
  return buildPlayerHtml(data, audio);
}

export interface SlideToSave {
  pageId: number;
  /** 0-based place in the course */
  index: number;
  entry: { data: LessonData; audio: Record<string, string>; lang: 'en' | 'af'; mode?: string; slideText: string; voiceId: string };
  /** this slide came from a saved lesson: its new version takes the old one's place */
  replace?: { id: string; token: string };
}

/**
 * Saves every slide of a course as its own lesson inside one collection. With an existing collection, slides that came from it replace
 * their saved version, new slides are added, and the saved slides in removeIds (deleted in the studio) are removed.
 */
export async function saveSlidesAsCollection(
  input: { title: string; lang: 'en' | 'af'; voiceLabel: string; slides: SlideToSave[]; brand: boolean; collectionId?: string | null; removeIds?: string[] },
  onProgress: (slideDone: number, slideTotal: number, clipDone: number, clipTotal: number) => void,
): Promise<{ collectionId: string; slides: Record<number, { id: string; token: string }> }> {
  const isNew = !input.collectionId;
  let collectionId = input.collectionId ?? '';
  if (isNew) collectionId = (await createCollection(input.title, input.lang)).id;
  else await renameCollection(collectionId, input.title);
  const out: Record<number, { id: string; token: string }> = {};
  const label = input.lang === 'af' ? 'Skyfie' : 'Slide';
  try {
    for (let k = 0; k < input.slides.length; k++) {
      const s = input.slides[k];
      onProgress(k, input.slides.length, 0, 0);
      const name = String(s.entry.data.title || '').trim();
      const r = await saveLesson(
        {
          title: `${label} ${s.index + 1}${name ? `: ${name}` : ''}`,
          slideLabel: `${label} ${s.index + 1}`,
          voiceLabel: input.voiceLabel,
          lang: s.entry.lang,
          mode: s.entry.mode,
          data: { ...s.entry.data, brand: input.brand },
          audio: s.entry.audio,
          collectionId,
          position: s.index,
          source: { slideText: s.entry.slideText, mode: s.entry.mode, voiceId: s.entry.voiceId, lang: s.entry.lang },
          replace: s.replace,
        },
        (d, t) => onProgress(k, input.slides.length, d, t),
      );
      out[s.pageId] = r;
    }
    onProgress(input.slides.length, input.slides.length, 0, 0);
    for (const id of input.removeIds ?? []) await deleteLesson(id).catch(() => {});
  } catch (e) {
    // a collection that was only just made is not left half-filled
    if (isNew) await deleteCollection(collectionId).catch(() => {});
    throw e;
  }
  return { collectionId, slides: out };
}

/** One .zip with a standalone html page per slide (and the MP3 of a voice-over), in course order. */
export async function zipOfLessons(
  items: { name: string; kind: 'lesson' | 'audio'; data?: LessonData; audio?: Record<string, string>; mp3?: Uint8Array }[],
  onProgress?: (done: number, total: number) => void,
): Promise<Uint8Array> {
  const { buildZip, safeName } = await import('../utils/zip');
  const enc = new TextEncoder();
  const files: { name: string; data: Uint8Array }[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const prefix = String(i + 1).padStart(2, '0');
    if (it.kind === 'audio' && it.mp3) files.push({ name: `${prefix} ${safeName(it.name)}.mp3`, data: it.mp3 });
    else if (it.data && it.audio) {
      const mp3 = await compressAudio(it.audio);
      files.push({ name: `${prefix} ${safeName(it.name)}.html`, data: enc.encode(buildPlayerHtml(it.data, mp3)) });
    }
    onProgress?.(i + 1, items.length);
  }
  return buildZip(files);
}

export interface LibraryEditSlide {
  lessonId: string;
  token: string;
  title: string;
  text: string;
  kind: 'lesson' | 'audio';
  entry?: { data: LessonData; audio: Record<string, string>; slideText: string; voiceId: string; lang: 'en' | 'af'; mode?: 'explain' | 'read' };
  /** the voice-over of an audio item, as 24 kHz PCM */
  pcm?: Uint8Array;
}
/** Everything the studio needs to reopen saved work. */
export interface LibraryEditPayload {
  kind: 'collection' | 'lesson' | 'audio';
  title: string;
  collectionId: string | null;
  lang: 'en' | 'af';
  slides: LibraryEditSlide[];
}

/** Loads saved lessons (or voice-overs) for editing in the studio. */
export async function loadForEditing(items: LessonSummary[], onProgress?: (done: number, total: number) => void): Promise<LibraryEditSlide[]> {
  const out: LibraryEditSlide[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.kind === 'audio') {
      const [{ source }, mp3] = await Promise.all([loadLesson(it.id).then((r) => ({ source: r.source })), loadAudioClip(it.id)]);
      const { decodeToPcm24k } = await import('../utils/audioDecode');
      out.push({ lessonId: it.id, token: it.publicToken, title: it.title, text: source?.slideText ?? '', kind: 'audio', pcm: await decodeToPcm24k(mp3.buffer.slice(mp3.byteOffset, mp3.byteOffset + mp3.byteLength) as ArrayBuffer) });
    } else {
      const { data, audio, source } = await loadLesson(it.id);
      const lang: 'en' | 'af' = (source?.lang === 'en' || source?.lang === 'af' ? source.lang : it.lang === 'en' ? 'en' : 'af');
      const mode = (source?.mode ?? it.mode) === 'explain' ? 'explain' : 'read';
      // lessons saved before the source was kept: the spoken words stand in for the slide text
      const text = source?.slideText ?? spokenLines(data).join('\n');
      out.push({ lessonId: it.id, token: it.publicToken, title: it.title, text, kind: 'lesson', entry: { data, audio, slideText: text, voiceId: source?.voiceId ?? '', lang, mode } });
    }
    onProgress?.(i + 1, items.length);
  }
  return out;
}
