import { decodeToPcm24k } from '../utils/audioDecode';

/** Text longer than this is voiced as a background job: a whole slide outlasts one synchronous request. */
export const LONG_TAKE_CHARS = 500;

const POLL_MS = 2000;
const POLL_LIMIT = 420; // 14 minutes

export interface VoiceJobParams {
  text: string;
  voiceName: string;
  isAfrikaans: boolean;
  attempt: number;
  pronunciations?: Record<string, string>;
}

const failure = (message: string, quota = false) => Object.assign(new Error(message), quota ? { isQuotaExceeded: true } : {});

/** Voices a whole slide with ElevenLabs as one take: starts the job, waits for it, fetches the MP3 and decodes it to 24 kHz PCM. */
export async function voiceViaJob(params: VoiceJobParams, signal?: AbortSignal): Promise<Uint8Array> {
  const start = await fetch('/api/tts-job', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...params, ...(params.pronunciations && Object.keys(params.pronunciations).length ? {} : { pronunciations: undefined }) }),
    signal,
  });
  const started = await start.json().catch(() => ({}));
  if (start.status === 401) throw failure('Your session has ended. Sign in again.');
  if (!start.ok) throw failure(started.error || `Could not start the voice job (HTTP ${start.status}).`);

  for (let i = 0; i < POLL_LIMIT; i++) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    if (signal?.aborted) throw new DOMException('Stopped', 'AbortError');
    const res = await fetch(`/api/tts-job/${started.jobId}`, { signal });
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) throw failure('Your session has ended. Sign in again.');
    if (!res.ok) throw failure(body.error || `Status check failed (HTTP ${res.status}).`);
    if (body.status === 'error') throw failure(body.error || 'The voice could not be generated.', body.isQuotaExceeded === true);
    if (body.status === 'done') {
      const audio = await fetch(`/api/tts-job/${started.jobId}/audio`, { signal });
      if (!audio.ok) throw failure(`Could not fetch the voice (HTTP ${audio.status}).`);
      const pcm = await decodeToPcm24k(await audio.arrayBuffer());
      void fetch(`/api/tts-job/${started.jobId}`, { method: 'DELETE' }).catch(() => {});
      return pcm;
    }
  }
  throw failure('The voice took more than 14 minutes. Try again.');
}
