import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, BookOpen, Sparkles, AlertCircle, Globe, ArrowRightLeft } from 'lucide-react';
import { VoiceName, VOICE_OPTIONS, AudioState } from './types';
import { generateSpeech, translateText } from './services/geminiService';
import { decodeBase64, decodeAudioData, convertPcmToMp3 } from './utils/audioUtils';
import { Visualizer } from './components/Visualizer';
import { Controls } from './components/Controls';

const DEFAULT_TEXT_EN = `Welcome to Chapter 1: Introduction to Artificial Intelligence. 
In this module, we will explore the fundamental concepts of machine learning and how neural networks process information similar to the human brain. 
Please ensure you have completed the prerequisite reading before proceeding.`;

const DEFAULT_TEXT_AF = `Welkom by Hoofstuk 1: Inleiding tot Kunsmatige Intelligensie. 
In hierdie module sal ons die fundamentele konsepte van masjienleer verken en hoe neurale netwerke inligting verwerk, soortgelyk aan die menslike brein. 
Maak asseblief seker dat u die voorvereiste leeswerk voltooi het voordat u voortgaan.`;

type Language = 'en' | 'af';

const App: React.FC = () => {
  // State
  const [language, setLanguage] = useState<Language>('en');
  const [text, setText] = useState<string>(DEFAULT_TEXT_EN);
  const [selectedVoice, setSelectedVoice] = useState<VoiceName>(VoiceName.Kore);
  const [audioState, setAudioState] = useState<AudioState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    isLoading: false,
    error: null,
    hasAudio: false,
  });
  const [isTranslating, setIsTranslating] = useState(false);

  // Refs for Audio Context
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedAtRef = useRef<number>(0);
  
  // Store raw bytes for download
  const rawAudioBytesRef = useRef<Uint8Array | null>(null);

  // Initialize Audio Context on user interaction (handled lazily)
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 24000, // Match Gemini's output
      });
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      analyserRef.current.connect(audioContextRef.current.destination);
    }
    return audioContextRef.current;
  }, []);

  const handleGenerate = async () => {
    if (!text.trim()) return;

    setAudioState(prev => ({ ...prev, isLoading: true, error: null, isPlaying: false }));
    stopAudio(); // Stop any current playback

    try {
      const base64Audio = await generateSpeech(text, selectedVoice);
      const rawBytes = decodeBase64(base64Audio);
      
      // Store raw bytes for potential download
      rawAudioBytesRef.current = rawBytes;

      const ctx = getAudioContext();
      const buffer = await decodeAudioData(rawBytes, ctx);
      
      audioBufferRef.current = buffer;
      pausedAtRef.current = 0;
      
      setAudioState(prev => ({
        ...prev,
        isLoading: false,
        hasAudio: true,
        duration: buffer.duration,
        currentTime: 0
      }));

    } catch (err: any) {
      console.error(err);
      setAudioState(prev => ({
        ...prev,
        isLoading: false,
        error: err.message || "Failed to generate audio"
      }));
    }
  };

  const handleDownload = () => {
    if (!rawAudioBytesRef.current) return;

    try {
      // Convert to MP3
      const mp3Blob = convertPcmToMp3(rawAudioBytesRef.current, 24000);
      
      // Create download link
      const url = URL.createObjectURL(mp3Blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `course-audio-${language}-${selectedVoice.toLowerCase()}.mp3`;
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (err) {
      console.error("Download failed:", err);
      setAudioState(prev => ({ ...prev, error: "Failed to create MP3 file" }));
    }
  };

  const handleTranslate = async () => {
    if (!text.trim()) return;
    
    setIsTranslating(true);
    const targetLang = language === 'en' ? 'Afrikaans' : 'English';
    const targetCode = language === 'en' ? 'af' : 'en';

    try {
      const translated = await translateText(text, targetLang);
      setText(translated);
      setLanguage(targetCode);
    } catch (err) {
      console.error("Translation failed", err);
      setAudioState(prev => ({ ...prev, error: "Translation failed. Please try again." }));
    } finally {
      setIsTranslating(false);
    }
  };

  const handleLanguageSwitch = (newLang: Language) => {
    if (language === newLang) return;
    
    // If text matches default, swap default
    if (language === 'en' && text.trim() === DEFAULT_TEXT_EN.trim()) {
      setText(DEFAULT_TEXT_AF);
    } else if (language === 'af' && text.trim() === DEFAULT_TEXT_AF.trim()) {
      setText(DEFAULT_TEXT_EN);
    }
    // If text is custom, we leave it (user can use translate button)
    
    setLanguage(newLang);
  };

  const playAudio = async () => {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    if (!audioBufferRef.current || !analyserRef.current) return;

    // Create a new source node (they are one-time use)
    const source = ctx.createBufferSource();
    source.buffer = audioBufferRef.current;
    source.connect(analyserRef.current);
    
    sourceNodeRef.current = source;
    
    // Calculate start time based on where we paused
    const offset = pausedAtRef.current;
    startTimeRef.current = ctx.currentTime - offset;

    source.start(0, offset);
    
    setAudioState(prev => ({ ...prev, isPlaying: true }));

    // Handle when audio ends naturally
    source.onended = () => {
      // Check if it ended because we stopped it or because it finished
      // We'll trust state checks in the loop for UI updates, 
      // but if the buffer duration is reached, we reset.
      const currentTime = ctx.currentTime - startTimeRef.current;
      if (currentTime >= audioBufferRef.current!.duration) {
         setAudioState(prev => ({ ...prev, isPlaying: false, currentTime: 0 }));
         pausedAtRef.current = 0;
      }
    };
  };

  const pauseAudio = () => {
    if (sourceNodeRef.current) {
      const ctx = getAudioContext();
      sourceNodeRef.current.stop();
      sourceNodeRef.current = null;
      pausedAtRef.current = ctx.currentTime - startTimeRef.current;
      setAudioState(prev => ({ ...prev, isPlaying: false }));
    }
  };

  const stopAudio = () => {
    if (sourceNodeRef.current) {
      sourceNodeRef.current.stop();
      sourceNodeRef.current = null;
    }
    pausedAtRef.current = 0;
    setAudioState(prev => ({ ...prev, isPlaying: false, currentTime: 0 }));
  };

  const togglePlayPause = () => {
    if (audioState.isPlaying) {
      pauseAudio();
    } else {
      playAudio();
    }
  };

  // Animation loop for updating progress
  useEffect(() => {
    let animationFrameId: number;

    const updateProgress = () => {
      if (audioState.isPlaying && audioContextRef.current) {
        const current = audioContextRef.current.currentTime - startTimeRef.current;
        setAudioState(prev => ({ 
          ...prev, 
          currentTime: Math.min(current, prev.duration) 
        }));
        animationFrameId = requestAnimationFrame(updateProgress);
      }
    };

    if (audioState.isPlaying) {
      updateProgress();
    }

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [audioState.isPlaying]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 md:p-8">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col md:flex-row border border-slate-100">
        
        {/* Left Panel: Content Input */}
        <div className="w-full md:w-3/5 p-6 md:p-8 flex flex-col border-b md:border-b-0 md:border-r border-slate-100 relative">
          
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-2">
              <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                <BookOpen size={24} />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-800">Course Content</h1>
                <p className="text-sm text-slate-500">
                  {language === 'en' ? 'Paste your lesson text below' : 'Plak jou les teks hieronder'}
                </p>
              </div>
            </div>
          </div>
          
          {/* Language Tabs */}
          <div className="flex items-center space-x-1 mb-4 bg-slate-100 p-1 rounded-lg w-fit">
            <button
              onClick={() => handleLanguageSwitch('en')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                language === 'en' 
                  ? 'bg-white text-indigo-600 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              English
            </button>
            <button
              onClick={() => handleLanguageSwitch('af')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                language === 'af' 
                  ? 'bg-white text-indigo-600 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Afrikaans
            </button>
          </div>

          <textarea
            className="flex-1 w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-slate-700 leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all resize-none text-base"
            placeholder="Enter course material here..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
          />
          
          <div className="mt-4 flex justify-between items-center text-xs">
             <span className="text-slate-400">{text.length} characters</span>
             <button 
               onClick={handleTranslate}
               disabled={isTranslating || !text}
               className="flex items-center space-x-1 text-indigo-600 hover:text-indigo-700 disabled:opacity-50 transition-colors"
             >
               <ArrowRightLeft size={14} className={isTranslating ? 'animate-spin' : ''} />
               <span>
                 {isTranslating 
                   ? 'Translating...' 
                   : language === 'en' ? 'Translate to Afrikaans' : 'Vertaal na Engels'}
               </span>
             </button>
          </div>
        </div>

        {/* Right Panel: Voice Settings & Player */}
        <div className="w-full md:w-2/5 bg-slate-50 p-6 md:p-8 flex flex-col">
          <div className="flex items-center space-x-2 mb-6">
            <div className="p-2 bg-pink-100 text-pink-600 rounded-lg">
              <Mic size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">Voice Studio</h2>
              <p className="text-sm text-slate-500">
                {language === 'af' ? 'Kies jou verteller' : 'Configure your narrator'}
              </p>
            </div>
          </div>

          {/* Voice Selection */}
          <div className="space-y-4 mb-8">
            <label className="text-xs font-semibold uppercase text-slate-400 tracking-wider flex items-center justify-between">
              <span>Select Voice</span>
              <span className="text-[10px] bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded">Multilingual</span>
            </label>
            <div className="grid grid-cols-1 gap-3">
              {VOICE_OPTIONS.map((voice) => (
                <button
                  key={voice.id}
                  onClick={() => setSelectedVoice(voice.id)}
                  className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                    selectedVoice === voice.id
                      ? 'bg-white border-indigo-500 shadow-md ring-1 ring-indigo-500'
                      : 'bg-white border-slate-200 hover:border-indigo-300'
                  }`}
                >
                  <div className="flex flex-col items-start">
                    <span className="font-medium text-slate-700">{voice.label}</span>
                    <span className="text-xs text-slate-400">{voice.description}</span>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    voice.gender === 'Female' ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-600'
                  }`}>
                    {voice.gender}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Action Button */}
          <button
            onClick={handleGenerate}
            disabled={audioState.isLoading || !text.trim()}
            className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl font-semibold shadow-lg shadow-indigo-200 transition-all flex items-center justify-center space-x-2 group"
          >
            {audioState.isLoading ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Generating Audio...</span>
              </>
            ) : (
              <>
                <Sparkles size={20} className="group-hover:scale-110 transition-transform" />
                <span>
                  {language === 'af' ? 'Genereer Klank' : 'Generate Voice-Over'}
                </span>
              </>
            )}
          </button>

          {/* Error Message */}
          {audioState.error && (
            <div className="mt-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center">
              <AlertCircle size={16} className="mr-2 flex-shrink-0" />
              {audioState.error}
            </div>
          )}

          {/* Player Section */}
          {audioState.hasAudio && (
            <div className="mt-8 animate-fade-in-up">
              <Visualizer analyser={analyserRef.current} isPlaying={audioState.isPlaying} />
              
              <div className="mt-2 flex justify-between text-xs text-slate-400 font-mono">
                <span>{audioState.currentTime.toFixed(1)}s</span>
                <span>{audioState.duration.toFixed(1)}s</span>
              </div>

              <Controls 
                isPlaying={audioState.isPlaying}
                onPlayPause={togglePlayPause}
                onReset={stopAudio}
                onDownload={handleDownload}
                disabled={audioState.isLoading}
              />
            </div>
          )}
          
        </div>
      </div>
    </div>
  );
};

export default App;