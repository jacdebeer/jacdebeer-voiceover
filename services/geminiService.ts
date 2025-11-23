import { GoogleGenAI, Modality } from "@google/genai";
import { VoiceName } from "../types";

// Initialize the client. API_KEY is guaranteed to be in process.env.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function generateSpeech(text: string, voice: VoiceName): Promise<string> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voice },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    
    if (!base64Audio) {
      throw new Error("No audio data returned from the model.");
    }

    return base64Audio;
  } catch (error) {
    console.error("Gemini TTS Error:", error);
    throw error;
  }
}

export async function translateText(text: string, targetLanguage: 'English' | 'Afrikaans'): Promise<string> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Translate the following text to ${targetLanguage}. Keep the tone professional and educational. Do not include any preamble or explanation, just the translated text. Text: "${text}"`,
    });

    return response.text || text;
  } catch (error) {
    console.error("Translation Error:", error);
    throw error;
  }
}