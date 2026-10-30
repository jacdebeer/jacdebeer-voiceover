import { VoiceName } from "../types";

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
  isAfrikaans: boolean = false
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
