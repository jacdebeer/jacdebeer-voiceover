import React, { useState, useEffect, useRef } from 'react';
import { 
  X, Mic, MicOff, Volume2, Sparkles, MessageSquare, AlertCircle, 
  ArrowRight, Loader, Radio, Square, RefreshCw 
} from 'lucide-react';
import { pcmFloat32ToBase64, decodeBase64 } from '../utils/audioUtils';

interface LiveConversationModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentLanguage: 'en' | 'af';
  onInsertToSlide: (text: string) => void;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  time: string;
}

export const LiveConversationModal: React.FC<LiveConversationModalProps> = ({
  isOpen,
  onClose,
  currentLanguage,
  onInsertToSlide,
}) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState<string>('Zephyr');
  const chatLanguage = currentLanguage;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [errorStatus, setErrorStatus] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const scheduledTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);

  // Start live session
  const startLiveSession = async () => {
    setErrorStatus(null);
    setIsConnecting(true);
    try {
      // 1. Setup AudioContexts
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const inputCtx = new AudioCtx({ sampleRate: 16000 });
      const outputCtx = new AudioCtx({ sampleRate: 24000 });
      inputAudioCtxRef.current = inputCtx;
      outputAudioCtxRef.current = outputCtx;
      scheduledTimeRef.current = outputCtx.currentTime;

      // 2. Setup Mic Stream
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        }
      });
      mediaStreamRef.current = stream;

      // 3. Connect WebSocket
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/live`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnecting(false);
        setIsConnected(true);
        // Send initial configuration
        ws.send(JSON.stringify({
          type: 'start',
          voiceName: selectedVoice,
          language: chatLanguage,
        }));
      };

      ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === 'connected') {
            setIsConnected(true);
            setIsConnecting(false);
          } else if (msg.type === 'audio' && msg.audio) {
            setIsAiSpeaking(true);
            playAudioChunk(msg.audio);
          } else if (msg.type === 'text' && msg.text) {
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last && last.role === 'assistant') {
                return [
                  ...prev.slice(0, -1),
                  { ...last, text: last.text + msg.text }
                ];
              } else {
                return [
                  ...prev,
                  {
                    id: String(Date.now()),
                    role: 'assistant',
                    text: msg.text,
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  }
                ];
              }
            });
          } else if (msg.type === 'interrupted') {
            stopAllAudio();
            setIsAiSpeaking(false);
          } else if (msg.type === 'error') {
            setErrorStatus(msg.message || "Live API error occurred");
          }
        } catch (e) {
          console.error("Error parsing WebSocket message:", e);
        }
      };

      ws.onerror = () => {
        setErrorStatus("WebSocket connection failed.");
        setIsConnecting(false);
        setIsConnected(false);
      };

      ws.onclose = () => {
        setIsConnected(false);
        setIsConnecting(false);
      };

      // 4. Hook microphone to processor
      const source = inputCtx.createMediaStreamSource(stream);
      const processor = inputCtx.createScriptProcessor(4096, 1, 1);
      scriptProcessorRef.current = processor;

      source.connect(processor);
      processor.connect(inputCtx.destination);

      processor.onaudioprocess = (e) => {
        if (ws.readyState === WebSocket.OPEN && !isMuted) {
          const channelData = e.inputBuffer.getChannelData(0);
          
          // Detect speech volume
          let sum = 0;
          for (let i = 0; i < channelData.length; i++) {
            sum += Math.abs(channelData[i]);
          }
          const avg = sum / channelData.length;
          setIsUserSpeaking(avg > 0.02);

          const base64Audio = pcmFloat32ToBase64(channelData);
          ws.send(JSON.stringify({
            type: 'audio',
            data: base64Audio,
          }));
        }
      };

    } catch (err: any) {
      setErrorStatus(err.message || "Failed to initialize live voice conversation");
      setIsConnecting(false);
      setIsConnected(false);
    }
  };

  const playAudioChunk = (base64Audio: string) => {
    if (!outputAudioCtxRef.current) return;
    const ctx = outputAudioCtxRef.current;
    if (ctx.state === 'suspended') ctx.resume();

    try {
      const rawBytes = decodeBase64(base64Audio);
      const int16 = new Int16Array(rawBytes.buffer);
      const float32 = new Float32Array(int16.length);

      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 32768.0;
      }

      const buffer = ctx.createBuffer(1, float32.length, 24000);
      buffer.getChannelData(0).set(float32);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);

      const currentTime = ctx.currentTime;
      const startTime = Math.max(currentTime, scheduledTimeRef.current);
      source.start(startTime);
      scheduledTimeRef.current = startTime + buffer.duration;

      activeSourcesRef.current.push(source);
      source.onended = () => {
        activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== source);
        if (activeSourcesRef.current.length === 0) {
          setIsAiSpeaking(false);
        }
      };
    } catch (e) {
      console.warn("Failed to play raw PCM chunk", e);
    }
  };

  const stopAllAudio = () => {
    activeSourcesRef.current.forEach(source => {
      try { source.stop(); } catch (e) {}
    });
    activeSourcesRef.current = [];
    if (outputAudioCtxRef.current) {
      scheduledTimeRef.current = outputAudioCtxRef.current.currentTime;
    }
  };

  const endLiveSession = () => {
    stopAllAudio();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    if (inputAudioCtxRef.current) {
      inputAudioCtxRef.current.close();
      inputAudioCtxRef.current = null;
    }
    if (outputAudioCtxRef.current) {
      outputAudioCtxRef.current.close();
      outputAudioCtxRef.current = null;
    }
    setIsConnected(false);
    setIsConnecting(false);
    setIsAiSpeaking(false);
    setIsUserSpeaking(false);
  };

  useEffect(() => {
    if (!isOpen) {
      endLiveSession();
    }
    return () => {
      endLiveSession();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600 p-5 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center font-bold">
              <Radio size={22} className={isConnected ? "animate-pulse text-emerald-300" : "text-white"} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold tracking-tight">
                  {currentLanguage === 'af' ? "Regstreekse Stemgesprek" : "Live Voice Conversation"}
                </h3>
                <span className="text-[10px] font-black uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded-full">
                  gemini-3.8-live
                </span>
              </div>
              <p className="text-xs text-white/80 font-medium">
                {currentLanguage === 'af' 
                  ? "Praat intyds met Gemini Live in Afrikaans of Engels" 
                  : "Converse in real-time with ultra-low latency Gemini Live"}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              endLiveSession();
              onClose();
            }}
            className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Settings Bar */}
        <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">

          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-500">
              {currentLanguage === 'af' ? "Stem:" : "Voice:"}
            </span>
            <select
              value={selectedVoice}
              onChange={(e) => setSelectedVoice(e.target.value)}
              disabled={isConnected}
              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 font-bold text-slate-700 focus:outline-none"
            >
              <option value="Zephyr">Zephyr (Sag & Vriendelik)</option>
              <option value="Kore">Kore (Helder & Warm)</option>
              <option value="Puck">Puck (Energiek & Helder)</option>
              <option value="Charon">Charon (Diep & Gesaghebbend)</option>
              <option value="Fenrir">Fenrir (Vlot & Dinamies)</option>
            </select>
          </div>
        </div>

        {/* Live Conversation Visualizer Area */}
        <div className="p-6 flex flex-col items-center justify-center bg-slate-900 text-white min-h-[200px] relative overflow-hidden">
          
          {/* Animated Ambient Rings */}
          <div className={`absolute w-64 h-64 rounded-full border border-violet-500/30 transition-all duration-700 ${
            isAiSpeaking ? 'scale-125 border-violet-400/60 animate-ping' : isUserSpeaking ? 'scale-110 border-emerald-400/50' : 'scale-90'
          }`} />
          <div className={`absolute w-44 h-44 rounded-full bg-violet-600/10 blur-xl transition-all ${
            isAiSpeaking ? 'bg-violet-500/30 scale-150' : ''
          }`} />

          {/* Central Status Icon */}
          <div className={`relative z-10 w-24 h-24 rounded-full flex items-center justify-center transition-all shadow-2xl ${
            isAiSpeaking
              ? 'bg-gradient-to-tr from-violet-600 to-fuchsia-500 scale-110 shadow-violet-500/50'
              : isUserSpeaking
              ? 'bg-gradient-to-tr from-emerald-600 to-teal-500 scale-105 shadow-emerald-500/50'
              : isConnected
              ? 'bg-slate-800 border-2 border-slate-700 shadow-slate-800'
              : 'bg-slate-800/60'
          }`}>
            {isAiSpeaking ? (
              <Volume2 size={40} className="text-white animate-bounce" />
            ) : isUserSpeaking ? (
              <Mic size={40} className="text-white animate-pulse" />
            ) : isConnected ? (
              <Radio size={36} className="text-slate-400" />
            ) : (
              <MicOff size={36} className="text-slate-600" />
            )}
          </div>

          {/* Live Status Label */}
          <div className="mt-5 text-center relative z-10">
            {isConnecting ? (
              <div className="flex items-center gap-2 text-violet-300 text-sm font-bold">
                <Loader className="animate-spin" size={16} />
                <span>{currentLanguage === 'af' ? "Koppel tans aan Gemini Live..." : "Connecting to Gemini Live..."}</span>
              </div>
            ) : isConnected ? (
              <div>
                <p className="text-sm font-extrabold text-white">
                  {isAiSpeaking 
                    ? (currentLanguage === 'af' ? "Gemini praat tans..." : "Gemini is speaking...")
                    : isUserSpeaking
                    ? (currentLanguage === 'af' ? "Jy praat tans..." : "Listening to you...")
                    : (currentLanguage === 'af' ? "Regstreeks gekoppel — Praat vrylik in die mikrofoon" : "Live connected — Speak into your mic")}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {currentLanguage === 'af' ? "Praat enige tyd om Gemini te onderbreek" : "Speak anytime to interrupt naturally"}
                </p>
              </div>
            ) : (
              <div>
                <p className="text-sm font-bold text-slate-300">
                  {currentLanguage === 'af' ? "Sessie nie aktief nie" : "Live Session Disconnected"}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {currentLanguage === 'af' ? "Druk 'Begin Regstreekse Gesprek' om te begin" : "Click 'Start Live Conversation' to begin"}
                </p>
              </div>
            )}
          </div>

          {/* Live Interrupt Button when AI is speaking */}
          {isConnected && isAiSpeaking && (
            <button
              onClick={stopAllAudio}
              className="mt-3 relative z-10 px-3 py-1 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-full text-[11px] font-bold flex items-center gap-1.5 transition-all"
            >
              <Square size={10} fill="currentColor" />
              <span>{currentLanguage === 'af' ? "Onderbreek Klank" : "Interrupt AI"}</span>
            </button>
          )}
        </div>

        {/* Live Conversation Transcript / Action Area */}
        <div className="p-4 flex-1 flex flex-col min-h-[160px] max-h-[220px] bg-slate-50 border-t border-slate-200 overflow-y-auto custom-scrollbar">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-extrabold uppercase text-slate-500 tracking-wider">
              {currentLanguage === 'af' ? "Regstreekse Boodskappe / Transkripsie" : "Live Transcript Log"}
            </span>
            {messages.length > 0 && (
              <span className="text-[10px] text-slate-400 font-bold">
                {messages.length} {messages.length === 1 ? 'item' : 'items'}
              </span>
            )}
          </div>

          {messages.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-xs italic">
              {currentLanguage === 'af' 
                ? "Geen boodskappe nog nie. Begin praat om 'n lewendige transkripsie te sien." 
                : "No messages yet. Speak to see live conversation notes."}
            </div>
          ) : (
            <div className="space-y-2.5">
              {messages.map((m) => (
                <div key={m.id} className="p-3 bg-white rounded-xl border border-slate-200 shadow-sm text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-extrabold text-violet-700">
                      {m.role === 'assistant' ? 'Gemini Live' : 'Student'}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400 font-mono">{m.time}</span>
                      <button
                        onClick={() => onInsertToSlide(m.text)}
                        className="px-2 py-0.5 bg-violet-50 hover:bg-violet-100 text-violet-700 text-[10px] font-bold rounded flex items-center gap-1 transition-colors"
                        title="Insert into current slide"
                      >
                        <Sparkles size={11} />
                        <span>{currentLanguage === 'af' ? "Voeg by Skyfie" : "Insert to Slide"}</span>
                      </button>
                    </div>
                  </div>
                  <p className="text-slate-700 leading-relaxed">{m.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {errorStatus && (
          <div className="p-3 bg-rose-50 border-t border-rose-200 text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle size={15} className="flex-none" />
            <span>{errorStatus}</span>
          </div>
        )}

        {/* Footer Controls */}
        <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between gap-3">
          {isConnected ? (
            <>
              <button
                onClick={() => setIsMuted(!isMuted)}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all border ${
                  isMuted 
                    ? 'bg-rose-50 border-rose-300 text-rose-700' 
                    : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {isMuted ? <MicOff size={15} /> : <Mic size={15} />}
                <span>{isMuted ? (currentLanguage === 'af' ? "Gedemp" : "Muted") : (currentLanguage === 'af' ? "Demp Mikrofoon" : "Mute Mic")}</span>
              </button>

              <button
                onClick={endLiveSession}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-md shadow-rose-200 flex items-center gap-2 transition-all"
              >
                <Square size={14} fill="currentColor" />
                <span>{currentLanguage === 'af' ? "Beëindig Gesprek" : "End Conversation"}</span>
              </button>
            </>
          ) : (
            <button
              onClick={startLiveSession}
              disabled={isConnecting}
              className="w-full py-3 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-xl text-xs font-extrabold shadow-lg shadow-violet-200 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              {isConnecting ? (
                <>
                  <Loader className="animate-spin" size={15} />
                  <span>{currentLanguage === 'af' ? "Koppel tans..." : "Connecting..."}</span>
                </>
              ) : (
                <>
                  <Radio size={16} />
                  <span>{currentLanguage === 'af' ? "Begin Regstreekse Gesprek (Live API)" : "Start Live Voice Conversation"}</span>
                </>
              )}
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
