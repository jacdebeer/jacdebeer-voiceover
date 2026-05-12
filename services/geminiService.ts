
import { GoogleGenAI, Modality } from "@google/genai";
import { VoiceName } from "../types";

// Initialize the client. API_KEY is guaranteed to be in process.env.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function generateSpeech(text: string, voice: VoiceName): Promise<string> {
  if (!text || !text.trim()) {
    throw new Error("Text cannot be empty");
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ 
        parts: [{ text: text.trim() }] 
      }],
      config: {
        // Correct usage of Modality enum from @google/genai
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
  } catch (error: any) {
    console.error("Gemini TTS Error:", error);
    // Handle generic XHR/RPC errors which often indicate network/proxy interruptions
    if (error.toString().includes("xhr error") || error.toString().includes("Rpc failed")) {
      throw new Error("Network connection to AI service failed. Please try again.");
    }
    throw error;
  }
}

export async function translateText(text: string, targetLanguage: 'English' | 'Afrikaans'): Promise<string> {
  try {
    const response = await ai.models.generateContent({
      // Recommended model for simple translation tasks
      model: "gemini-3.1-flash-lite",
      contents: [{
        parts: [{ 
          text: `Translate the following text to ${targetLanguage}. Keep the tone professional and educational. Do not include any preamble or explanation, just the translated text. Text: "${text}"` 
        }]
      }],
    });

    return response.text || text;
  } catch (error) {
    console.error("Translation Error:", error);
    throw error;
  }
}
