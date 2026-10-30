import { GoogleGenAI, Modality } from '@google/genai';
import { getUser } from '@netlify/identity';
import type { Config } from '@netlify/functions';

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

const ELEVENLABS_BASE = 'https://api.elevenlabs.io';
const ELEVENLABS_VOICE_ID = /^[A-Za-z0-9]{10,40}$/;

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

async function ttsElevenLabs(body: any): Promise<Response> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return json({ error: 'The server is missing its ElevenLabs API key.' }, 500);
  const text = cleanText(body.text);
  if (!text) return json({ error: 'Text cannot be empty or is too long' }, 400);
  const voiceId = body.voiceName;
  if (typeof voiceId !== 'string' || !ELEVENLABS_VOICE_ID.test(voiceId)) {
    return json({ error: 'Invalid voice id' }, 400);
  }
  const languageCode = body.isAfrikaans === true ? 'af' : 'en';

  // Afrikaans is only supported by the Eleven v3 model.
  const res = await fetch(`${ELEVENLABS_BASE}/v1/text-to-speech/${voiceId}?output_format=pcm_24000`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: 'eleven_v3', language_code: languageCode }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error('ElevenLabs TTS failed:', res.status, detail.slice(0, 500));
    if (res.status === 429) {
      return json({ error: 'ElevenLabs quota or rate limit reached.', isQuotaExceeded: true, fallbackToBrowser: true }, 429);
    }
    let message = `ElevenLabs could not generate audio (${res.status}).`;
    try {
      const parsed = JSON.parse(detail);
      const d = parsed?.detail;
      if (typeof d === 'string') message = d;
      else if (typeof d?.message === 'string') message = d.message;
    } catch { /* keep default message */ }
    return json({ error: message }, 502);
  }
  const audioBase64 = Buffer.from(await res.arrayBuffer()).toString('base64');
  return json({ audioBase64 });
}

async function tts(ai: GoogleGenAI, body: any): Promise<Response> {
  const text = cleanText(body.text);
  if (!text) return json({ error: 'Text cannot be empty or is too long' }, 400);

  const { voiceName = 'Kore', style, isAfrikaans = false, libraryVoice = false } = body;
  const defaultStyle = isAfrikaans
    ? 'Natuurlike, warm, lewendige en boeiende Afrikaanse spraakstyl met outentieke intonasie en duidelike artikulasie.'
    : 'Natural, conversational, engaging e-learning voice-over narrator with clear pacing.';
  const speechStyle = typeof style === 'string' && style.trim() ? style.trim().slice(0, 500) : defaultStyle;
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
      contents: [{ role: 'user', parts: [{ text, speechMetadata: { style: speechStyle } }] }] as any,
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
            text: `Translate the following text to ${targetLanguage}. Maintain an educational, engaging, and conversational tone suitable for course audio narration. Do not include any notes, preamble, or commentary, just the translated text: "${text}"`,
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
      ? `Herskryf die volgende lesing-teks om te klink soos 'n lewendige, natuurlike en boeiende Afrikaanse stemopname. Maak die sinsbou vloeiend vir spraak, voeg warm natuurlike oorgange by (soos "Welkom by...", "Kom ons kyk na...", "Onthou dat..."), maar behou alle noodsaaklike inligting akkuraat. Gee SLEGS die herskrewe Afrikaanse teks terug sonder notas:\n\n${text}`
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

export default async (req: Request): Promise<Response> => {
  const route = new URL(req.url).pathname.replace(/\/+$/, '');

  if (route === '/api/health' && req.method === 'GET') {
    return json({ status: 'ok', timestamp: Date.now(), keyConfigured: Boolean(process.env.GEMINI_API_KEY), elevenLabsConfigured: Boolean(process.env.ELEVENLABS_API_KEY) });
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
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

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
