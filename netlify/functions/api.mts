import { GoogleGenAI, Modality } from '@google/genai';
import { getUser } from '@netlify/identity';
import { getStore } from '@netlify/blobs';
import type { Config } from '@netlify/functions';
import { embedRoute, libraryRoute } from '../lib/library.mts';
import { VISUALS_STORE, LEVELS, type Level, type Mode } from '../lib/visualsJob.mts';
import { CHAT_STORE, MAX_LESSON_CHARS, MAX_MESSAGE_CHARS, cleanTimeline } from '../lib/chatJob.mts';
import { ELEVENLABS_BASE, ELEVENLABS_VOICE_ID, TTS_STORE, SYNC_TTS_MAX_CHARS, elevenSpeech, quotaMessage } from '../lib/elevenTts.mts';
// @ts-ignore - plain JS module
import { afrikaansGlossaryPrompt } from '../lib/afrikaansTerms.mjs';
// @ts-ignore - plain JS module
import { forSpeech, dutchWordsIn } from '../lib/pronunciation.mjs';

// Same endpoints and response shapes as the Express routes in server.ts,
// so the browser code in services/geminiService.ts needs no changes.

const MAX_TEXT_CHARS = 20000;
// Netlify rejects request bodies above about 6MB. Base64 adds a third on top of the audio.
const MAX_AUDIO_BASE64_CHARS = 5 * 1024 * 1024;
const VALID_VOICES = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'];
// Voice Library ids are not in the list above, so they are checked by shape instead.
const LIBRARY_VOICE_ID = /^[A-Za-z0-9_.:-]{1,120}$/;
const LIBRARY_LANGUAGES = ['af-ZA', 'en-GB'];

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function getClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  return apiKey ? new GoogleGenAI({ apiKey }) : null;
}

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text.length > MAX_TEXT_CHARS) return null;
  return text;
}

async function transcribe(ai: GoogleGenAI, body: any): Promise<Response> {
  const { audioBase64, mimeType = 'audio/webm', language = 'af' } = body;
  if (typeof audioBase64 !== 'string' || !audioBase64) {
    return json({ error: 'Missing audioBase64 parameter' }, 400);
  }
  if (audioBase64.length > MAX_AUDIO_BASE64_CHARS) {
    return json({ error: 'Recording is too large. Please keep it under about 3 minutes.' }, 413);
  }

  let prompt =
    'Please transcribe this audio recording accurately into text. Maintain proper punctuation and capitalization.';
  if (language === 'af') {
    prompt =
      'Transkribeer hierdie Afrikaanse klankopname akkuraat na teks. Behou alle eiename, Afrikaanse grammatika en sinsbou sonder enige verduidelikings of inleidende teks. Gee slegs die getranskribeerde teks terug.';
  } else if (language === 'en') {
    prompt =
      'Transcribe this English audio recording accurately into text. Return only the transcribed text without preambles or explanations.';
  }

  const response = await ai.models.generateContent({
    model: 'gemini-3.5-transcribe',
    contents: {
      parts: [{ inlineData: { mimeType: String(mimeType), data: audioBase64 } }, { text: prompt }],
    },
  });
  // gemini-3.5-transcribe returns the transcript in an audioTranscription part, not in a text part,
  // so response.text is empty. Read the transcription parts first and fall back to plain text.
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const transcribed = parts
    .map((part) => part.audioTranscription?.text?.trim() ?? '')
    .filter(Boolean)
    .join(' ');
  const text = transcribed || response.text?.trim() || '';
  if (!text) {
    console.warn('Transcription returned no text. Part kinds:', parts.map((part) => Object.keys(part).join('+')));
  }
  return json({ text });
}


async function listElevenLabsVoices(): Promise<Response> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return json({ configured: false, voices: [] });

  const voices: any[] = [];
  let pageToken = '';
  for (let page = 0; page < 10; page++) {
    const url = new URL(`${ELEVENLABS_BASE}/v2/voices`);
    url.searchParams.set('page_size', '100');
    if (pageToken) url.searchParams.set('next_page_token', pageToken);
    const res = await fetch(url, { headers: { 'xi-api-key': apiKey } });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('ElevenLabs voice list failed:', res.status, detail.slice(0, 300));
      return json({ configured: true, error: 'Could not load ElevenLabs voices. Check the API key.', voices: [] }, 502);
    }
    const data: any = await res.json();
    for (const v of data.voices ?? []) {
      voices.push({
        id: String(v.voice_id ?? ''),
        name: String(v.name ?? ''),
        category: String(v.category ?? ''),
        gender: String(v.labels?.gender ?? '').toLowerCase(),
        accent: String(v.labels?.accent ?? ''),
        description: String(v.description ?? v.labels?.descriptive ?? ''),
        previewUrl: typeof v.preview_url === 'string' ? v.preview_url : '',
        languages: Array.isArray(v.verified_languages)
          ? v.verified_languages.map((l: any) => String(l?.language ?? '').toLowerCase()).filter(Boolean)
          : [],
      });
    }
    pageToken = data.next_page_token ?? '';
    if (!data.has_more || !pageToken) break;
  }
  return json({ configured: true, voices: voices.filter((v) => ELEVENLABS_VOICE_ID.test(v.id)) });
}

function ttsInput(body: any): { error: Response } | { input: { text: string; voiceId: string; isAfrikaans: boolean; attempt: number; pronunciations?: Record<string, string> } } {
  const text = cleanText(body.text);
  if (!text) return { error: json({ error: 'Text cannot be empty or is too long' }, 400) };
  const voiceId = body.voiceName;
  if (typeof voiceId !== 'string' || !ELEVENLABS_VOICE_ID.test(voiceId)) return { error: json({ error: 'Invalid voice id' }, 400) };
  const attempt = Number.isInteger(body.attempt) && body.attempt > 0 ? Math.min(body.attempt, 5) : 0;
  return { input: { text, voiceId, isAfrikaans: body.isAfrikaans === true, attempt, pronunciations: body.pronunciations } };
}

async function ttsElevenLabs(body: any): Promise<Response> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return json({ error: 'The server is missing its ElevenLabs API key.' }, 500);
  const parsed = ttsInput(body);
  if ('error' in parsed) return parsed.error;
  // a long text would run past the time a synchronous function may take: the browser uses /api/tts-job for those
  if (parsed.input.text.length > SYNC_TTS_MAX_CHARS * 4) return json({ error: 'This text is too long for one request. Use the voice job.', useJob: true }, 413);
  const r = await elevenSpeech(apiKey, parsed.input, 'pcm_24000');
  if (r.ok === false) {
    if (r.quota) return json({ error: quotaMessage(r.message), isQuotaExceeded: true, fallbackToBrowser: true }, 429);
    return json({ error: r.message }, 502);
  }
  return json({ audioBase64: Buffer.from(r.bytes).toString('base64') });
}

// A whole slide as one take: runs in a background function and is fetched as MP3 when it is done.
async function ttsJobRoute(req: Request, route: string, userKey: string): Promise<Response | null> {
  if (route === '/api/tts-job' && req.method === 'POST') {
    if (!process.env.ELEVENLABS_API_KEY) return json({ error: 'The server is missing its ElevenLabs API key.' }, 500);
    let body: any;
    try { body = await req.json(); } catch { return json({ error: 'Invalid request body' }, 400); }
    const parsed = ttsInput(body ?? {});
    if ('error' in parsed) return parsed.error;
    const jobId = crypto.randomUUID();
    await getStore(TTS_STORE).setJSON(jobId, { status: 'queued', owner: userKey, input: parsed.input, createdAt: Date.now() });
    await fetch(new URL('/.netlify/functions/tts-background', req.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jobId }),
    });
    return json({ jobId }, 202);
  }
  const m = route.match(/^\/api\/tts-job\/([0-9a-f-]{36})(\/audio)?$/i);
  if (m && req.method === 'GET') {
    const store = getStore(TTS_STORE);
    const job: any = await store.get(m[1], { type: 'json' });
    if (!job || job.owner !== userKey) return json({ error: 'Job not found.' }, 404);
    if (m[2]) {
      if (job.status !== 'done') return json({ error: 'The voice is not ready yet.' }, 409);
      const audio = await store.get(`${m[1]}.audio`, { type: 'arrayBuffer' });
      if (!audio) return json({ error: 'The voice is gone. Generate it again.' }, 404);
      return new Response(audio, { status: 200, headers: { 'content-type': 'audio/mpeg', 'cache-control': 'no-store' } });
    }
    if (job.status === 'done') return json({ status: 'done', bytes: job.bytes });
    if (job.status === 'error') {
      await store.delete(m[1]);
      return json({ status: 'error', error: job.error, isQuotaExceeded: job.quota === true });
    }
    return json({ status: job.status });
  }
  if (m && req.method === 'DELETE' && !m[2]) {
    const store = getStore(TTS_STORE);
    const job: any = await store.get(m[1], { type: 'json' });
    if (job && job.owner === userKey) { await store.delete(m[1]); await store.delete(`${m[1]}.audio`); }
    return json({ ok: true });
  }
  return null;
}

async function tts(ai: GoogleGenAI, body: any): Promise<Response> {
  const text = cleanText(body.text);
  if (!text) return json({ error: 'Text cannot be empty or is too long' }, 400);

  const { voiceName = 'Kore', style, isAfrikaans = false, libraryVoice = false } = body;
  const defaultStyle = isAfrikaans
    ? 'Natuurlike, warm, lewendige en boeiende Afrikaanse spraakstyl met outentieke intonasie en duidelike artikulasie.'
    : 'Natural, conversational, engaging e-learning voice-over narrator with clear pacing.';
  const baseStyle = typeof style === 'string' && style.trim() ? style.trim().slice(0, 400) : defaultStyle;
  // Without a language hint Gemini guesses the language sentence by sentence, and short Afrikaans lines drift to Dutch.
  const speechStyle = isAfrikaans
    ? `${baseStyle} Taal: Suid-Afrikaanse Afrikaans (af-ZA), nooit Nederlands nie. Gebruik Afrikaanse uitspraak en klanke, en dieselfde stem, aksent, toon, volume en tempo deurgaans.` +
      (Number(body.attempt) > 0
        ? ' STRENG: elke woord moet met Afrikaanse uitspraak gesê word. Die g is \'n keelklank, v klink soos f, w soos v, en ui klink soos in Afrikaans, nie soos in Nederlands nie.'
        : '')
    : baseStyle;
  const spokenText: string = forSpeech(text, isAfrikaans ? 'af' : 'en', body.pronunciations);
  let targetVoice = VALID_VOICES.includes(voiceName) ? voiceName : 'Kore';
  if (libraryVoice === true) {
    if (typeof voiceName !== 'string' || !LIBRARY_VOICE_ID.test(voiceName)) {
      return json({ error: 'Invalid voice id' }, 400);
    }
    targetVoice = voiceName;
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash-lite-tts',
      contents: [{ role: 'user', parts: [{ text: spokenText, speechMetadata: { style: speechStyle } }] }] as any,
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: targetVoice } } },
      },
    });
    const audioBase64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!audioBase64) throw new Error('No audio data returned from the model.');
    return json({ audioBase64 });
  } catch (error: any) {
    const errorStr = typeof error === 'object' ? JSON.stringify(error) : String(error);
    const isQuota =
      error?.status === 429 ||
      errorStr.includes('429') ||
      errorStr.includes('RESOURCE_EXHAUSTED') ||
      errorStr.includes('Quota exceeded');
    if (isQuota) {
      return json({ error: 'Gemini TTS quota exceeded.', isQuotaExceeded: true, fallbackToBrowser: true }, 429);
    }
    throw error;
  }
}

async function translate(ai: GoogleGenAI, body: any): Promise<Response> {
  const text = cleanText(body.text);
  if (!text) return json({ error: 'Text cannot be empty or is too long' }, 400);
  const targetLanguage = body.targetLanguage === 'English' ? 'English' : 'Afrikaans';

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: [
      {
        parts: [
          {
            text:
              `Translate the following text to ${targetLanguage}. Maintain an educational, engaging, and conversational tone suitable for course audio narration. Do not include any notes, preamble, or commentary, just the translated text.` +
              (targetLanguage === 'Afrikaans' ? `\n\n${afrikaansGlossaryPrompt()}` : '') +
              `\n\nText: "${text}"`,
          },
        ],
      },
    ],
  });
  return json({ translatedText: response.text?.trim() || text });
}

async function enhance(ai: GoogleGenAI, body: any): Promise<Response> {
  const text = cleanText(body.text);
  if (!text) return json({ error: 'Text cannot be empty or is too long' }, 400);
  const language = body.language === 'en' ? 'en' : 'af';

  const prompt =
    language === 'af'
      ? `Herskryf die volgende lesing-teks om te klink soos 'n lewendige, natuurlike en boeiende Afrikaanse stemopname. Maak die sinsbou vloeiend vir spraak, voeg warm natuurlike oorgange by (soos "Welkom by...", "Kom ons kyk na...", "Onthou dat..."), maar behou alle noodsaaklike inligting akkuraat. Gee SLEGS die herskrewe Afrikaanse teks terug sonder notas.\n\n${afrikaansGlossaryPrompt()}\n\nTeks:\n${text}`
      : `Rewrite the following lecture text to sound like an engaging, conversational, natural voice-over script. Make sentences flow effortlessly for speech, but retain all essential facts. Return ONLY the rewritten text:\n\n${text}`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: [{ parts: [{ text: prompt }] }],
  });
  return json({ enhancedText: response.text?.trim() || text });
}


interface LibraryVoice {
  id: string;
  displayName: string;
  languageCode: string;
  accent: string;
  gender: string;
  description: string;
}

// Lists Afrikaans (af-ZA) and English UK (en-GB) voices from the Gemini Extended Voice Library.
async function listVoices(debug: boolean, extra: URLSearchParams): Promise<Response> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return json({ error: 'The server is missing its Gemini API key.' }, 500);

  const voices: LibraryVoice[] = [];
  const raw: unknown[] = [];
  let pageToken = '';
  for (let page = 0; page < 10; page++) {
    const params = new URLSearchParams();
    // Diagnostic override: /api/voices?debug=1&language=af,af-ZA&region=ZA&search=afrikaans
    const languages = debug && extra.get('language') ? extra.get('language')!.split(',') : LIBRARY_LANGUAGES;
    for (const code of languages) if (/^[A-Za-z-]{2,10}$/.test(code)) params.append('language_code', code);
    if (debug && extra.get('region') && /^[A-Za-z]{2}$/.test(extra.get('region')!)) params.set('region_code', extra.get('region')!);
    if (debug && extra.get('search') && extra.get('search')!.length < 60) params.set('search', extra.get('search')!);
    params.set('page_size', '1000');
    if (pageToken) params.set('page_token', pageToken);

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/voices?${params}`, {
      headers: { 'x-goog-api-key': apiKey },
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('Voice list failed:', res.status, detail.slice(0, 500));
      return json({ error: `Could not load the voice library (${res.status}).` }, 502);
    }
    const data: any = await res.json();
    raw.push(data);
    for (const v of data.voices ?? []) {
      voices.push({
        id: String(v.id ?? v.name ?? ''),
        displayName: String(v.displayName ?? v.display_name ?? v.id ?? ''),
        languageCode: String(v.languageCode ?? v.language_code ?? ''),
        accent: String(v.accent ?? ''),
        gender: String(v.gender ?? '').toLowerCase(),
        description: String(v.description ?? ''),
      });
    }
    pageToken = data.nextPageToken ?? data.next_page_token ?? '';
    if (!pageToken) break;
  }
  const usable = voices.filter((v) => v.id && LIBRARY_VOICE_ID.test(v.id));
  return json(debug ? { voices: usable, raw } : { voices: usable });
}

const WORKSPACE_STORE = 'gsavoice-workspaces';
const MAX_WORKSPACE_BYTES = 1024 * 1024;
const MAX_BLOB_AUDIO_BYTES = 4 * 1024 * 1024;
const AUDIO_KEY = /^[A-Za-z0-9-]{1,40}$/;

/** Per-user saved work: one JSON document for the text and one blob per audio clip. */
async function workspaceRoute(req: Request, route: string, userId: string): Promise<Response | null> {
  if (route !== '/api/workspace' && !route.startsWith('/api/workspace/audio/')) return null;
  const store = getStore(WORKSPACE_STORE);
  const owner = encodeURIComponent(userId);

  if (route === '/api/workspace') {
    const key = `${owner}/workspace`;
    if (req.method === 'GET') {
      const workspace = await store.get(key, { type: 'json' });
      return json({ workspace: workspace ?? null });
    }
    if (req.method === 'PUT') {
      const raw = await req.text();
      if (raw.length > MAX_WORKSPACE_BYTES) return json({ error: 'Saved work is too large.' }, 413);
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return json({ error: 'Invalid request body' }, 400);
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return json({ error: 'Invalid request body' }, 400);
      await store.setJSON(key, parsed);
      return json({ ok: true });
    }
    return json({ error: 'Method not allowed' }, 405);
  }

  const audioId = route.slice('/api/workspace/audio/'.length);
  if (!AUDIO_KEY.test(audioId)) return json({ error: 'Invalid audio key' }, 400);
  const key = `${owner}/audio/${audioId}`;
  if (req.method === 'GET') {
    const data = await store.get(key, { type: 'arrayBuffer' });
    if (!data) return json({ error: 'Not found' }, 404);
    return new Response(data, { headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'private, no-store' } });
  }
  if (req.method === 'PUT') {
    const data = await req.arrayBuffer();
    if (data.byteLength === 0 || data.byteLength > MAX_BLOB_AUDIO_BYTES) return json({ error: 'Audio is empty or too large to save.' }, 413);
    await store.set(key, data);
    return json({ ok: true });
  }
  return json({ error: 'Method not allowed' }, 405);
}

// Slide visuals: queue a job for visuals-background and let the browser poll for the result.
async function visualsRoute(req: Request, route: string, userKey: string): Promise<Response | null> {
  if (route === '/api/visuals' && req.method === 'POST') {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid request body' }, 400);
    }
    const text = cleanText(body?.text);
    if (!text) return json({ error: 'The slide text is empty or too long.' }, 400);
    const lang = body?.lang === 'af' ? 'af' : 'en';
    const level: Level = (LEVELS as readonly string[]).includes(body?.level) ? body.level : 'univ';
    const mode: Mode = body?.mode === 'explain' ? 'explain' : 'read';
    const currency = typeof body?.currency === 'string' && body.currency.trim() ? body.currency.trim().slice(0, 4) : 'R';
    if (!process.env.ANTHROPIC_API_KEY) return json({ error: 'The server is missing its Anthropic API key.' }, 500);

    const jobId = crypto.randomUUID();
    await getStore(VISUALS_STORE).setJSON(jobId, {
      status: 'queued',
      owner: userKey,
      input: { text, lang, level, currency, mode },
      createdAt: Date.now(),
    });
    // Returns 202 at once; the work continues for up to 15 minutes.
    await fetch(new URL('/.netlify/functions/visuals-background', req.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jobId }),
    });
    return json({ jobId }, 202);
  }

  if (route === '/api/visuals-chat' && req.method === 'POST') {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid request body' }, 400);
    }
    const lesson = body?.lesson;
    if (!lesson || typeof lesson !== 'object' || !Array.isArray(lesson.beats) || !lesson.beats.length) return json({ error: 'There is no lesson to change.' }, 400);
    if (JSON.stringify(lesson).length > MAX_LESSON_CHARS) return json({ error: 'The lesson is too large to edit in the chat.' }, 400);
    const messages = (Array.isArray(body?.messages) ? body.messages : [])
      .slice(-12)
      .map((x: any) => ({ role: x?.role === 'assistant' ? 'assistant' : 'user', text: String(x?.text ?? '').slice(0, MAX_MESSAGE_CHARS) }))
      .filter((x: any) => x.text.trim());
    if (!messages.length || messages[messages.length - 1].role !== 'user') return json({ error: 'Type what you want to change.' }, 400);
    if (!process.env.ANTHROPIC_API_KEY) return json({ error: 'The server is missing its Anthropic API key.' }, 500);
    const lang = body?.lang === 'af' ? 'af' : 'en';
    const mode = body?.mode === 'explain' ? 'explain' : 'read';

    const jobId = crypto.randomUUID();
    await getStore(CHAT_STORE).setJSON(jobId, { status: 'queued', owner: userKey, input: { lesson, messages, lang, mode, timeline: cleanTimeline(body?.timeline), now: typeof body?.now === 'number' && isFinite(body.now) ? Math.max(0, Math.min(body.now, 36000)) : null }, createdAt: Date.now() });
    await fetch(new URL('/.netlify/functions/chat-background', req.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jobId }),
    });
    return json({ jobId }, 202);
  }

  const mc = route.match(/^\/api\/visuals-chat\/([0-9a-f-]{36})$/i);
  if (mc && req.method === 'GET') {
    const store = getStore(CHAT_STORE);
    const job: any = await store.get(mc[1], { type: 'json' });
    if (!job || job.owner !== userKey) return json({ error: 'Job not found.' }, 404);
    if (job.status === 'done') {
      await store.delete(mc[1]);
      return json({ status: 'done', result: job.result });
    }
    if (job.status === 'error') {
      await store.delete(mc[1]);
      return json({ status: 'error', error: job.error });
    }
    return json({ status: job.status });
  }

  const m = route.match(/^\/api\/visuals\/([0-9a-f-]{36})$/i);
  if (m && req.method === 'GET') {
    const store = getStore(VISUALS_STORE);
    const job: any = await store.get(m[1], { type: 'json' });
    if (!job || job.owner !== userKey) return json({ error: 'Job not found.' }, 404);
    if (job.status === 'done') {
      await store.delete(m[1]);
      return json({ status: 'done', data: job.data });
    }
    if (job.status === 'error') {
      await store.delete(m[1]);
      return json({ status: 'error', error: job.error });
    }
    return json({ status: job.status });
  }
  return null;
}

// Dutch filter: transcribe a take with ElevenLabs Scribe and report the language it heard.
// The browser sends 16 kHz 16-bit mono PCM as base64 (at most 90 seconds).
async function voiceCheck(body: any): Promise<Response> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return json({ checked: false, reason: 'no ElevenLabs key' });
  const b64 = body?.pcm16kBase64;
  if (typeof b64 !== 'string' || !b64 || b64.length > 4_500_000) return json({ checked: false, reason: 'no audio, or too long' }, 400);
  const pcm = Buffer.from(b64, 'base64');
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVE', 8); header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(16000, 24);
  header.writeUInt32LE(32000, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);

  const form = new FormData();
  form.append('model_id', 'scribe_v1');
  form.append('tag_audio_events', 'false');
  form.append('file', new Blob([Buffer.concat([header, pcm])], { type: 'audio/wav' }), 'take.wav');
  const res = await fetch(`${ELEVENLABS_BASE}/v1/speech-to-text`, { method: 'POST', headers: { 'xi-api-key': apiKey }, body: form });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error('Scribe failed:', res.status, detail.slice(0, 300));
    const credits = /quota|credits/i.test(detail);
    return json({ checked: false, reason: credits ? 'ElevenLabs credit limit reached' : `speech-to-text returned ${res.status}` });
  }
  const data: any = await res.json();
  const language = String(data.language_code ?? '').toLowerCase();
  const probability = typeof data.language_probability === 'number' ? data.language_probability : null;
  const text = String(data.text ?? '');
  const dutchWords: string[] = dutchWordsIn(text);
  // Scribe often labels Afrikaans as Dutch, so the label alone is not proof. How closely the transcript matches the Afrikaans
  // script is: Afrikaans speech transcribed as Afrikaans matches, Dutch-sounding speech comes back with Dutch spellings.
  const norm = (t: string) => t.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const expected = typeof body?.expectedText === 'string' ? Array.from(new Set(norm(body.expectedText))) : [];
  const heard = new Set(norm(text));
  const matchPct = expected.length ? expected.filter((w) => heard.has(w)).length / expected.length : null;
  const labelDutch = ['nld', 'nl', 'dut', 'nld-nl'].includes(language);
  const heardDutch =
    dutchWords.length >= 2 || (labelDutch && (probability ?? 1) >= 0.8 && (matchPct === null || matchPct < 0.8));
  return json({ checked: true, language, probability, dutchWords, heardDutch, labelDutch, matchPct, text: text.slice(0, 400) });
}

export default async (req: Request): Promise<Response> => {
  const route = new URL(req.url).pathname.replace(/\/+$/, '');

  if (route === '/api/health' && req.method === 'GET') {
    return json({ status: 'ok', timestamp: Date.now(), keyConfigured: Boolean(process.env.GEMINI_API_KEY), elevenLabsConfigured: Boolean(process.env.ELEVENLABS_API_KEY) });
  }
  // Public embed of a lesson its owner has chosen to share: the page and its audio, no sign-in.
  if (route.startsWith('/api/embed/')) {
    try {
      const embed = await embedRoute(req, route);
      if (embed) return embed;
    } catch (error) {
      console.error('Embed request failed:', error);
      return new Response('Could not load this lesson.', { status: 502 });
    }
  }
  // Everything below needs a signed-in (invited) user, because each call spends Gemini quota.
  const user = await getUser();
  if (!user) return json({ error: 'Please sign in.' }, 401);

  if (route === '/api/voices' && req.method === 'GET') {
    try {
      const q = new URL(req.url).searchParams;
      return await listVoices(q.get('debug') === '1', q);
    } catch (error) {
      console.error('Voice list failed:', error);
      return json({ error: 'Could not load the voice library.' }, 502);
    }
  }
  if (route === '/api/elevenlabs/voices' && req.method === 'GET') {
    try {
      return await listElevenLabsVoices();
    } catch (error) {
      console.error('ElevenLabs voice list failed:', error);
      return json({ error: 'Could not load ElevenLabs voices.' }, 502);
    }
  }
  try {
    const library = await libraryRoute(req, route, user);
    if (library) return library;
  } catch (error) {
    console.error('Library request failed:', error);
    return json({ error: 'Could not reach the lesson library.' }, 502);
  }
  try {
    const visuals = await visualsRoute(req, route, user.id);
    if (visuals) return visuals;
  } catch (error) {
    console.error('Visuals request failed:', error);
    return json({ error: 'Could not start the visuals job.' }, 502);
  }
  try {
    const job = await ttsJobRoute(req, route, user.id);
    if (job) return job;
  } catch (error) {
    console.error('Voice job request failed:', error);
    return json({ error: 'Could not start the voice job.' }, 502);
  }
  try {
    const saved = await workspaceRoute(req, route, user.id);
    if (saved) return saved;
  } catch (error) {
    console.error('Workspace request failed:', error);
    return json({ error: 'Could not reach saved work.' }, 502);
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  if (route === '/api/voice-check') {
    try {
      return await voiceCheck(await req.json());
    } catch (error) {
      console.error('Voice check failed:', error);
      return json({ checked: false, reason: 'check failed' });
    }
  }

  const handlers: Record<string, (ai: GoogleGenAI, body: any) => Promise<Response>> = {
    '/api/transcribe': transcribe,
    '/api/tts': tts,
    '/api/translate': translate,
    '/api/enhance-conversational': enhance,
  };
  const handler = handlers[route];
  if (!handler) return json({ error: 'Not found' }, 404);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }

  if (route === '/api/tts' && body?.provider === 'elevenlabs') {
    try {
      return await ttsElevenLabs(body);
    } catch (error) {
      console.error('ElevenLabs request failed:', error);
      return json({ error: 'ElevenLabs request failed.' }, 502);
    }
  }

  const ai = getClient();
  if (!ai) return json({ error: 'The server is missing its Gemini API key.' }, 500);

  try {
    return await handler(ai, body ?? {});
  } catch (error) {
    console.error(`${route} failed:`, error);
    return json({ error: 'The request failed. Please try again.' }, 500);
  }
};

export const config: Config = {
  path: '/api/*',
};
