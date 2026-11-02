import { VoiceOption } from '../types';
import { generateSpeechForVoice, blobToBase64 } from './geminiService';
import { decodeBase64, pcmToWavBlob } from '../utils/audioUtils';
import { LessonData, spokenLines } from './lessonPlayer';

export type VisualsLevel = 'g8' | 'g9' | 'g10' | 'g11' | 'g12' | 'univ';

const SAMPLE_RATE = 24000;
const FADE_IN_MS = 8;
const FADE_OUT_MS = 25;
const TAIL_SILENCE_MS = 150;

/**
 * Each line is its own clip, so a hard start or stop is heard as a click at every transition.
 * Fade the first and last few milliseconds and end with a little silence so the next line starts clean.
 */
function smoothClip(pcm: Uint8Array): Uint8Array {
  const samples = Math.floor(pcm.length / 2);
  const tail = Math.round((SAMPLE_RATE * TAIL_SILENCE_MS) / 1000);
  const out = new Uint8Array((samples + tail) * 2);
  const src = new DataView(pcm.buffer, pcm.byteOffset, samples * 2);
  const dst = new DataView(out.buffer);
  const fin = Math.min(samples, Math.round((SAMPLE_RATE * FADE_IN_MS) / 1000));
  const fout = Math.min(samples, Math.round((SAMPLE_RATE * FADE_OUT_MS) / 1000));
  for (let i = 0; i < samples; i++) {
    let gain = 1;
    if (i < fin) gain = i / fin;
    if (i >= samples - fout) gain = Math.min(gain, (samples - 1 - i) / fout);
    dst.setInt16(i * 2, Math.round(src.getInt16(i * 2, true) * gain), true);
  }
  return out;
}

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

/**
 * Voices every spoken line with the chosen narrator. The result is keyed by the exact line text,
 * which is how the player finds the right clip for each line it reveals.
 */
export async function narrateLines(
  data: LessonData,
  voice: VoiceOption,
  isAfrikaans: boolean,
  onProgress: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<Record<string, string>> {
  const lines = Array.from(new Set(spokenLines(data)));
  const audio: Record<string, string> = {};
  let done = 0;
  let next = 0;
  onProgress(0, lines.length);

  const worker = async () => {
    while (next < lines.length) {
      if (signal?.aborted) throw new DOMException('Stopped', 'AbortError');
      const line = lines[next++];
      const pcmBase64 = await generateSpeechForVoice(voice, line, isAfrikaans);
      const wav = pcmToWavBlob(smoothClip(decodeBase64(pcmBase64)), 24000);
      audio[line] = 'data:audio/wav;base64,' + (await blobToBase64(wav));
      onProgress(++done, lines.length);
    }
  };
  // Three at a time keeps the narrator's quota use steady.
  await Promise.all([worker(), worker(), worker()]);
  return audio;
}
