import { VoiceName, VoiceOption } from "../types";
import { stripArtifacts, bytesToBase64, normalizeLoudness, downsampleTo16k } from "../utils/audioClean";
import { decodeBase64 } from "../utils/audioUtils";

/**
 * Converts a Blob to a base64 encoded string.
 */
export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Strip off the data URL prefix: data:audio/xyz;base64,
      const base64 = result.split(',')[1] || result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Generate high-quality speech using gemini-3.8-flash-tts via server proxy.
 */
export async function generateSpeech(
  text: string,
  voiceName: VoiceName | string,
  style?: string,
  isAfrikaans: boolean = false,
  libraryVoice: boolean = false,
  provider: 'gemini' | 'elevenlabs' = 'gemini',
  attempt: number = 0
): Promise<string> {
  if (!text || !text.trim()) {
    throw new Error("Text cannot be empty");
  }

  const response = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: text.trim(),
      voiceName,
      style,
      isAfrikaans,
      libraryVoice,
      provider,
      attempt,
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    if (response.status === 429 || errData.isQuotaExceeded) {
      const quotaErr: any = new Error(errData.error || "QUOTA_EXCEEDED");
      quotaErr.isQuotaExceeded = true;
      throw quotaErr;
    }
    throw new Error(errData.error || `Failed to generate audio (${response.status})`);
  }

  const data = await response.json();
  if (!data.audioBase64) {
    throw new Error("No audio data returned from the server.");
  }

  // Gemini's PCM has junk at both ends (a click at the start, a noise burst at the end). ElevenLabs audio is clean.
  // Every clip, from every voice, is brought to the same speech level so the volume never jumps between lines or slides.
  const pcm = decodeBase64(data.audioBase64);
  return bytesToBase64(normalizeLoudness(provider === 'gemini' ? stripArtifacts(pcm) : pcm));
}

/**
 * Generates speech for a VoiceOption, picking the right engine (Gemini or ElevenLabs).
 * The language follows the app-wide toggle, not the voice.
 */
export function generateSpeechForVoice(voice: VoiceOption, text: string, isAfrikaans: boolean, attempt: number = 0): Promise<string> {
  return generateSpeech(
    text,
    voice.voiceName,
    voice.stylePrompt,
    isAfrikaans,
    voice.isLibrary === true,
    voice.provider === 'elevenlabs' ? 'elevenlabs' : 'gemini',
    attempt
  );
}

export interface VoiceCheck {
  checked: boolean;
  /** true when the take sounded Dutch */
  heardDutch: boolean;
  language?: string;
  probability?: number | null;
  dutchWords?: string[];
  /** Scribe called it Dutch, even if the transcript matched the Afrikaans script well enough to accept it */
  labelDutch?: boolean;
  /** 0..1: how much of the script's wording came back in the transcript */
  matchPct?: number | null;
  attempts: number;
  reason?: string;
}

/** Asks the server which language the take sounds like (ElevenLabs Scribe). Never throws: an unavailable check just says so. */
export async function checkVoiceLanguage(base64Pcm24k: string, expectedText: string): Promise<Omit<VoiceCheck, 'attempts'>> {
  try {
    const pcm16 = downsampleTo16k(decodeBase64(base64Pcm24k)).slice(0, 16000 * 2 * 45); // the first 45 seconds is enough to tell the language, and keeps the check cheap
    const res = await fetch('/api/voice-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pcm16kBase64: bytesToBase64(pcm16), expectedText: expectedText.slice(0, 20000) }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d.checked) return { checked: false, heardDutch: false, reason: d.reason || `check returned ${res.status}` };
    return { checked: true, heardDutch: d.heardDutch === true, language: d.language, probability: d.probability, dutchWords: d.dutchWords, labelDutch: d.labelDutch === true, matchPct: typeof d.matchPct === 'number' ? d.matchPct : null };
  } catch {
    return { checked: false, heardDutch: false, reason: 'check unavailable' };
  }
}

/**
 * The Dutch filter. Voices an Afrikaans text and asks which language it sounds like. Every retry voices the whole text again,
 * so it costs the same credits again: a Gemini voice gets one retry, an ElevenLabs voice none (it is already told the
 * language directly, and its credits are the scarce ones). English text is returned as it is.
 */
export async function generateCheckedSpeech(
  voice: VoiceOption,
  text: string,
  isAfrikaans: boolean,
  options: { skipCheck?: boolean } = {}
): Promise<{ base64: string; check: VoiceCheck }> {
  let base64 = await generateSpeechForVoice(voice, text, isAfrikaans, 0);
  if (!isAfrikaans) return { base64, check: { checked: false, heardDutch: false, attempts: 1, reason: 'not Afrikaans' } };
  if (options.skipCheck) return { base64, check: { checked: false, heardDutch: false, attempts: 1, reason: 'not checked' } };
  const maxRetries = voice.provider === 'elevenlabs' ? 0 : 1;
  let attempts = 1;
  let check = await checkVoiceLanguage(base64, text);
  while (check.checked && check.heardDutch && attempts <= maxRetries) {
    base64 = await generateSpeechForVoice(voice, text, isAfrikaans, attempts);
    attempts++;
    check = await checkVoiceLanguage(base64, text);
  }
  return { base64, check: { ...check, attempts } };
}

/**
 * Transcribe audio using gemini-3.5-transcribe via server proxy.
 */
export async function transcribeAudio(
  audioBlob: Blob,
  mimeType: string = "audio/webm",
  language: 'af' | 'en' | 'auto' = 'af'
): Promise<string> {
  const audioBase64 = await blobToBase64(audioBlob);

  const response = await fetch("/api/transcribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      audioBase64,
      mimeType,
      language,
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `Transcription failed (${response.status})`);
  }

  const data = await response.json();
  return data.text || "";
}

/**
 * Translate text using gemini-3.8-flash via server proxy.
 */
export async function translateText(
  text: string,
  targetLanguage: "English" | "Afrikaans"
): Promise<string> {
  const response = await fetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      targetLanguage,
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `Translation failed (${response.status})`);
  }

  const data = await response.json();
  return data.translatedText || text;
}

/**
 * Enhance text into natural conversational voice-over script.
 */
export async function enhanceConversationalScript(
  text: string,
  language: "af" | "en" = "af"
): Promise<string> {
  const response = await fetch("/api/enhance-conversational", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      language,
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `Enhancement failed (${response.status})`);
  }

  const data = await response.json();
  return data.enhancedText || text;
}


/**
 * Load the Afrikaans (af-ZA) and English UK (en-GB) voices from the Gemini Voice Library.
 * Returns an empty list when the library cannot be reached, so the built-in voices still work.
 */
export async function fetchLibraryVoices(): Promise<VoiceOption[]> {
  try {
    const response = await fetch("/api/voices");
    if (!response.ok) return [];
    const data = await response.json();
    const voices: any[] = Array.isArray(data.voices) ? data.voices : [];
    return voices.map((v) => {
      const isAfr = String(v.languageCode).toLowerCase().startsWith("af");
      const accent = v.accent ? ` (${v.accent})` : "";
      return {
        id: `lib:${v.id}`,
        voiceName: v.id,
        label: v.displayName || v.id,
        description: (isAfr ? "Afrikaans" : "English UK") + accent,
        conversationalBio: v.description || "",
        gender: v.gender === "male" ? "Male" : "Female",
        stylePrompt: "",
        previewSampleText: {
          af: "Goeiedag! Dit is 'n voorbeeld van hoe hierdie stem in jou kursus sal klink.",
          en: "Hello! This is a sample of how this voice will sound in your course.",
        },
        isAfrVariant: isAfr,
        category: "conversational",
        isLibrary: true,
        locale: v.languageCode,
      } as VoiceOption;
    });
  } catch {
    return [];
  }
}


/**
 * Loads the voices on the connected ElevenLabs account (premade plus any added from the
 * ElevenLabs Voice Library). Returns an empty list when no key is configured.
 */
export async function fetchElevenLabsVoices(): Promise<VoiceOption[]> {
  try {
    const response = await fetch("/api/elevenlabs/voices");
    if (!response.ok) return [];
    const data = await response.json();
    const voices: any[] = Array.isArray(data.voices) ? data.voices : [];
    return voices.map((v) => {
      const langs: string[] = Array.isArray(v.languages) ? v.languages : [];
      const accent = String(v.accent || "");
      const isAfr = langs.includes("af") || accent.toLowerCase().includes("afrikaans");
      const parts = [isAfr ? "Afrikaans" : "", accent && !isAfr ? accent : ""].filter(Boolean);
      return {
        id: `el:${v.id}`,
        voiceName: v.id,
        label: v.name || v.id,
        description: ["ElevenLabs", ...parts].join(" · "),
        conversationalBio: v.description || "",
        gender: v.gender === "male" ? "Male" : "Female",
        stylePrompt: "",
        previewSampleText: {
          af: "Goeiedag! Dit is 'n voorbeeld van hoe hierdie stem in jou kursus sal klink.",
          en: "Hello! This is a sample of how this voice will sound in your course.",
        },
        isAfrVariant: isAfr,
        category: "conversational",
        provider: "elevenlabs",
        previewUrl: v.previewUrl || undefined,
        locale: langs.join(","),
      } as VoiceOption;
    });
  } catch {
    return [];
  }
}
