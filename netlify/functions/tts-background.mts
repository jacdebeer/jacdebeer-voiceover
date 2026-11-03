// Background worker (runs up to 15 minutes): voices a whole slide with ElevenLabs and keeps the MP3 for the browser to fetch.
import { getStore } from '@netlify/blobs';
import { TTS_STORE, elevenSpeech, quotaMessage } from '../lib/elevenTts.mts';

export default async (req: Request): Promise<Response> => {
  let jobId: string | undefined;
  try {
    ({ jobId } = await req.json());
  } catch {
    return new Response('', { status: 400 });
  }
  if (!jobId) return new Response('', { status: 400 });

  const store = getStore(TTS_STORE);
  const job: any = await store.get(jobId, { type: 'json' });
  if (!job || job.status !== 'queued') return new Response('', { status: 202 });
  const base = { owner: job.owner, createdAt: job.createdAt };
  await store.setJSON(jobId, { ...base, status: 'running' });
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) throw Object.assign(new Error('The server is missing its ElevenLabs API key.'), { plain: true });
    // MP3 at 128 kbps is about a third the size of the raw 24 kHz audio, so a slide of several minutes still fits one response
    const r = await elevenSpeech(apiKey, job.input, 'mp3_44100_128');
    if (r.ok === false) {
      await store.setJSON(jobId, { ...base, status: 'error', error: r.quota ? quotaMessage(r.message) : r.message, quota: r.quota });
      return new Response('', { status: 202 });
    }
    await store.set(`${jobId}.audio`, r.bytes);
    await store.setJSON(jobId, { ...base, status: 'done', bytes: r.bytes.byteLength });
  } catch (err: any) {
    await store.setJSON(jobId, { ...base, status: 'error', error: err?.message || 'The voice could not be generated.' });
  }
  return new Response('', { status: 202 });
};
