import { VoiceName, VoiceOption } from "../types";

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
  provider: 'gemini' | 'elevenlabs' = 'gemini'
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
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    if (response.status === 429 || errData.isQuotaExceeded) {
      const quotaErr: any = new Error("QUOTA_EXCEEDED");
      quotaErr.isQuotaExceeded = true;
      throw quotaErr;
    }
    throw new Error(errData.error || `Failed to generate audio (${response.status})`);
  }

  const data = await response.json();
  if (!data.audioBase64) {
    throw new Error("No audio data returned from the server.");
  }

  return data.audioBase64;
}

/**
 * Generates speech for a VoiceOption, picking the right engine (Gemini or ElevenLabs).
 * The language follows the app-wide toggle, not the voice.
 */
export function generateSpeechForVoice(voice: VoiceOption, text: string, isAfrikaans: boolean): Promise<string> {
  return generateSpeech(
    text,
    voice.voiceName,
    voice.stylePrompt,
    isAfrikaans,
    voice.isLibrary === true,
    voice.provider === 'elevenlabs' ? 'elevenlabs' : 'gemini'
  );
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
