
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, BookOpen, Sparkles, AlertCircle, ArrowRightLeft, ChevronLeft, ChevronRight, ScanSearch, FileUp, Gauge, Volume2, Loader, Square, Layers, Wand2, Trash2, X, HelpCircle, CheckCircle2 } from 'lucide-react';
import { VoiceName, VOICE_OPTIONS, AudioState, CoursePage, VoiceOption } from './types';
import { generateSpeech, translateText } from './services/geminiService';
import { decodeBase64, pcmToWavBlob } from './utils/audioUtils';
import { Visualizer } from './components/Visualizer';
import { Controls } from './components/Controls';

const DEFAULT_TEXT_EN = `Welcome to Chapter 1: Introduction to Artificial Intelligence. 
In this module, we will explore the fundamental concepts of machine learning and how neural networks process information similar to the human brain. 
Please ensure you have completed the prerequisite reading before proceeding.`;

const DEFAULT_TEXT_AF = `Welkom by Hoofstuk 1: Inleiding tot Kunsmatige Intelligensie. 
In hierdie module sal ons die fundamentele konsepte van masjienleer verken en hoe neurale netwerke inligting verwerk, soortgelyk aan die menslike brein. 
Maak asseblief seker dat u die voorvereiste leeswerk voltooi het voordat u voortgaan.`;

type Language = 'en' | 'af';

const TRANSLATIONS = {
  en: {
    stop: "Stop",
    voiceStudio: "Voice Studio",
    voiceStudioSubtitle: "Choose your narrator",
    generateAudio: "Generate Audio",
    generateAll: "Generate All Blocks",
    generatingBatch: "Generating Batch...",
    selectVoice: "Select Voice",
    speed: "Speed",
    uploadPdf: "Upload PDF",
    extractPage: "Extract Page",
    fixText: "Fix Text",
    translate: "Translate",
    courseContent: "Course Content",
    deleteBlock: "Delete block",
    block: "Block",
    of: "of",
    chars: "characters",
    fixTextTooltip: "Fix garbled characters (decoding repair)",
    multilingual: "MULTILINGUAL",
    steps: {
      1: "Step 1: Upload or Extract. Start by bringing your content into the editor.",
      2: "Step 2: Refine. Use 'Fix Text' or 'Translate' to prepare your script.",
      3: "Step 3: Narrator. Select a male or female voice that fits your content.",
      4: "Step 4: Generate. Click 'Generate Audio' to create the high-quality speech.",
      5: "Step 5: Review. Play back the audio and download it for your website."
    },
    voiceLabels: {
      kore: { label: "Kore", desc: "Soothing & Clear" },
      aoede: { label: "Aoede", desc: "Professional Narrator" },
      zephyr: { label: "Zephyr", desc: "Soft & Gentle" },
      puck: { label: "Puck", desc: "Energetic & Bright" },
      charon: { label: "Charon", desc: "Deep & Authoritative" },
      fenrir: { label: "Fenrir", desc: "Strong & Dynamic" },
      sannie: { label: "Sannie", desc: "Friendly Afrikaans Female" },
      elsabe: { label: "Elsabé", desc: "Clear Afrikaans Narrator" },
      marietjie: { label: "Marietjie", desc: "Calm Afrikaans Female" },
      jan: { label: "Jan", desc: "Energetic Afrikaans Male" },
      piet: { label: "Piet", desc: "Resonant Afrikaans Male" },
      kobus: { label: "Kobus", desc: "Fast Afrikaans Narrator" }
    }
  },
  af: {
    stop: "Stop",
    voiceStudio: "Stem Studio",
    voiceStudioSubtitle: "Kies jou verteller",
    generateAudio: "Genereer Klank",
    generateAll: "Genereer Alle Blokke",
    generatingBatch: "Genereer Tans...",
    selectVoice: "Kies Stem",
    speed: "Spoed",
    uploadPdf: "Laai PDF",
    extractPage: "Onttrek Bladsy",
    fixText: "Herstel Teks",
    translate: "Vertaal",
    courseContent: "Kursus Inhoud",
    deleteBlock: "Verwyder blok",
    block: "Blok",
    of: "van",
    chars: "karakters",
    fixTextTooltip: "Herstel onleesbare karakters",
    multilingual: "MEERTALIG",
    steps: {
      1: "Stap 1: Laai op. Begin deur jou inhoud in die redigeerder te kry.",
      2: "Stap 2: Verfyn. Gebruik 'Herstel Teks' of 'Vertaal' vir jou skrip.",
      3: "Stap 3: Verteller. Kies 'n manlike of vroulike stem vir jou inhoud.",
      4: "Stap 4: Genereer. Klik 'Genereer Klank' vir hoë-kwaliteit spraak.",
      5: "Stap 5: Hersien. Luister na die klank en laai dit af vir jou webwerf."
    },
    voiceLabels: {
      kore: { label: "Kore", desc: "Sagte en duidelike stem" },
      aoede: { label: "Aoede", desc: "Professionele verteller" },
      zephyr: { label: "Zephyr", desc: "Kalm en rustig" },
      puck: { label: "Puck", desc: "Energiek en helder" },
      charon: { label: "Charon", desc: "Diep en gesaghebbend" },
      fenrir: { label: "Fenrir", desc: "Kragtig en vinnig" },
      sannie: { label: "Sannie", desc: "Vriendelike Afrikaanse Stem" },
      elsabe: { label: "Elsabé", desc: "Helder Afrikaanse Verteller" },
      marietjie: { label: "Marietjie", desc: "Rustige Afrikaanse Stem" },
      jan: { label: "Jan", desc: "Energieke Afrikaanse Stem" },
      piet: { label: "Piet", desc: "Diep Afrikaanse Stem" },
      kobus: { label: "Kobus", desc: "Dinamiese Afrikaanse Verteller" }
    }
  }
};

const formatTime = (seconds: number) => {
  if (!isFinite(seconds) || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const App: React.FC = () => {
  const [language, setLanguage] = useState<Language>('en');
  const [pages, setPages] = useState<CoursePage[]>([{ id: 1, text: DEFAULT_TEXT_EN }]);
  const [pageIndex, setPageIndex] = useState(0);
  const [text, setText] = useState<string>(DEFAULT_TEXT_EN);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>('kore');
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [audioState, setAudioState] = useState<AudioState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    isLoading: false,
    error: null,
    hasAudio: false,
  });
  
  const [isTranslating, setIsTranslating] = useState(false);
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [previewStatus, setPreviewStatus] = useState<{id: string, status: 'loading' | 'playing'} | null>(null);
  const [currentStep, setCurrentStep] = useState<number | null>(1);

  const abortControllerRef = useRef<AbortController | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentBlobUrlRef = useRef<string | null>(null);

  const t = TRANSLATIONS[language];

  const getSelectedVoice = useCallback(() => {
    return VOICE_OPTIONS.find(v => v.id === selectedVoiceId) || VOICE_OPTIONS[0];
  }, [selectedVoiceId]);

  const stopProcesses = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsTranslating(false);
    setIsBatchGenerating(false);
    setAudioState(prev => ({ ...prev, isLoading: false }));
  }, []);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setAudioState(prev => ({ ...prev, isPlaying: false, currentTime: 0 }));
  }, []);

  useEffect(() => {
    const audio = new Audio();
    audio.preservesPitch = true;
    audioRef.current = audio;

    const onTimeUpdate = () => { setAudioState(prev => ({ ...prev, currentTime: audio.currentTime })); };
    const onEnded = () => { setAudioState(prev => ({ ...prev, isPlaying: false, currentTime: 0 })); setPreviewStatus(null); };
    const onLoadedMetadata = () => { setAudioState(prev => ({ ...prev, duration: audio.duration })); };
    const onError = () => { setAudioState(prev => ({ ...prev, isPlaying: false, error: "Error playing audio." })); setPreviewStatus(null); };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('error', onError);

    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('error', onError);
    };
  }, []);

  const ensureAudioContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      analyserRef.current.connect(audioContextRef.current.destination);
    }
    if (audioRef.current && !mediaSourceRef.current && audioContextRef.current && analyserRef.current) {
      try {
        mediaSourceRef.current = audioContextRef.current.createMediaElementSource(audioRef.current);
        mediaSourceRef.current.connect(analyserRef.current);
      } catch (e) { console.warn("Visualizer connection issue", e); }
    }
    if (audioContextRef.current.state === 'suspended') audioContextRef.current.resume();
  };

  const setAudioSource = (pcmData: Uint8Array) => {
    if (currentBlobUrlRef.current) URL.revokeObjectURL(currentBlobUrlRef.current);
    const blob = pcmToWavBlob(pcmData, 24000);
    const url = URL.createObjectURL(blob);
    currentBlobUrlRef.current = url;
    if (audioRef.current) {
      audioRef.current.src = url;
      audioRef.current.playbackRate = playbackSpeed;
      audioRef.current.load();
    }
  };

  const handleTextChange = (newText: string) => {
    setText(newText);
    setPages(prev => {
      const newPages = [...prev];
      newPages[pageIndex] = { ...newPages[pageIndex], text: newText };
      return newPages;
    });
  };

  const handleExtract = () => {
    let nodeList = document.querySelectorAll('.mcg-block');
    if (nodeList.length === 0) {
      try { if (window.parent && window.parent.document) nodeList = window.parent.document.querySelectorAll('.mcg-block'); } 
      catch (e) { console.warn("Parent access denied", e); }
    }
    if (nodeList.length === 0) { alert("No blocks found."); return; }
    const extractedPages: CoursePage[] = Array.from(nodeList).map((el, i) => ({
      id: i + 1,
      text: (el as HTMLElement).innerText.trim() || `(Block ${i + 1})`
    }));
    stopAudio();
    setPages(extractedPages);
    setPageIndex(0);
    setText(extractedPages[0].text);
    setAudioState({ isPlaying: false, currentTime: 0, duration: 0, isLoading: false, error: null, hasAudio: false });
    setCurrentStep(2);
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAudioState(prev => ({ ...prev, isLoading: true }));
    try {
      const pdfjsLib = window.pdfjsLib;
      if (!pdfjsLib) throw new Error("PDF Library missing");
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const pdf = await pdfjsLib.getDocument({ data: uint8Array }).promise;
      const newPages: CoursePage[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ').trim();
        if (pageText.length > 0) newPages.push({ id: i, text: pageText });
      }
      if (newPages.length > 0) {
        setPages(newPages);
        setPageIndex(0);
        setText(newPages[0].text);
        setAudioState(prev => ({ ...prev, isLoading: false, hasAudio: false }));
        setCurrentStep(2);
      }
    } catch (error: any) { alert(`Error: ${error.message}`); }
    finally { setAudioState(prev => ({ ...prev, isLoading: false })); }
  };

  const handleGenerate = async () => {
    if (!text) return;
    stopAudio();
    setAudioState(prev => ({ ...prev, isLoading: true, error: null }));
    abortControllerRef.current = new AbortController();
    try {
      const selectedVoice = getSelectedVoice();
      const base64 = await generateSpeech(text, selectedVoice.voiceName);
      const audioData = decodeBase64(base64);
      setAudioSource(audioData);
      ensureAudioContext();
      setPages(prev => {
        const newPages = [...prev];
        newPages[pageIndex] = { ...newPages[pageIndex], audioData };
        return newPages;
      });
      setAudioState(prev => ({ ...prev, isLoading: false, hasAudio: true }));
      setCurrentStep(5);
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setAudioState(prev => ({ ...prev, isLoading: false, error: err.message }));
    }
  };

  const handleGenerateAll = async () => {
    if (pages.length === 0) return;
    setIsBatchGenerating(true);
    setBatchProgress({ current: 0, total: pages.length });
    abortControllerRef.current = new AbortController();
    let updatedPages = [...pages];
    try {
      const selectedVoice = getSelectedVoice();
      for (let i = 0; i < pages.length; i++) {
          if (abortControllerRef.current?.signal.aborted) break;
          setBatchProgress({ current: i + 1, total: pages.length });
          const page = pages[i];
          if (!page.text || page.audioData) continue;
          try {
              const base64 = await generateSpeech(page.text, selectedVoice.voiceName);
              const audioData = decodeBase64(base64);
              updatedPages[i] = { ...updatedPages[i], audioData };
              setPages([...updatedPages]);
              if (i === pageIndex) {
                  setAudioSource(audioData);
                  setAudioState(prev => ({ ...prev, hasAudio: true, error: null }));
              }
          } catch (e) { console.error(`Failed page ${i + 1}`, e); }
      }
      setCurrentStep(5);
    } finally { setIsBatchGenerating(false); }
  };

  const handlePlayPause = () => {
    if (!audioRef.current) return;
    if (audioState.isPlaying) audioRef.current.pause();
    else { ensureAudioContext(); audioRef.current.play(); }
    setAudioState(prev => ({ ...prev, isPlaying: !prev.isPlaying }));
  };

  const handleDownload = () => {
    if (!currentBlobUrlRef.current) return;
    const a = document.createElement('a');
    a.href = currentBlobUrlRef.current;
    a.download = `voiceover-block-${pageIndex + 1}.wav`;
    a.click();
  };

  const handleTranslate = async () => {
    if (!text) return;
    setIsTranslating(true);
    abortControllerRef.current = new AbortController();
    try {
      const targetLang = language === 'en' ? 'Afrikaans' : 'English';
      const translated = await translateText(text, targetLang);
      setText(translated);
      setLanguage(language === 'en' ? 'af' : 'en');
      setPages(prev => {
        const newPages = [...prev];
        newPages[pageIndex] = { ...newPages[pageIndex], text: translated, audioData: undefined };
        return newPages;
      });
      setAudioState(prev => ({ ...prev, hasAudio: false }));
    } catch (e: any) { if (e.name !== 'AbortError') alert("Translation failed."); }
    finally { setIsTranslating(false); }
  };

  const handleRepairText = () => {
    const repaired = text.split('').map(char => {
      const code = char.charCodeAt(0);
      if (code >= 48 && code <= 57) return String.fromCharCode(code + 29);
      if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) return String.fromCharCode(code - 3);
      if (code === 92) return String.fromCharCode(89);
      return char;
    }).join('');
    setText(repaired);
    setPages(prev => {
        const newPages = [...prev];
        newPages[pageIndex] = { ...newPages[pageIndex], text: repaired, audioData: undefined };
        return newPages;
    });
  };

  const handleLanguageToggle = (lang: Language) => {
    setLanguage(lang);
  };

  const handlePageChange = (direction: 'next' | 'prev') => {
    const newIndex = direction === 'next' ? pageIndex + 1 : pageIndex - 1;
    if (newIndex >= 0 && newIndex < pages.length) {
      stopAudio();
      setPageIndex(newIndex);
      const targetPage = pages[newIndex];
      setText(targetPage.text);
      
      if (targetPage.audioData) {
        setAudioSource(targetPage.audioData);
        setAudioState(prev => ({ ...prev, hasAudio: true, error: null }));
      } else {
        setAudioState(prev => ({ ...prev, hasAudio: false, error: null }));
        if (audioRef.current) audioRef.current.src = '';
      }
    }
  };

  const handleDeleteBlock = () => {
    if (pages.length <= 1) {
      const resetText = language === 'en' ? DEFAULT_TEXT_EN : DEFAULT_TEXT_AF;
      setPages([{ id: 1, text: resetText }]);
      setText(resetText);
      setPageIndex(0);
      setAudioState(prev => ({ ...prev, hasAudio: false }));
      return;
    }

    const newPages = pages.filter((_, i) => i !== pageIndex);
    const newIndex = Math.min(pageIndex, newPages.length - 1);
    
    stopAudio();
    setPages(newPages);
    setPageIndex(newIndex);
    setText(newPages[newIndex].text);

    if (newPages[newIndex].audioData) {
      setAudioSource(newPages[newIndex].audioData!);
      setAudioState(prev => ({ ...prev, hasAudio: true }));
    } else {
      setAudioState(prev => ({ ...prev, hasAudio: false }));
      if (audioRef.current) audioRef.current.src = '';
    }
  };

  const handleVoicePreview = async (voice: VoiceOption) => {
    if (previewStatus || audioState.isPlaying) return;
    try {
        setPreviewStatus({ id: voice.id, status: 'loading' });
        const base64 = await generateSpeech(language === 'en' ? `Hello, I'm ${voice.label}.` : `Hallo, ek is ${voice.label}.`, voice.voiceName);
        const url = URL.createObjectURL(pcmToWavBlob(decodeBase64(base64)));
        const previewAudio = new Audio(url);
        previewAudio.onended = () => { setPreviewStatus(null); URL.revokeObjectURL(url); };
        previewAudio.play();
        setPreviewStatus({ id: voice.id, status: 'playing' });
    } catch (e) { setPreviewStatus(null); }
  };

  const StepPopup = ({ step }: { step: number }) => (
    <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-3 w-64 p-3 bg-white border border-indigo-200 rounded-xl shadow-2xl animate-bounce-slow">
       <div className="flex items-start gap-2">
         <div className="bg-indigo-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] flex-none font-bold mt-0.5">{step}</div>
         <p className="text-[11px] text-slate-600 leading-tight font-medium">{(t.steps as any)[step]}</p>
       </div>
       <button onClick={() => setCurrentStep(null)} className="absolute top-2 right-2 text-slate-400 hover:text-slate-600"><X size={12} /></button>
       <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-white"></div>
    </div>
  );

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-slate-50 font-sans selection:bg-indigo-100">
      <header className="flex-none flex items-center justify-between p-4 max-w-[1600px] mx-auto w-full">
        <div className="flex items-center space-x-3">
          <div className="bg-indigo-600 p-2 rounded-lg shadow-lg shadow-indigo-200"><BookOpen className="text-white" size={22} /></div>
          <h1 className="text-xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-violet-600">CourseVoice AI</h1>
        </div>
        <div className="flex items-center gap-4">
           <button onClick={() => setCurrentStep(1)} className="text-slate-400 hover:text-indigo-600 transition-colors" title="Show Instructions"><HelpCircle size={20} /></button>
           <div className="flex bg-white rounded-lg p-1 shadow-sm border border-slate-200">
            <button onClick={() => handleLanguageToggle('en')} className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${language === 'en' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-400 hover:text-slate-700'}`}>ENG</button>
            <button onClick={() => handleLanguageToggle('af')} className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${language === 'af' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-400 hover:text-slate-700'}`}>AFR</button>
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-hidden px-4 pb-4 max-w-[1600px] mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 flex flex-col min-h-0 relative">
          {currentStep === 1 && <StepPopup step={1} />}
          {currentStep === 2 && <StepPopup step={2} />}
          <div className="flex-none bg-white rounded-t-xl shadow-sm border border-slate-200 border-b-0 p-3 flex flex-wrap items-center justify-between gap-3">
             <div className="flex items-center space-x-2">
                <div className="relative">
                  <input type="file" accept=".pdf" ref={fileInputRef} onChange={handlePdfUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                  <button disabled={audioState.isLoading} className="flex items-center space-x-2 px-3 py-2 bg-slate-50 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-100 transition-colors text-xs font-bold">
                    <FileUp size={14} className="text-indigo-600" /><span>{t.uploadPdf}</span>
                  </button>
                </div>
                <button onClick={handleExtract} disabled={audioState.isLoading} className="flex items-center space-x-2 px-3 py-2 bg-slate-50 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-100 transition-colors text-xs font-bold">
                  <ScanSearch size={14} className="text-indigo-600" /><span>{t.extractPage}</span>
                </button>
             </div>
             <div className="flex items-center space-x-2">
                <button onClick={handleRepairText} className="flex items-center space-x-1.5 text-slate-500 hover:text-emerald-600 text-xs font-bold px-2.5 py-1.5 hover:bg-emerald-50 rounded-lg" title={t.fixTextTooltip}>
                 <Wand2 size={14} /><span>{t.fixText}</span>
               </button>
               <div className="w-px h-4 bg-slate-200"></div>
               <button onClick={handleTranslate} disabled={isTranslating || audioState.isLoading} className="flex items-center space-x-1.5 text-slate-500 hover:text-indigo-600 text-xs font-bold px-2.5 py-1.5 hover:bg-indigo-50 rounded-lg">
                 {isTranslating ? <Loader className="animate-spin" size={14} /> : <ArrowRightLeft size={14} />}<span>{t.translate}</span>
               </button>
             </div>
          </div>
          <div className="flex-1 flex flex-col min-h-0 bg-white shadow-sm border border-slate-200 overflow-hidden">
            <div className="flex-none px-4 py-2 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
               <div className="flex items-center space-x-2 text-[11px] text-slate-500 font-bold uppercase tracking-wider"><BookOpen size={13} /><span>{t.courseContent}</span></div>
               <div className="flex items-center gap-2">
                   <button onClick={handleDeleteBlock} className="p-1.5 text-slate-300 hover:text-rose-500 rounded-lg transition-colors"><Trash2 size={15} /></button>
                   {pages.length > 1 && (
                     <div className="flex items-center space-x-1 bg-white rounded-lg border border-slate-200 p-0.5 shadow-sm">
                        <button onClick={() => handlePageChange('prev')} disabled={pageIndex === 0} className="p-1 hover:bg-slate-100 rounded disabled:opacity-20"><ChevronLeft size={14} /></button>
                        <span className="text-[10px] font-bold text-slate-700 w-20 text-center uppercase">{t.block} {pageIndex + 1}/{pages.length}</span>
                        <button onClick={() => handlePageChange('next')} disabled={pageIndex === pages.length - 1} className="p-1 hover:bg-slate-100 rounded disabled:opacity-20"><ChevronRight size={14} /></button>
                     </div>
                   )}
               </div>
            </div>
            <div className="flex-1 overflow-hidden relative">
              <textarea value={text} onChange={(e) => handleTextChange(e.target.value)} className="absolute inset-0 w-full h-full p-6 resize-none focus:outline-none text-slate-700 leading-relaxed text-base bg-transparent overflow-y-auto custom-scrollbar" placeholder="Enter content..." spellCheck={false} />
            </div>
            <div className="flex-none px-4 py-2 bg-slate-50 border-t border-slate-100 text-right"><span className="text-[10px] text-slate-400 font-bold">{text.length} {t.chars}</span></div>
          </div>
          <div className="flex-none h-4 bg-slate-50 border-x border-slate-200 border-b rounded-b-xl shadow-inner"></div>
        </div>

        <div className="lg:col-span-5 flex flex-col min-h-0">
           <div className="flex-1 flex flex-col min-h-0 bg-white rounded-2xl shadow-sm border border-slate-200 p-5 overflow-hidden">
              <div className="flex-none flex items-center space-x-3 mb-4">
                 <div className="bg-rose-100 p-2 rounded-xl text-rose-500"><Mic size={22} /></div>
                 <div><h2 className="text-base font-extrabold text-slate-800 leading-none">{t.voiceStudio}</h2><p className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-wider">{t.voiceStudioSubtitle}</p></div>
              </div>
              
              <div className="flex-none mb-5 space-y-3 relative">
                 {currentStep === 4 && <StepPopup step={4} />}
                 <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                    <div className="flex items-center justify-between mb-2">
                       <div className="flex items-center space-x-2 text-[11px] text-slate-500 font-bold uppercase"><Gauge size={14} /><span>{t.speed}</span></div>
                       <span className="text-xs font-bold text-indigo-600 bg-white px-2 py-0.5 rounded-lg border border-indigo-100">{playbackSpeed}x</span>
                    </div>
                    <input type="range" min="0.5" max="2" step="0.25" value={playbackSpeed} onChange={(e) => { const s = parseFloat(e.target.value); setPlaybackSpeed(s); if(audioRef.current) audioRef.current.playbackRate = s; }} className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                 </div>
                 
                 <div className="grid grid-cols-2 gap-3">
                   {audioState.isLoading || isBatchGenerating || isTranslating ? (
                      <button onClick={stopProcesses} className="col-span-2 py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-bold shadow-lg shadow-rose-100 transition-all flex items-center justify-center space-x-2 text-xs">
                         <Square size={14} fill="currentColor" /><span>{t.stop}</span>
                      </button>
                   ) : (
                      <>
                        <button onClick={handleGenerate} disabled={!text} className="py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white rounded-xl font-bold shadow-lg shadow-indigo-100 transition-all flex items-center justify-center space-x-2 text-xs">
                           <Sparkles size={14} /><span>{t.generateAudio}</span>
                        </button>
                        <button onClick={handleGenerateAll} disabled={!pages.length} className="py-3 px-3 rounded-xl border-2 border-indigo-50 text-indigo-700 font-bold hover:bg-indigo-50 transition-colors flex items-center justify-center gap-2 text-xs">
                           <Layers size={14} /><span>{t.generateAll}</span>
                        </button>
                      </>
                   )}
                 </div>
                 
                 {isBatchGenerating && (
                    <div className="bg-indigo-50 rounded-xl p-3 border border-indigo-100 animate-pulse">
                        <div className="flex items-center justify-between mb-2"><span className="text-[10px] font-bold text-indigo-700 flex items-center gap-1.5"><Loader className="animate-spin" size={12} />{t.generatingBatch}</span><span className="text-[10px] text-indigo-600 font-mono font-bold">{batchProgress.current} / {batchProgress.total}</span></div>
                        <div className="w-full bg-indigo-100 rounded-full h-1.5 overflow-hidden"><div className="bg-indigo-600 h-full rounded-full transition-all duration-500" style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}></div></div>
                    </div>
                 )}
              </div>

              <div className="flex-none mb-5 bg-slate-900 rounded-2xl p-4 relative overflow-hidden shadow-2xl min-h-[140px] flex flex-col justify-between group">
                 {currentStep === 5 && <StepPopup step={5} />}
                 <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start z-10">
                    <div className="bg-white/10 backdrop-blur-md px-2 py-1 rounded-lg text-[10px] text-white/90 font-bold tracking-widest uppercase">{getSelectedVoice().id}</div>
                    <div className="bg-white/10 backdrop-blur-md px-2 py-1 rounded-lg text-[10px] text-white/90 font-mono font-bold flex items-center gap-1.5">
                       <span className={audioState.isPlaying ? "animate-pulse text-emerald-400" : "text-slate-500"}>●</span>{formatTime(audioState.currentTime)} / {formatTime(audioState.duration)}
                    </div>
                 </div>
                 <div className="mt-8 flex-1 flex items-center justify-center opacity-80 group-hover:opacity-100 transition-opacity min-h-[60px]"><Visualizer analyser={analyserRef.current} isPlaying={audioState.isPlaying} /></div>
                 <Controls isPlaying={audioState.isPlaying} onPlayPause={handlePlayPause} onReset={stopAudio} onDownload={handleDownload} disabled={!audioState.hasAudio || audioState.isLoading} />
              </div>
              
              <div className="flex-1 flex flex-col min-h-0 relative">
                 {currentStep === 3 && <StepPopup step={3} />}
                 <div className="flex-none flex justify-between items-center mb-3">
                    <span className="text-[10px] font-bold text-slate-400 tracking-widest uppercase">{t.selectVoice}</span>
                    <span className="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-extrabold tracking-tighter">{t.multilingual}</span>
                 </div>
                 
                 <div className="flex-1 overflow-y-auto pr-1 space-y-2.5 custom-scrollbar pb-8">
                   {VOICE_OPTIONS.map((voice) => {
                     const meta = (t.voiceLabels as any)[voice.id];
                     const isSel = selectedVoiceId === voice.id;
                     return (
                       <div key={voice.id} onClick={() => { setSelectedVoiceId(voice.id); if(currentStep === 3) setCurrentStep(4); }} className={`group p-2.5 rounded-xl border-2 cursor-pointer transition-all relative ${isSel ? 'border-indigo-600 bg-indigo-50 shadow-sm' : 'border-slate-50 hover:border-indigo-100 hover:bg-white hover:shadow-md'}`}>
                          <div className="flex items-center justify-between">
                             <div className="flex items-center space-x-2.5">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-extrabold transition-colors ${isSel ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 group-hover:bg-indigo-100 group-hover:text-indigo-600'}`}>{meta.label[0]}</div>
                                <div>
                                   <div className="text-[12px] font-extrabold text-slate-800 leading-none mb-1 flex items-center gap-1.5">
                                     {meta.label} 
                                     {isSel && <CheckCircle2 size={11} className="text-indigo-600" />}
                                     {voice.isAfrVariant && <span className="text-[8px] bg-emerald-100 text-emerald-700 px-1 py-0.5 rounded uppercase font-black">AFR</span>}
                                   </div>
                                   <div className="text-[9px] text-slate-400 font-bold leading-none">{meta.desc}</div>
                                </div>
                             </div>
                             <div className="flex items-center gap-1.5">
                                <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-black tracking-widest ${voice.gender === 'Female' ? 'bg-pink-50 text-pink-500' : 'bg-blue-50 text-blue-500'}`}>{voice.gender.toUpperCase()}</span>
                                <button onClick={(e) => { e.stopPropagation(); handleVoicePreview(voice); }} className="p-1.5 rounded-full text-slate-300 hover:text-indigo-600 hover:bg-indigo-100 transition-colors">
                                   {previewStatus?.id === voice.id && previewStatus?.status === 'loading' ? <Loader className="animate-spin" size={12} /> : <Volume2 size={14} />}
                                </button>
                             </div>
                          </div>
                       </div>
                     );
                   })}
                 </div>
                 {/* Visual hint for scrolling */}
                 <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white to-transparent pointer-events-none rounded-b-2xl"></div>
              </div>
           </div>
        </div>
      </main>
    </div>
  );
};

export default App;
