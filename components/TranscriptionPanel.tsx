import React, { useState, useRef, useEffect } from 'react';
import { 
  Mic, Square, Upload, Play, Pause, Sparkles, Volume2, Copy, Check, 
  ArrowRight, FileAudio, RotateCcw, AlertCircle, Loader, MessageSquareQuote,
  SlidersHorizontal, CheckCircle2, Download
} from 'lucide-react';
import { VOICE_OPTIONS, VoiceOption } from '../types';
import { transcribeAudio, generateSpeechForVoice } from '../services/geminiService';
import { VoicePicker } from './VoicePicker';
import { loadAudio, saveAudio } from '../services/workspaceService';
import { base64ToWavBlob, decodeBase64, pcmToWavBlob, speakWithWebSpeech, stopWebSpeech } from '../utils/audioUtils';

const triggerDownload = (url: string, filename: string) => {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

interface TranscriptionPanelProps {
  currentLanguage: 'en' | 'af';
  onApplyToSlide: (text: string) => void;
  onApplyAsNewSlides: (text: string) => void;
  transcribedText: string;
  onTranscribedTextChange: (text: string) => void;
  voices: VoiceOption[];
  selectedVoiceId: string;
  onSelectVoiceId: (id: string) => void;
}

export const TranscriptionPanel: React.FC<TranscriptionPanelProps> = ({
  currentLanguage,
  onApplyToSlide,
  onApplyAsNewSlides,
  transcribedText,
  onTranscribedTextChange: setTranscribedText,
  voices,
  selectedVoiceId,
  onSelectVoiceId,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Voiceover generation for the transcription
  const [isGeneratingVoiceover, setIsGeneratingVoiceover] = useState(false);
  const [voiceoverUrl, setVoiceoverUrl] = useState<string | null>(null);
  const [isPlayingVoiceover, setIsPlayingVoiceover] = useState(false);
  const [previewVoiceId, setPreviewVoiceId] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const liveActiveRef = useRef(false);
  const liveBaseRef = useRef('');
  const [liveSupported] = useState(
    () => typeof window !== 'undefined' && Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
  );

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const voiceoverAudioRef = useRef<HTMLAudioElement | null>(null);

  // Filter realistic Afrikaans voices
  const [showVoicePicker, setShowVoicePicker] = useState(false);

  // Bring back the last saved voiceover when the panel opens
  useEffect(() => {
    let cancelled = false;
    loadAudio('voiceover').then((bytes) => {
      if (cancelled || !bytes) return;
      setVoiceoverUrl((prev) => prev ?? URL.createObjectURL(pcmToWavBlob(bytes, 24000)));
    });
    return () => { cancelled = true; };
  }, []);
  const currentVoice =
    voices.find(v => v.id === selectedVoiceId) ||
    VOICE_OPTIONS.find(v => v.id === selectedVoiceId) ||
    VOICE_OPTIONS.filter(v => v.isAfrVariant)[0];

  useEffect(() => {
    return () => {
      liveActiveRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (voiceoverUrl) URL.revokeObjectURL(voiceoverUrl);
    };
  }, [audioUrl, voiceoverUrl]);

  // Shows words on screen while you speak, using the browser's own speech recognition.
  // The final text still comes from the Gemini transcription after you stop.
  const startLiveCaptions = () => {
    const Recognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Recognition) return;
    liveBaseRef.current = transcribedText.trim();
    liveActiveRef.current = true;
    let finalText = '';
    const start = () => {
      const rec = new Recognition();
      rec.lang = currentLanguage === 'af' ? 'af-ZA' : 'en-ZA';
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (event: any) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const piece = event.results[i][0].transcript;
          if (event.results[i].isFinal) finalText += piece + ' ';
          else interim += piece;
        }
        const live = (finalText + interim).trim();
        setTranscribedText([liveBaseRef.current, live].filter(Boolean).join(' '));
      };
      rec.onend = () => {
        if (liveActiveRef.current) {
          try { start(); } catch { /* recognition could not restart */ }
        }
      };
      rec.onerror = () => { /* the recording itself keeps going */ };
      recognitionRef.current = rec;
      rec.start();
    };
    try { start(); } catch { liveActiveRef.current = false; }
  };

  const stopLiveCaptions = () => {
    liveActiveRef.current = false;
    try { recognitionRef.current?.stop(); } catch { /* already stopped */ }
    recognitionRef.current = null;
  };

  const startRecording = async () => {
    setErrorMessage(null);
    audioChunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const mimeType = mediaRecorder.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach(t => t.stop());
      };

      mediaRecorder.start(250);
      startLiveCaptions();
      setIsRecording(true);
      setRecordingSeconds(0);

      timerRef.current = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);
    } catch (err: any) {
      setErrorMessage(currentLanguage === 'af' 
        ? "Kon nie toegang tot die mikrofoon kry nie. Kontroleer asseblief jou blaaier-toestemmings." 
        : "Could not access microphone. Please check browser permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      stopLiveCaptions();
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);
    setAudioBlob(file);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(URL.createObjectURL(file));
  };

  const handleTranscribe = async () => {
    if (!audioBlob) {
      setErrorMessage(currentLanguage === 'af' ? "Neem asseblief eers klank op of laai 'n klanklêer op." : "Please record audio or upload an audio file first.");
      return;
    }

    setIsTranscribing(true);
    setErrorMessage(null);
    try {
      const mimeType = audioBlob.type || 'audio/webm';
      const text = await transcribeAudio(audioBlob, mimeType, currentLanguage);
      if (!text.trim()) {
        throw new Error(currentLanguage === 'af' ? "Geen woorde kon opgespoor word nie. Probeer asseblief weer." : "No speech could be detected in audio. Please try again.");
      }
      setTranscribedText(text);
    } catch (err: any) {
      setErrorMessage(err.message || "Transcription failed");
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleGenerateVoiceover = async () => {
    if (!transcribedText.trim()) return;

    setIsGeneratingVoiceover(true);
    setErrorMessage(null);
    try {
      const base64 = await generateSpeechForVoice(currentVoice, transcribedText, currentLanguage === 'af');
      void saveAudio('voiceover', decodeBase64(base64));
      const blob = base64ToWavBlob(base64);
      if (voiceoverUrl) URL.revokeObjectURL(voiceoverUrl);
      const newUrl = URL.createObjectURL(blob);
      setVoiceoverUrl(newUrl);

      // Setup audio element for playback
      if (!voiceoverAudioRef.current) {
        voiceoverAudioRef.current = new Audio();
        voiceoverAudioRef.current.onended = () => setIsPlayingVoiceover(false);
      }
      voiceoverAudioRef.current.src = newUrl;
      voiceoverAudioRef.current.play();
      setIsPlayingVoiceover(true);
    } catch (err: any) {
      if (err.isQuotaExceeded || err.message === 'QUOTA_EXCEEDED') {
        speakWithWebSpeech(
          transcribedText,
          currentLanguage,
          currentVoice.gender,
          1.0,
          () => setIsPlayingVoiceover(true),
          () => setIsPlayingVoiceover(false)
        );
        return;
      }
      setErrorMessage(err.message || "Failed to generate voice-over");
    } finally {
      setIsGeneratingVoiceover(false);
    }
  };

  const toggleVoiceoverPlay = () => {
    if (isPlayingVoiceover) {
      if (voiceoverAudioRef.current) voiceoverAudioRef.current.pause();
      stopWebSpeech();
      setIsPlayingVoiceover(false);
    } else {
      if (voiceoverUrl && voiceoverAudioRef.current) {
        voiceoverAudioRef.current.play();
        setIsPlayingVoiceover(true);
      } else if (transcribedText.trim()) {
        speakWithWebSpeech(
          transcribedText,
          currentLanguage,
          currentVoice.gender,
          1.0,
          () => setIsPlayingVoiceover(true),
          () => setIsPlayingVoiceover(false)
        );
      }
    }
  };

  const handleDownloadText = () => {
    if (!transcribedText.trim()) return;
    const blob = new Blob([transcribedText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    triggerDownload(url, 'transcription.txt');
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleDownloadVoiceover = () => {
    if (!voiceoverUrl) return;
    triggerDownload(voiceoverUrl, 'voiceover.wav');
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(transcribedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const previewVoice = async (voice: VoiceOption) => {
    setPreviewVoiceId(voice.id);
    try {
      if (voice.previewUrl) {
        const clip = new Audio(voice.previewUrl);
        clip.onended = () => setPreviewVoiceId(null);
        clip.onerror = () => setPreviewVoiceId(null);
        await clip.play();
        return;
      }
      const sample = currentLanguage === 'af' ? voice.previewSampleText.af : voice.previewSampleText.en;
      const base64 = await generateSpeechForVoice(voice, sample, currentLanguage === 'af');
      const blob = base64ToWavBlob(base64);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => {
        setPreviewVoiceId(null);
        URL.revokeObjectURL(url);
      };
      audio.play();
    } catch (e: any) {
      if (e.isQuotaExceeded || e.message === 'QUOTA_EXCEEDED') {
        const sample = currentLanguage === 'af' ? voice.previewSampleText.af : voice.previewSampleText.en;
        speakWithWebSpeech(
          sample,
          currentLanguage,
          voice.gender,
          1.0,
          () => setPreviewVoiceId(voice.id),
          () => setPreviewVoiceId(null)
        );
        return;
      }
      setPreviewVoiceId(null);
    }
  };

  const formatSecs = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-y-auto custom-scrollbar p-1">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 flex-1">
        
        {/* Left Column: Audio Input & Transcription Engine */}
        <div className="xl:col-span-6 flex flex-col space-y-4">
          
          {/* Header Card */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-violet-100 text-violet-600 flex items-center justify-center font-bold">
                  <Mic size={20} />
                </div>
                <div>
                  <h2 className="text-base font-extrabold text-slate-800">
                    {currentLanguage === 'af' ? "Klank-Transkripsie" : "Audio Transcription"}
                  </h2>
                  <p className="text-[11px] text-slate-500 font-medium">
                    {currentLanguage === 'af' 
                      ? "Transkribeer Afrikaans of Engels met gemini-3.5-transcribe" 
                      : "Transcribe spoken audio into high-accuracy text via gemini-3.5-transcribe"}
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-black uppercase tracking-wider bg-violet-50 text-violet-700 px-2.5 py-1 rounded-full border border-violet-100">
                gemini-3.5-transcribe
              </span>
            </div>

            {/* Audio Source: Mic Recording or File Upload */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              
              {/* Mic Record Card */}
              <div className={`p-4 rounded-xl border transition-all flex flex-col justify-between ${
                isRecording ? 'border-rose-300 bg-rose-50/50' : 'border-slate-200 bg-slate-50/50'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-700">
                    {currentLanguage === 'af' ? "Mikrofoon Opname" : "Microphone Record"}
                  </span>
                  {isRecording && (
                    <span className="flex items-center gap-1.5 text-xs font-mono font-bold text-rose-600 animate-pulse">
                      <span className="w-2 h-2 rounded-full bg-rose-600"></span>
                      {formatSecs(recordingSeconds)}
                    </span>
                  )}
                </div>

                {isRecording && (
                  <p className="text-[10px] font-bold text-violet-600 mt-2">
                    {liveSupported
                      ? (currentLanguage === 'af' ? "Woorde verskyn hieronder terwyl jy praat" : "Words appear below as you speak")
                      : (currentLanguage === 'af' ? "Regstreekse teks werk in Chrome of Edge. Transkribeer na opname." : "Live text needs Chrome or Edge. Transcribe after recording.")}
                  </p>
                )}

                <div className="mt-2">
                  {isRecording ? (
                    <button
                      onClick={stopRecording}
                      className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold shadow-md shadow-rose-200 flex items-center justify-center gap-2 transition-all"
                    >
                      <Square size={14} fill="currentColor" />
                      <span>{currentLanguage === 'af' ? "Stop Opname" : "Stop Recording"}</span>
                    </button>
                  ) : (
                    <button
                      onClick={startRecording}
                      disabled={isTranscribing}
                      className="w-full py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-bold shadow-md shadow-violet-200 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                    >
                      <Mic size={14} />
                      <span>{currentLanguage === 'af' ? "Begin Opneem" : "Start Recording"}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* File Upload Card */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-700">
                    {currentLanguage === 'af' ? "Laai Klanklêer Op" : "Upload Audio File"}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">WAV, MP3, M4A</span>
                </div>

                <div className="relative mt-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="audio/*"
                    onChange={handleFileUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <button
                    type="button"
                    className="w-full py-2.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-sm"
                  >
                    <Upload size={14} className="text-violet-600" />
                    <span>{currentLanguage === 'af' ? "Kies Klanklêer" : "Select Audio"}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Audio Preview Player if audio is ready */}
            {audioUrl && (
              <div className="mb-4 bg-violet-50/60 p-3 rounded-xl border border-violet-100 flex items-center justify-between">
                <div className="flex items-center gap-2.5 text-xs text-violet-900 font-medium">
                  <FileAudio size={18} className="text-violet-600" />
                  <span>
                    {currentLanguage === 'af' ? "Klankopname gereed vir transkripsie" : "Audio loaded & ready for transcription"}
                  </span>
                </div>
                <audio controls src={audioUrl} className="h-8 max-w-[200px]" />
              </div>
            )}

            {/* Run Transcription Button */}
            <button
              onClick={handleTranscribe}
              disabled={!audioBlob || isTranscribing || isRecording}
              className="w-full py-3 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-xl text-xs font-extrabold shadow-lg shadow-violet-200 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              {isTranscribing ? (
                <>
                  <Loader className="animate-spin" size={15} />
                  <span>{currentLanguage === 'af' ? "Transkribeer Tans met Gemini..." : "Transcribing Audio with Gemini..."}</span>
                </>
              ) : (
                <>
                  <Sparkles size={15} />
                  <span>{currentLanguage === 'af' ? "Transkribeer Klank na Teks" : "Transcribe Audio to Text"}</span>
                </>
              )}
            </button>

            {errorMessage && (
              <div className="mt-3 p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle size={15} className="flex-none" />
                <span>{errorMessage}</span>
              </div>
            )}
          </div>

          {/* Transcribed Text Output Card */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex-1 flex flex-col min-h-[220px]">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <MessageSquareQuote size={17} className="text-violet-600" />
                <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                  {currentLanguage === 'af' ? "Getranskribeerde Teks" : "Transcribed Output"}
                </h3>
              </div>
              {transcribedText && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDownloadText}
                    className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-800 transition-colors text-xs flex items-center gap-1 font-bold"
                    title={currentLanguage === 'af' ? "Laai teks af" : "Download text"}
                  >
                    <Download size={13} />
                    <span className="text-[10px]">{currentLanguage === 'af' ? "Laai af" : "Download"}</span>
                  </button>
                  <button
                    onClick={handleCopy}
                    className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-800 transition-colors text-xs flex items-center gap-1 font-bold"
                    title="Copy Text"
                  >
                    {copied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                    <span className="text-[10px]">{copied ? "Copied" : "Copy"}</span>
                  </button>
                  <button
                    onClick={() => setTranscribedText('')}
                    className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-rose-500 transition-colors"
                    title="Clear"
                  >
                    <RotateCcw size={13} />
                  </button>
                </div>
              )}
            </div>

            <textarea
              value={transcribedText}
              onChange={(e) => setTranscribedText(e.target.value)}
              placeholder={currentLanguage === 'af' 
                ? "Getranskribeerde Afrikaanse teks sal hier verskyn. Jy kan dit ook vrylik wysig of redigeer..." 
                : "Transcribed speech will appear here. You can also edit it freely..."}
              className="flex-1 w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-sm leading-relaxed resize-none focus:outline-none focus:border-violet-400 custom-scrollbar"
            />

            {/* Quick Actions to Course Slides */}
            {transcribedText && (
              <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] text-slate-400 font-bold">
                  {transcribedText.length} {currentLanguage === 'af' ? "karakters" : "characters"}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onApplyToSlide(transcribedText)}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    <span>{currentLanguage === 'af' ? "Vervang Huidige Skyfie" : "Apply to Current Slide"}</span>
                    <ArrowRight size={13} />
                  </button>
                  <button
                    onClick={() => onApplyAsNewSlides(transcribedText)}
                    className="px-3 py-1.5 bg-violet-50 hover:bg-violet-100 text-violet-700 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    <Sparkles size={13} />
                    <span>{currentLanguage === 'af' ? "Skep Nuwe Skyfies" : "Create Slides"}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Realistic Conversational Afrikaans Voices for Transcriptions */}
        <div className="xl:col-span-6 flex flex-col space-y-4">
          
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col flex-1">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold">
                  <Volume2 size={20} />
                </div>
                <div>
                  <h2 className="text-base font-extrabold text-slate-800">
                    {currentLanguage === 'af' ? "Lees Transkripsie Voor" : "Voice-over Your Transcription"}
                  </h2>
                  <p className="text-[11px] text-slate-500 font-medium">
                    {currentLanguage === 'af'
                      ? "Kies 'n stem en lees jou transkripsie dadelik voor"
                      : "Choose a voice and read your transcription aloud"}
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full border border-emerald-100">
                {currentVoice.provider === 'elevenlabs' ? 'eleven_v3' : 'gemini-3.8-flash-tts'}
              </span>
            </div>

            {/* Selected Voice Highlight Card */}
            <div className="bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-indigo-500/10 p-4 rounded-xl border border-emerald-200/80 mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-extrabold text-slate-900">{currentVoice.label}</span>
                  <span className="text-[9px] bg-emerald-600 text-white font-black px-1.5 py-0.5 rounded uppercase">
                    {currentVoice.gender}
                  </span>
                  <span className="text-[10px] bg-white text-slate-600 font-bold px-2 py-0.5 rounded border border-emerald-100">
                    {currentVoice.description}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowVoicePicker(true)}
                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm transition-all"
                >
                  {currentLanguage === 'af' ? `Kies stem (${voices.length})` : `Choose voice (${voices.length})`}
                </button>
                <button
                  onClick={() => previewVoice(currentVoice)}
                  className="px-2.5 py-1 bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm transition-all"
                >
                  {previewVoiceId === currentVoice.id ? <Loader className="animate-spin" size={13} /> : <Volume2 size={13} />}
                  <span>{currentLanguage === 'af' ? "Luister Stem" : "Preview"}</span>
                </button>
                </div>
              </div>
              <p className="text-xs text-slate-600 leading-snug font-medium mb-3">
                {currentVoice.conversationalBio}
              </p>

              {/* Instant Voiceover generator for the transcribed text */}
              <div className="pt-3 border-t border-emerald-200/60 flex items-center justify-between gap-3">
                <button
                  onClick={handleGenerateVoiceover}
                  disabled={!transcribedText.trim() || isGeneratingVoiceover}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-200 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  {isGeneratingVoiceover ? (
                    <>
                      <Loader className="animate-spin" size={14} />
                      <span>{currentLanguage === 'af' ? "Genereer Klank..." : "Generating Voice..."}</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} />
                      <span>
                        {currentLanguage === 'af' 
                          ? `Lees Transkripsie met ${currentVoice.label}` 
                          : `Voice-over with ${currentVoice.label}`}
                      </span>
                    </>
                  )}
                </button>

                {voiceoverUrl && (
                  <button
                    onClick={handleDownloadVoiceover}
                    className="p-2.5 bg-white border border-emerald-300 hover:bg-emerald-50 text-emerald-700 rounded-xl transition-all shadow-sm"
                    title={currentLanguage === 'af' ? "Laai klank af (WAV)" : "Download voiceover (WAV)"}
                  >
                    <Download size={16} />
                  </button>
                )}

                {voiceoverUrl && (
                  <button
                    onClick={toggleVoiceoverPlay}
                    className="p-2.5 bg-white border border-emerald-300 hover:bg-emerald-50 text-emerald-700 rounded-xl transition-all shadow-sm"
                    title="Play/Pause Voiceover"
                  >
                    {isPlayingVoiceover ? <Pause size={16} /> : <Play size={16} />}
                  </button>
                )}
              </div>
            </div>

            <VoicePicker
              isOpen={showVoicePicker}
              onClose={() => setShowVoicePicker(false)}
              voices={voices}
              selectedId={selectedVoiceId}
              onSelect={onSelectVoiceId}
              onPreview={previewVoice}
              previewingId={previewVoiceId}
              language={currentLanguage}
            />

          </div>
        </div>

      </div>
    </div>
  );
};
