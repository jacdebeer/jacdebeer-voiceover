import { VoiceOption } from '../types';
import { generateCheckedSpeech, blobToBase64, VoiceCheck } from './geminiService';
import { decodeBase64, pcmToWavBlob } from '../utils/audioUtils';
import { LessonData, spokenLines } from './lessonPlayer';
import { cleanClip, normalizeLoudness } from '../utils/audioClean';
import { splitTake, finishSegment } from '../utils/segmentTake';

export type VisualsLevel = 'g8' | 'g9' | 'g10' | 'g11' | 'g12' | 'univ';

const POLL_MS = 2000;
const POLL_LIMIT = 150; // 5 minutes

/** Asks the server for slide visuals built around the slide text, then waits for the result. */
export async function generateVisuals(
  params: { text: string; lang: 'en' | 'af'; level: VisualsLevel; currency: string },
  signal?: AbortSignal,
): Promise<LessonData> {
  const start = await fetch('/api/visuals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal,
  });
  const started = await start.json().catch(() => ({}));
  if (start.status === 401) throw new Error('Your session has ended. Sign in again.');
  if (!start.ok) throw new Error(started.error || `Could not start the job (HTTP ${start.status}).`);

  for (let i = 0; i < POLL_LIMIT; i++) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    if (signal?.aborted) throw new DOMException('Stopped', 'AbortError');
    const res = await fetch(`/api/visuals/${started.jobId}`, { signal });
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) throw new Error('Your session has ended. Sign in again.');
    if (!res.ok) throw new Error(body.error || `Status check failed (HTTP ${res.status}).`);
    if (body.status === 'done') return body.data as LessonData;
    if (body.status === 'error') throw new Error(body.error || 'The model returned an error.');
  }
  throw new Error('Timed out after 5 minutes. Try again.');
}

export interface NarrationReport {
  /** 'take': the whole slide voiced in one go and cut into lines. 'lines': voiced line by line. */
  mode: 'take' | 'lines';
  check?: VoiceCheck;
  note: string;
}

const toWavUri = async (pcm: Uint8Array) => 'data:audio/wav;base64,' + (await blobToBase64(pcmToWavBlob(pcm, 24000)));

/** Lines in spoken order, repeats kept (the take is cut by position, not by text). */
function orderedLines(data: LessonData): string[] {
  const out: string[] = [];
  for (const b of data.beats ?? []) for (const t of [b.caption, ...(b.narration ?? [])]) if (typeof t === 'string' && t.trim()) out.push(t.trim());
  return out;
}

/**
 * Voices the slide so that voice, accent, language, volume, tone and pace are the same in every line:
 * the whole script is voiced in ONE take (with the Dutch filter), then cut back into lines. The result is keyed by the
 * exact line text, which is how the player finds the clip for each line it reveals.
 * If the take cannot be cut with confidence, the lines are voiced one by one instead.
 */
export async function narrateLines(
  data: LessonData,
  voice: VoiceOption,
  isAfrikaans: boolean,
  onProgress: (done: number, total: number, phase: string) => void,
  signal?: AbortSignal,
): Promise<{ audio: Record<string, string>; report: NarrationReport }> {
  const lines = orderedLines(data);
  const audio: Record<string, string> = {};
  if (!lines.length) return { audio, report: { mode: 'take', note: 'no spoken lines' } };

  // ---- one take
  onProgress(0, 3, 'take');
  let note = '';
  let check: VoiceCheck | undefined;
  try {
    const joined = lines.join('\n\n');
    if (joined.length <= 18000) {
      const { base64, check: c } = await generateCheckedSpeech(voice, joined, isAfrikaans);
      check = c;
      if (signal?.aborted) throw new DOMException('Stopped', 'AbortError');
      onProgress(2, 3, 'split');
      const split = splitTake(decodeBase64(base64), lines);
      if (split.confidence >= 0.6 && split.segments.length === lines.length) {
        for (let i = 0; i < lines.length; i++) {
          if (!audio[lines[i]]) audio[lines[i]] = await toWavUri(finishSegment(normalizeLoudness(split.segments[i])));
        }
        onProgress(3, 3, 'done');
        return { audio, report: { mode: 'take', check, note: `One take cut into ${lines.length} lines. ${split.detail}.` } };
      }
      note = `The one-take split was not trusted (${split.detail}); voiced line by line instead.`;
    } else {
      note = 'The slide is too long for one take; voiced line by line.';
    }
  } catch (e: any) {
    if (e?.name === 'AbortError' || e?.isQuotaExceeded) throw e;
    note = `One take failed (${e?.message || 'error'}); voiced line by line instead.`;
  }

  // ---- fallback: line by line, same style and volume for every line
  const unique = Array.from(new Set(lines));
  let done = 0;
  let next = 0;
  onProgress(0, unique.length, 'lines');
  const worker = async () => {
    while (next < unique.length) {
      if (signal?.aborted) throw new DOMException('Stopped', 'AbortError');
      const line = unique[next++];
      const { base64, check: c } = await generateCheckedSpeech(voice, line, isAfrikaans);
      check = check && c.heardDutch ? c : check ?? c;
      audio[line] = await toWavUri(cleanClip(decodeBase64(base64)));
      onProgress(++done, unique.length, 'lines');
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return { audio, report: { mode: 'lines', check, note } };
}
