
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, BookOpen, Sparkles, AlertCircle, ArrowRightLeft, ChevronLeft, ChevronRight, ScanSearch, FileUp, Gauge, Volume2, Loader, Square, Layers, Wand2, Trash2 } from 'lucide-react';
import { VoiceName, VOICE_OPTIONS, AudioState, CoursePage, VoiceOption } from './types';
import { generateSpeech, translateText } from './services/geminiService';
import { decodeBase64, convertPcmToMp3, pcmToWavBlob } from './utils/audioUtils';
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
    voiceStudio: "Voice Studio",
    voiceStudioSubtitle: "Choose your narrator",
    generateAudio: "Generate Audio",
    generateAll: "Generate Audio for All Blocks",
    generatingBatch: "Generating Batch Audio...",
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
    multilingual: "MULTILINGUAL"
  },
  af: {
    voiceStudio: "Stem Studio",
    voiceStudioSubtitle: "Kies jou verteller",
    generateAudio: "Genereer Klank",
    generateAll: "Genereer Klank vir Alle Blokke",
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
    multilingual: "MEERTALIG"
  }
};

const formatTime = (seconds: number) => {
  if (!isFinite(seconds) || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const App: React.FC = () => {
  // State
  const [language, setLanguage] = useState<Language>('en');
  
  // Page Management
  const [pages, setPages] = useState<CoursePage[]>([
    { id: 1, text: DEFAULT_TEXT_EN }
  ]);
  const [pageIndex, setPageIndex] = useState(0);
  
  // Current Editor Text (synced with pages[pageIndex])
  const [text, setText] = useState<string>(DEFAULT_TEXT_EN);
  
  const [selectedVoice, setSelectedVoice] = useState<VoiceName>(VoiceName.Kore);
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
  const [isDragging, setIsDragging] = useState(false); 

  // Batch Generation State
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });

  // Preview State
  const [previewStatus, setPreviewStatus] = useState<{id: VoiceName, status: 'loading' | 'playing'} | null>(null);

  // Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentBlobUrlRef = useRef<string | null>(null);

  // Get current translation object
  const t = TRANSLATIONS[language];

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setAudioState(prev => ({ ...prev, isPlaying: false, currentTime: 0 }));
  }, []);

  // Initialize Audio Logic
  useEffect(() => {
    // Create Audio element once
    const audio = new Audio();
    audio.preservesPitch = true; // Key feature: Speed changes won't affect tone
    audioRef.current = audio;

    // Listeners to sync React state
    const onTimeUpdate = () => {
      if (!isDragging) {
        setAudioState(prev => ({ ...prev, currentTime: audio.currentTime }));
      }
    };
    const onEnded = () => {
      setAudioState(prev => ({ ...prev, isPlaying: false, currentTime: 0 }));
      setPreviewStatus(null);
    };
    const onLoadedMetadata = () => {
      setAudioState(prev => ({ ...prev, duration: audio.duration }));
    };
    const onError = () => {
      setAudioState(prev => ({ ...prev, isPlaying: false, error: "Error playing audio." }));
      setPreviewStatus(null);
    };

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
  }, [isDragging]);

  // Connect Audio Element to Web Audio API for Visualization
  const ensureAudioContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      analyserRef.current.connect(audioContextRef.current.destination);
    }

    // Connect audio element if not already connected
    // Note: Can only connect MediaElement once.
    if (audioRef.current && !mediaSourceRef.current && audioContextRef.current && analyserRef.current) {
      try {
        mediaSourceRef.current = audioContextRef.current.createMediaElementSource(audioRef.current);
        mediaSourceRef.current.connect(analyserRef.current);
      } catch (e) {
        console.warn("Could not connect audio to visualizer (likely already connected or cors issue)", e);
      }
    }
    
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
  };

  const setAudioSource = (pcmData: Uint8Array) => {
    if (currentBlobUrlRef.current) {
      URL.revokeObjectURL(currentBlobUrlRef.current);
    }
    const blob = pcmToWavBlob(pcmData, 24000); // Wrap PCM in WAV
    const url = URL.createObjectURL(blob);
    currentBlobUrlRef.current = url;
    
    if (audioRef.current) {
      audioRef.current.src = url;
      audioRef.current.playbackRate = playbackSpeed;
      audioRef.current.load();
    }
  };

  // Sync text changes back to pages array
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
      try {
        if (window.parent && window.parent.document) {
          nodeList = window.parent.document.querySelectorAll('.mcg-block');
        }
      } catch (e) {
        console.warn("Could not access parent document.", e);
      }
    }
    
    if (nodeList.length === 0) {
      alert("No elements found with class '.mcg-block'.");
      return;
    }

    const extractedPages: CoursePage[] = Array.from(nodeList).map((el, i) => ({
      id: i + 1,
      text: (el as HTMLElement).innerText.trim() || `(Empty Block ${i + 1})`
    }));

    stopAudio();
    setPages(extractedPages);
    setPageIndex(0);
    setText(extractedPages[0].text);
    setAudioState({
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      isLoading: false,
      error: null,
      hasAudio: false
    });
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      alert("Please select a valid PDF file.");
      return;
    }
    
    setAudioState(prev => ({ ...prev, isLoading: true }));

    try {
      const pdfjsLib = window.pdfjsLib;
      if (!pdfjsLib) {
         throw new Error("PDF Library not loaded. Please refresh the page.");
      }

      // Explicitly ensure worker is configured to avoid race conditions
      if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
      }

      // Read file
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      // Use complex loading for CMaps (fixes encoding issues) and standard fonts
      const loadingTask = pdfjsLib.getDocument({
        data: uint8Array,
        cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
        cMapPacked: true,
        standardFontDataUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/standard_fonts/',
        disableFontFace: true, // Force standard fonts to avoid embedded font encoding issues
      });
      const pdf = await loadingTask.promise;

      const newPages: CoursePage[] = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        
        // Filter out empty strings and layout items, clean up formatting
        const pageText = textContent.items
          .filter((item: any) => item.str && item.str.trim().length > 0)
          .map((item: any) => item.str)
          .join(' ')
          .replace(/\|/g, '') // Remove pipe characters common in PDF layouts
          .replace(/\s+/g, ' ') // Collapse multiple spaces
          .trim();

        // Only add page if it has meaningful content
        if (pageText.length > 0) {
           newPages.push({
             id: i,
             text: pageText
           });
        }
      }

      if (newPages.length > 0) {
        stopAudio();
        setPages(newPages);
        setPageIndex(0);
        setText(newPages[0].text);
        setAudioState({
          isPlaying: false,
          currentTime: 0,
          duration: 0,
          isLoading: false,
          error: null,
          hasAudio: false
        });
      } else {
        alert("No text could be extracted from this PDF. It might be scanned images.");
      }

    } catch (error: any) {
      console.error("PDF Upload Error:", error);
      alert(`Failed to process PDF: ${error.message || error}`);
    } finally {
      setAudioState(prev => ({ ...prev, isLoading: false }));
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleGenerate = async () => {
    if (!text) return;
    stopAudio();
    setAudioState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const base64 = await generateSpeech(text, selectedVoice);
      const audioData = decodeBase64(base64);
      
      // Update audio source
      setAudioSource(audioData);
      ensureAudioContext();

      // Update page cache
      setPages(prev => {
        const newPages = [...prev];
        newPages[pageIndex] = { ...newPages[pageIndex], audioData };
        return newPages;
      });

      setAudioState(prev => ({ 
        ...prev, 
        isLoading: false, 
        hasAudio: true 
      }));
    } catch (err: any) {
      setAudioState(prev => ({ ...prev, isLoading: false, error: err.message }));
    }
  };

  const handleGenerateAll = async () => {
    if (pages.length === 0) return;
    
    setIsBatchGenerating(true);
    setBatchProgress({ current: 0, total: pages.length });
    
    // Create a local copy to update iteratively
    let updatedPages = [...pages];

    try {
      for (let i = 0; i < pages.length; i++) {
          setBatchProgress({ current: i + 1, total: pages.length });

          const page = pages[i];
          // Skip empty text
          if (!page.text || !page.text.trim()) continue;
          
          // Skip if already has audio
          if (page.audioData) continue;

          try {
              const base64 = await generateSpeech(page.text, selectedVoice);
              const audioData = decodeBase64(base64);

              // Update local copy
              updatedPages[i] = { ...updatedPages[i], audioData };
              
              // Update global state so UI reflects progress/data availability
              setPages([...updatedPages]);

              // If this is the active page, update the player immediately
              if (i === pageIndex) {
                  stopAudio(); // Stop current playback to prevent glitching
                  setAudioSource(audioData);
                  setAudioState(prev => ({ ...prev, hasAudio: true, error: null }));
              }
          } catch (e) {
              console.error(`Failed to generate audio for page ${i + 1}`, e);
              // Continue to next page on error
          }
      }
    } finally {
      setIsBatchGenerating(false);
    }
  };

  const handlePlayPause = () => {
    if (!audioRef.current) return;

    if (audioState.isPlaying) {
      audioRef.current.pause();
    } else {
      ensureAudioContext();
      audioRef.current.play().catch(e => console.error("Play failed", e));
    }
    setAudioState(prev => ({ ...prev, isPlaying: !prev.isPlaying }));
  };

  const handleDownload = () => {
    if (!currentBlobUrlRef.current) return;
    
    const a = document.createElement('a');
    a.href = currentBlobUrlRef.current;
    a.download = `course-audio-page-${pageIndex + 1}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handlePageChange = (direction: 'prev' | 'next') => {
    const newIndex = direction === 'prev' ? pageIndex - 1 : pageIndex + 1;
    if (newIndex < 0 || newIndex >= pages.length) return;

    stopAudio();
    setPageIndex(newIndex);
    setText(pages[newIndex].text);
    
    const cachedAudio = pages[newIndex].audioData;
    if (cachedAudio) {
      setAudioSource(cachedAudio);
      setAudioState(prev => ({ ...prev, hasAudio: true, error: null }));
    } else {
      setAudioState(prev => ({ ...prev, hasAudio: false, error: null }));
    }
  };

  const handleDeleteBlock = () => {
    if (pages.length === 0) return;

    const newPages = pages.filter((_, i) => i !== pageIndex);
    
    // If we deleted the last remaining page, create a blank one
    if (newPages.length === 0) {
        setPages([{ id: 1, text: '' }]);
        setPageIndex(0);
        setText('');
        stopAudio();
        setAudioState(prev => ({ ...prev, hasAudio: false, error: null }));
        return;
    }

    // Adjust page index
    let newIndex = pageIndex;
    if (newIndex >= newPages.length) {
        newIndex = newPages.length - 1;
    }

    stopAudio();
    setPages(newPages);
    setPageIndex(newIndex);
    setText(newPages[newIndex].text);
    
    const cachedAudio = newPages[newIndex].audioData;
    if (cachedAudio) {
      setAudioSource(cachedAudio);
      setAudioState(prev => ({ ...prev, hasAudio: true, error: null }));
    } else {
      setAudioState(prev => ({ ...prev, hasAudio: false, error: null }));
    }
  };

  const handleLanguageToggle = (lang: Language) => {
    if (lang === language) return;
    setLanguage(lang);
    // Only switch default text if we are still on the first page and haven't edited it (simplified logic)
    if (pages.length === 1 && (text === DEFAULT_TEXT_EN || text === DEFAULT_TEXT_AF)) {
       const newText = lang === 'en' ? DEFAULT_TEXT_EN : DEFAULT_TEXT_AF;
       setText(newText);
       setPages([{ id: 1, text: newText }]);
       stopAudio();
       setAudioState(prev => ({ ...prev, hasAudio: false }));
    }
  };

  const handleTranslate = async () => {
    if (!text) return;
    setIsTranslating(true);
    try {
      const targetLang = language === 'en' ? 'Afrikaans' : 'English';
      const translated = await translateText(text, targetLang);
      setText(translated);
      // Update language toggle state based on heuristic
      setLanguage(language === 'en' ? 'af' : 'en');
      // Update pages state
      setPages(prev => {
        const newPages = [...prev];
        newPages[pageIndex] = { ...newPages[pageIndex], text: translated, audioData: undefined }; // invalidates audio
        return newPages;
      });
      stopAudio();
      setAudioState(prev => ({ ...prev, hasAudio: false }));
    } catch (e) {
      alert("Translation failed. Please try again.");
    } finally {
      setIsTranslating(false);
    }
  };

  const handleRepairText = () => {
    // Advanced heuristic shift repair for PDF encoding artifacts
    // Handles split encoding ranges (often found in Identity-H CMap issues)
    const repaired = text.split('').map(char => {
      const code = char.charCodeAt(0);
      
      // Range 1: Symbols that map to Uppercase letters (approx 33-64) -> Add 29
      // E.g. % (37) -> B (66), = (61) -> Z (90), 3 (51) -> P (80)
      if (code >= 33 && code <= 64) {
         return String.fromCharCode(code + 29);
      }
      
      // Range 2: Uppercase/Lowercase letters that map backwards (approx 65-126) -> Subtract 3
      // E.g. D (68) -> A (65), R (82) -> O (79), K (75) -> H (72)
      if (code >= 65 && code <= 126) {
         return String.fromCharCode(code - 3);
      }
      
      return char;
    }).join('');
    
    setText(repaired);
    setPages(prev => {
        const newPages = [...prev];
        newPages[pageIndex] = { ...newPages[pageIndex], text: repaired, audioData: undefined }; // Invalidate audio
        return newPages;
    });
  };

  const handleVoicePreview = async (voice: VoiceOption) => {
    if (previewStatus?.status === 'loading' || audioState.isPlaying) return;
    
    try {
        setPreviewStatus({ id: voice.id, status: 'loading' });
        
        // Generate a short preview
        const base64 = await generateSpeech(`Hello, I am ${voice.label}.`, voice.id);
        const audioData = decodeBase64(base64);
        const blob = pcmToWavBlob(audioData);
        const url = URL.createObjectURL(blob);
        
        const previewAudio = new Audio(url);
        previewAudio.onended = () => {
            setPreviewStatus(null);
            URL.revokeObjectURL(url);
        };
        previewAudio.play();
        setPreviewStatus({ id: voice.id, status: 'playing' });

    } catch (e) {
        console.error("Preview failed", e);
        setPreviewStatus(null);
    }
  };

  return (
    <div className="min-h-screen p-8 text-slate-800 flex flex-col">
      
      {/* Header */}
      <header className="flex items-center justify-between mb-8 max-w-7xl mx-auto w-full">
        <div className="flex items-center space-x-3">
          <div className="bg-indigo-600 p-2 rounded-lg shadow-lg shadow-indigo-200">
            <BookOpen className="text-white" size={28} />
          </div>
          <div>
             <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-violet-600">
              CourseVoice AI
            </h1>
            <p className="text-xs text-slate-500 font-medium tracking-wide">GEMINI 2.5 FLASH TTS</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className="flex bg-white rounded-lg p-1 shadow-sm border border-slate-200">
            <button 
              onClick={() => handleLanguageToggle('en')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${language === 'en' ? 'bg-slate-100 text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              English
            </button>
            <button 
              onClick={() => handleLanguageToggle('af')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${language === 'af' ? 'bg-slate-100 text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Afrikaans
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Panel: Content Editor */}
        <div className="lg:col-span-7 flex flex-col space-y-6">
          
          {/* Toolbar */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-4">
             <div className="flex items-center space-x-2">
                <div className="relative">
                  <input 
                    type="file" 
                    accept=".pdf"
                    ref={fileInputRef}
                    onChange={handlePdfUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <button disabled={audioState.isLoading} className="flex items-center space-x-2 px-4 py-2 bg-white border border-indigo-100 text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors text-sm font-medium">
                    <FileUp size={16} />
                    <span>{t.uploadPdf}</span>
                  </button>
                </div>

                <button 
                  onClick={handleExtract}
                  disabled={audioState.isLoading}
                  className="flex items-center space-x-2 px-4 py-2 bg-white border border-indigo-100 text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors text-sm font-medium"
                >
                  <ScanSearch size={16} />
                  <span>{t.extractPage}</span>
                </button>
             </div>

             <div className="flex items-center space-x-2">
                <button 
                 onClick={handleRepairText}
                 className="flex items-center space-x-2 text-slate-500 hover:text-emerald-600 transition-colors text-sm font-medium px-3 py-1.5 hover:bg-emerald-50 rounded-lg"
                 title={t.fixTextTooltip}
                >
                 <Wand2 size={16} />
                 <span>{t.fixText}</span>
               </button>

               <div className="w-px h-4 bg-slate-200 mx-1"></div>

               <button 
                 onClick={handleTranslate}
                 disabled={isTranslating || audioState.isLoading}
                 className="flex items-center space-x-2 text-slate-500 hover:text-indigo-600 transition-colors text-sm font-medium px-2"
               >
                 {isTranslating ? <Loader className="animate-spin" size={16} /> : <ArrowRightLeft size={16} />}
                 <span>{t.translate}</span>
               </button>
             </div>
          </div>

          {/* Editor Area */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex-1 flex flex-col relative overflow-hidden group">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 to-violet-500 opacity-0 group-focus-within:opacity-100 transition-opacity" />
            
            {/* Page Navigation */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
               <div className="flex items-center space-x-3 text-sm text-slate-500 font-medium">
                  <BookOpen size={16} />
                  <span>{t.courseContent}</span>
               </div>
               
               <div className="flex items-center gap-3">
                   {/* Delete Block Button */}
                   <button
                    onClick={handleDeleteBlock}
                    disabled={audioState.isLoading || isBatchGenerating}
                    className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-50"
                    title={t.deleteBlock}
                   >
                     <Trash2 size={18} />
                   </button>

                   {pages.length > 1 && (
                     <div className="flex items-center space-x-2 bg-white rounded-lg border border-slate-200 p-1 shadow-sm">
                        <button 
                          onClick={() => handlePageChange('prev')}
                          disabled={pageIndex === 0}
                          className="p-1 hover:bg-slate-100 rounded-md disabled:opacity-30"
                        >
                          <ChevronLeft size={16} />
                        </button>
                        <span className="text-xs font-semibold text-slate-700 w-24 text-center">
                          {t.block} {pageIndex + 1} {t.of} {pages.length}
                        </span>
                        <button 
                          onClick={() => handlePageChange('next')}
                          disabled={pageIndex === pages.length - 1}
                          className="p-1 hover:bg-slate-100 rounded-md disabled:opacity-30"
                        >
                          <ChevronRight size={16} />
                        </button>
                     </div>
                   )}
               </div>
            </div>

            <textarea
              value={text}
              onChange={(e) => handleTextChange(e.target.value)}
              className="flex-1 w-full p-6 resize-none focus:outline-none text-slate-700 leading-relaxed text-lg bg-transparent"
              placeholder="Paste your course script here..."
              spellCheck={false}
            />
            
            {/* Character Count */}
            <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 text-right">
               <span className="text-xs text-slate-400 font-medium">{text.length} {t.chars}</span>
            </div>
          </div>
        </div>

        {/* Right Panel: Voice Studio */}
        <div className="lg:col-span-5 h-full">
           <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col h-full">
              
              <div className="flex items-center space-x-3 mb-6">
                 <div className="bg-rose-100 p-2 rounded-full text-rose-500">
                   <Mic size={24} />
                 </div>
                 <div>
                   <h2 className="text-lg font-bold text-slate-800">{t.voiceStudio}</h2>
                   <p className="text-sm text-slate-500">{t.voiceStudioSubtitle}</p>
                 </div>
              </div>

              {/* Visualization / Player Area */}
              <div className="mb-8 bg-slate-900 rounded-xl p-6 relative overflow-hidden shadow-inner min-h-[180px] flex flex-col justify-between">
                 <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start z-10">
                    <div className="bg-white/10 backdrop-blur-sm px-2 py-1 rounded text-xs text-white/80 font-mono">
                       {selectedVoice.toUpperCase()}
                    </div>
                    <div className="bg-white/10 backdrop-blur-sm px-2 py-1 rounded text-xs text-white/80 font-mono flex items-center gap-2">
                       <span className={audioState.isPlaying ? "animate-pulse text-green-400" : "text-slate-400"}>●</span>
                       {formatTime(audioState.currentTime)} / {formatTime(audioState.duration)}
                    </div>
                 </div>

                 <div className="mt-8 flex-1 flex items-center justify-center">
                    <Visualizer analyser={analyserRef.current} isPlaying={audioState.isPlaying} />
                 </div>
                 
                 <Controls 
                   isPlaying={audioState.isPlaying}
                   onPlayPause={handlePlayPause}
                   onReset={() => { stopAudio(); }}
                   onDownload={handleDownload}
                   disabled={!audioState.hasAudio || audioState.isLoading}
                 />
              </div>
              
              {/* Voice Selection */}
              <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                 <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold text-slate-400 tracking-wider uppercase">{t.selectVoice}</span>
                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">{t.multilingual}</span>
                 </div>
                 
                 {VOICE_OPTIONS.map((voice) => (
                   <div 
                     key={voice.id}
                     onClick={() => setSelectedVoice(voice.id)}
                     className={`
                       group p-3 rounded-xl border-2 cursor-pointer transition-all relative
                       ${selectedVoice === voice.id 
                         ? 'border-indigo-600 bg-indigo-50/50 shadow-sm' 
                         : 'border-slate-100 hover:border-indigo-200 hover:bg-slate-50'}
                     `}
                   >
                      <div className="flex items-center justify-between">
                         <div className="flex items-center space-x-3">
                            {/* Voice Avatar Placeholder */}
                            <div className={`
                               w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold
                               ${selectedVoice === voice.id ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'}
                            `}>
                               {voice.label[0]}
                            </div>
                            <div>
                               <div className="font-semibold text-slate-800">{voice.label}</div>
                               <div className="text-xs text-slate-500">{voice.description}</div>
                            </div>
                         </div>
                         
                         <div className="flex items-center gap-2">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full ${voice.gender === 'Female' ? 'bg-pink-100 text-pink-600' : 'bg-blue-100 text-blue-600'}`}>
                              {voice.gender}
                            </span>
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleVoicePreview(voice); }}
                              className="p-1.5 rounded-full text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                            >
                               {previewStatus?.id === voice.id && previewStatus?.status === 'loading' ? (
                                   <Loader className="animate-spin" size={14} />
                               ) : (
                                   <Volume2 size={16} />
                               )}
                            </button>
                         </div>
                      </div>
                   </div>
                 ))}
              </div>

              {/* Settings: Speed */}
              <div className="mt-6 pt-6 border-t border-slate-100">
                 <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-2 text-sm text-slate-600">
                       <Gauge size={16} />
                       <span>{t.speed}</span>
                    </div>
                    <span className="text-sm font-bold text-indigo-600">{playbackSpeed}x</span>
                 </div>
                 <input 
                   type="range" 
                   min="0.5" 
                   max="2" 
                   step="0.25"
                   value={playbackSpeed}
                   onChange={(e) => {
                     const speed = parseFloat(e.target.value);
                     setPlaybackSpeed(speed);
                     if(audioRef.current) audioRef.current.playbackRate = speed;
                   }}
                   className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                 />
              </div>

              {/* Generate Actions */}
              <div className="mt-6 space-y-3">
                {isBatchGenerating ? (
                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 animate-pulse">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-slate-700 flex items-center gap-2">
                                <Loader className="animate-spin text-indigo-600" size={16} />
                                {t.generatingBatch}
                            </span>
                            <span className="text-xs text-slate-500 font-mono">
                                {batchProgress.current} / {batchProgress.total}
                            </span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                             <div 
                                className="bg-indigo-600 h-full rounded-full transition-all duration-500 ease-out"
                                style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                             ></div>
                        </div>
                    </div>
                ) : (
                    <>
                        <button
                          onClick={handleGenerate}
                          disabled={audioState.isLoading || !text}
                          className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 transition-all transform active:scale-[0.98] flex items-center justify-center space-x-2"
                        >
                          {audioState.isLoading ? (
                             <Loader className="animate-spin" />
                          ) : (
                             <Sparkles size={20} />
                          )}
                          <span>{t.generateAudio}</span>
                        </button>

                        <button
                            onClick={handleGenerateAll}
                            disabled={audioState.isLoading || !pages.length}
                            className="w-full py-3 px-4 rounded-xl border-2 border-indigo-100 text-indigo-600 font-semibold hover:bg-indigo-50 hover:border-indigo-200 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                        >
                             <Layers size={18} />
                            {t.generateAll}
                        </button>
                    </>
                )}
                
                {audioState.error && (
                  <div className="flex items-center space-x-2 text-rose-500 text-xs bg-rose-50 p-3 rounded-lg">
                     <AlertCircle size={14} />
                     <span>{audioState.error}</span>
                  </div>
                )}
              </div>
           </div>
        </div>

      </main>
    </div>
  );
};

export default App;
