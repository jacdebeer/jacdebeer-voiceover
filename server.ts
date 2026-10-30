import express from "express";
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer, WebSocket } from "ws";
import { GoogleGenAI, Modality, LiveServerMessage } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
// Port 3000 is required by the runtime environment and Nginx reverse proxy
const port = 3000;

// Body parsing with higher limits for audio payloads
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Initialize GoogleGenAI server-side with telemetry User-Agent
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

// Health check endpoint
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: Date.now() });
});

// 1. Audio Transcription using gemini-3.5-transcribe
app.post("/api/transcribe", async (req, res) => {
  try {
    const { audioBase64, mimeType = "audio/webm", language = "af" } = req.body;

    if (!audioBase64) {
      return res.status(400).json({ error: "Missing audioBase64 parameter" });
    }

    let promptInstruction = "Please transcribe this audio recording accurately into text. Maintain proper punctuation and capitalization.";
    if (language === "af") {
      promptInstruction = "Transkribeer hierdie Afrikaanse klankopname akkuraat na teks. Behou alle eiename, Afrikaanse grammatika en sinsbou sonder enige verduidelikings of inleidende teks. Gee slegs die getranskribeerde teks terug.";
    } else if (language === "en") {
      promptInstruction = "Transcribe this English audio recording accurately into text. Return only the transcribed text without preambles or explanations.";
    }

    const audioPart = {
      inlineData: {
        mimeType: mimeType || "audio/webm",
        data: audioBase64,
      },
    };

    const response = await ai.models.generateContent({
      model: "gemini-3.5-transcribe",
      contents: {
        parts: [audioPart, { text: promptInstruction }],
      },
    });

    const transcription = response.text?.trim() || "";
    res.json({ text: transcription });
  } catch (error: any) {
    console.error("Transcription error:", error);
    res.status(500).json({ error: error.message || "Failed to transcribe audio" });
  }
});

// 2. High-Quality Speech Generation using gemini-3.8-flash-lite-tts (Standard high-quota TTS)
app.post("/api/tts", async (req, res) => {
  try {
    const { text, voiceName = "Kore", style, isAfrikaans = false } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Text cannot be empty" });
    }

    // Default or custom style description for natural conversational phrasing
    const defaultStyle = isAfrikaans
      ? "Natuurlike, warm, lewendige en boeiende Afrikaanse spraakstyl met outentieke intonasie en duidelike artikulasie."
      : "Natural, conversational, engaging e-learning voice-over narrator with clear pacing.";

    const speechStyle = style || defaultStyle;

    // Ensure valid prebuilt voice name for gemini-3.8-flash-lite-tts ('Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr')
    const VALID_VOICES = ["Puck", "Charon", "Kore", "Fenrir", "Zephyr"];
    const targetVoice = VALID_VOICES.includes(voiceName) ? voiceName : (voiceName === "Aoede" ? "Kore" : "Kore");

    // Primary attempt with gemini-3.8-flash-lite-tts (high throughput, general TTS)
    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash-lite-tts",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: text.trim(),
              speechMetadata: {
                style: speechStyle,
              },
            },
          ],
        },
      ] as any,
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: targetVoice },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (!base64Audio) {
      throw new Error("No audio data returned from the model.");
    }

    res.json({ audioBase64: base64Audio });
  } catch (error: any) {
    console.error("TTS generation error:", error);
    const errorStr = typeof error === "object" ? JSON.stringify(error) : String(error);
    const isQuota = error.status === 429 || 
      errorStr.includes("429") || 
      errorStr.includes("RESOURCE_EXHAUSTED") || 
      errorStr.includes("Quota exceeded");

    if (isQuota) {
      return res.status(429).json({ 
        error: "Gemini TTS quota exceeded.",
        isQuotaExceeded: true,
        fallbackToBrowser: true 
      });
    }

    res.status(500).json({ error: error.message || "Failed to generate speech" });
  }
});

// 3. Translation using gemini-3.8-flash
app.post("/api/translate", async (req, res) => {
  try {
    const { text, targetLanguage = "Afrikaans" } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Text cannot be empty" });
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: [
        {
          parts: [
            {
              text: `Translate the following text to ${targetLanguage}. Maintain an educational, engaging, and conversational tone suitable for course audio narration. Do not include any notes, preamble, or commentary, just the translated text: "${text.trim()}"`,
            },
          ],
        },
      ],
    });

    res.json({ translatedText: response.text?.trim() || text });
  } catch (error: any) {
    console.error("Translation error:", error);
    res.status(500).json({ error: error.message || "Failed to translate text" });
  }
});

// 4. Conversational Polish / Script Enhancer for Course Voiceovers
app.post("/api/enhance-conversational", async (req, res) => {
  try {
    const { text, language = "af" } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Text cannot be empty" });
    }

    const prompt = language === "af"
      ? `Herskryf die volgende lesing-teks om te klink soos 'n lewendige, natuurlike en boeiende Afrikaanse stemopname. Maak die sinsbou vloeiend vir spraak, voeg warm natuurlike oorgange by (soos "Welkom by...", "Kom ons kyk na...", "Onthou dat..."), maar behou alle noodsaaklike inligting akkuraat. Gee SLEGS die herskrewe Afrikaanse teks terug sonder notas:\n\n${text}`
      : `Rewrite the following lecture text to sound like an engaging, conversational, natural voice-over script. Make sentences flow effortlessly for speech, but retain all essential facts. Return ONLY the rewritten text:\n\n${text}`;

    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: [{ parts: [{ text: prompt }] }],
    });

    res.json({ enhancedText: response.text?.trim() || text });
  } catch (error: any) {
    console.error("Enhance script error:", error);
    res.status(500).json({ error: error.message || "Failed to enhance script" });
  }
});

// WebSocket Server for Live Voice Conversations (gemini-3.8-live)
const wss = new WebSocketServer({ server, path: "/live" });

wss.on("connection", async (clientWs: WebSocket) => {
  let session: any = null;
  let isClientConnected = true;

  const cleanupSession = () => {
    try {
      if (session) {
        session.close?.();
        session = null;
      }
    } catch (e) {
      // Ignore cleanup error
    }
  };

  clientWs.on("close", () => {
    isClientConnected = false;
    cleanupSession();
  });

  clientWs.on("error", () => {
    isClientConnected = false;
    cleanupSession();
  });

  const initLiveSession = async (voiceName = "Zephyr", language = "af") => {
    cleanupSession();

    const systemInstruction = language === "af"
      ? "Jy is 'n intelligente, vriendelike en boeiende Afrikaanse e-kursus mentor en gespreksgenoot. Gesels vlot, natuurlik en warm in Afrikaans (of skakel oor na Engels as die student Engels praat). Behou 'n natuurlike geselsstyl geskik vir regstreekse stemgesprekke. Hou antwoorde gefokus en bondig."
      : "You are an intelligent, friendly, and engaging e-course mentor and voice companion. Converse fluently and naturally in English (or Afrikaans if preferred). Maintain a warm conversational tone suited for real-time speech. Keep responses focused and engaging.";

    try {
      session = await ai.live.connect({
        model: "gemini-3.8-live",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voiceName || "Zephyr" },
            },
          },
          systemInstruction,
        },
        callbacks: {
          onmessage: (message: LiveServerMessage) => {
            if (!isClientConnected || clientWs.readyState !== WebSocket.OPEN) return;

            const parts = message.serverContent?.modelTurn?.parts || [];
            for (const part of parts) {
              if (part.inlineData?.data) {
                clientWs.send(JSON.stringify({ type: "audio", audio: part.inlineData.data }));
              }
              if (part.text) {
                clientWs.send(JSON.stringify({ type: "text", text: part.text }));
              }
            }

            if (message.serverContent?.interrupted) {
              clientWs.send(JSON.stringify({ type: "interrupted" }));
            }
          },
          onclose: () => {
            if (isClientConnected && clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ type: "session_closed" }));
            }
          },
          onerror: (err: any) => {
            console.error("Gemini Live callback error:", err);
            if (isClientConnected && clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ type: "error", message: err?.message || "Live API error" }));
            }
          },
        },
      });

      if (isClientConnected && clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ type: "connected" }));
      }
    } catch (err: any) {
      console.error("Error connecting to Gemini Live:", err);
      if (isClientConnected && clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ type: "error", message: err?.message || "Failed to start live session" }));
      }
    }
  };

  clientWs.on("message", async (rawMessage: any) => {
    try {
      const msg = JSON.parse(rawMessage.toString());

      if (msg.type === "start") {
        await initLiveSession(msg.voiceName || "Zephyr", msg.language || "af");
      } else if (msg.type === "audio" && msg.data) {
        if (!session) {
          await initLiveSession();
        }
        session?.sendRealtimeInput({
          audio: { data: msg.data, mimeType: "audio/pcm;rate=16000" },
        });
      } else if (msg.type === "stop") {
        cleanupSession();
      }
    } catch (e: any) {
      console.error("Failed to process message from client:", e);
    }
  });
});

// Mount Vite or static files
async function startServer() {
  const distDir = path.join(__dirname, "dist");
  const hasDist = fs.existsSync(distDir) && fs.existsSync(path.join(distDir, "index.html"));
  const isProduction = process.env.NODE_ENV === "production" || (process.env.NODE_ENV !== "development" && hasDist);

  if (!isProduction) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        hmr: false,
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distDir));
    app.use((_req, res) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  }

  server.on("error", (err: any) => {
    console.error("HTTP server error:", err);
  });

  wss.on("error", (err: any) => {
    console.error("WebSocket server error:", err);
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`Server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error("Server startup error:", err);
});
