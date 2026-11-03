import { LessonData, buildPlayerHtml, spokenLines } from './lessonPlayer';
import { pcmToMp3 } from '../utils/mp3';
import { bytesToBase64 } from '../utils/audioClean';

export interface LessonSummary {
  id: string;
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

async function api(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(path, init);
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error('Your session has ended. Sign in again.');
  if (!res.ok) throw new Error(body.error || `Request failed (HTTP ${res.status}).`);
  return body;
}

const jsonInit = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export async function listLessons(): Promise<LessonSummary[]> {
  return (await api('/api/library')).lessons as LessonSummary[];
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
  input: { title: string; slideLabel: string; voiceLabel: string; lang: 'en' | 'af'; mode?: string; data: LessonData; audio: Record<string, string> },
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
        urls[lines[idx]] = `${embedUrl(created.token)}/audio/${idx}`;
        onProgress(++done, total, 'audio');
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    onProgress(total, total, 'finish');
    await api(`/api/library/${created.id}/finish`, jsonInit('POST', { html: buildPlayerHtml(input.data, urls) }));
  } catch (e) {
    // do not leave a half-saved lesson behind
    await fetch(`/api/library/${created.id}`, { method: 'DELETE' }).catch(() => {});
    throw e;
  }
  return { id: created.id, token: created.token };
}

/** Opens a saved lesson: its data plus every clip as a data URI, ready for the player. */
export async function loadLesson(id: string): Promise<{ summary: LessonSummary; data: LessonData; audio: Record<string, string> }> {
  const doc = await api(`/api/library/${id}`);
  const { audioIndex, ...data } = doc.lesson as LessonData & { audioIndex?: Record<string, number> };
  const audio: Record<string, string> = {};
  for (const [line, idx] of Object.entries(audioIndex ?? {})) {
    const res = await fetch(`/api/library/${id}/audio/${idx}`);
    if (!res.ok) throw new Error(`Could not load audio clip ${idx + 1} of ${doc.clipCount}.`);
    audio[line] = 'data:audio/mpeg;base64,' + bytesToBase64(new Uint8Array(await res.arrayBuffer()));
  }
  return { summary: doc as LessonSummary, data, audio };
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
