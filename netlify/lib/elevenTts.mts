// One ElevenLabs text-to-speech request, shared by the short synchronous route (api.mts) and the background job that voices
// whole slides (tts-background.mts). A whole slide takes longer than a synchronous function may run (about 26 seconds) and, as
// raw audio, is larger than a function may answer with (about 6 MB), so long takes run as a background job and come back as MP3.
// @ts-ignore - plain JS module
import { forSpeech } from './pronunciation.mjs';

export const ELEVENLABS_BASE = 'https://api.elevenlabs.io';
export const ELEVENLABS_VOICE_ID = /^[A-Za-z0-9]{10,40}$/;
export const TTS_STORE = 'tts-jobs';
/** text above this many characters is voiced as a background job */
export const SYNC_TTS_MAX_CHARS = 500;

export interface ElevenParams {
  text: string;
  voiceId: string;
  isAfrikaans: boolean;
  attempt: number;
  pronunciations?: Record<string, string>;
}

export type ElevenResult =
  | { ok: true; bytes: ArrayBuffer }
  | { ok: false; status: number; message: string; quota: boolean };

export async function elevenSpeech(apiKey: string, p: ElevenParams, outputFormat: string, fetchImpl: typeof fetch = fetch): Promise<ElevenResult> {
  const languageCode = p.isAfrikaans ? 'af' : 'en';
  const spoken: string = forSpeech(p.text, languageCode, p.pronunciations);
  // Afrikaans is only supported by the Eleven v3 model.
  const res = await fetchImpl(`${ELEVENLABS_BASE}/v1/text-to-speech/${p.voiceId}?output_format=${outputFormat}`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
    // stability 1.0 is v3's "Robust" setting: the voice varies least from one line to the next.
    body: JSON.stringify({
      text: spoken,
      model_id: 'eleven_v3',
      language_code: languageCode,
      voice_settings: { stability: 1.0 },
      // a retry (after a Dutch-sounding take) must not repeat the same sample
      ...(p.attempt ? { seed: 1000 + p.attempt * 7919 } : {}),
    }),
  });
  if (res.ok) return { ok: true, bytes: await res.arrayBuffer() };

  const detail = await res.text().catch(() => '');
  console.error('ElevenLabs TTS failed:', res.status, detail.slice(0, 500));
  let message = `ElevenLabs could not generate audio (${res.status}).`;
  let statusCode = '';
  try {
    const parsed = JSON.parse(detail);
    const d = parsed?.detail;
    if (typeof d === 'string') message = d;
    else if (typeof d?.message === 'string') message = d.message;
    if (typeof d?.status === 'string') statusCode = d.status;
  } catch { /* keep default message */ }
  // A credit limit (account or API key) comes back as quota_exceeded, not always as 429.
  const quota = res.status === 429 || statusCode === 'quota_exceeded' || /quota|credits/i.test(message);
  return { ok: false, status: res.status, message, quota };
}

export const quotaMessage = (message: string) =>
  `ElevenLabs credits: ${message} Raise this API key's credit limit or top up in ElevenLabs, or choose a Gemini voice.`;
