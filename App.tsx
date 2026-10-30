import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  Mic, BookOpen, Sparkles, AlertCircle, ArrowRightLeft, ChevronLeft, ChevronRight, 
  ScanSearch, FileUp, Gauge, Volume2, Loader, Square, Layers, Wand2, Trash2, 
  X, HelpCircle, CheckCircle2, Plus, Scissors, Combine, ArrowBigRightDash, 
  Radio, FileText, AudioWaveform, MessageSquare
} from 'lucide-react';
import { VoiceName, VOICE_OPTIONS, AudioState, CoursePage, VoiceOption } from './types';
import { generateSpeechForVoice, translateText, enhanceConversationalScript, fetchLibraryVoices, fetchElevenLabsVoices } from './services/geminiService';
import { decodeBase64, pcmToWavBlob, base64ToWavBlob, speakWithWebSpeech, stopWebSpeech } from './utils/audioUtils';
import { Visualizer } from './components/Visualizer';
import { VoicePicker } from './components/VoicePicker';
import { Controls } from './components/Controls';
import { TranscriptionPanel } from './components/TranscriptionPanel';
import { LiveConversationModal } from './components/LiveConversationModal';

// Live chat needs the WebSocket server in server.ts, which Netlify cannot host.
// Vite sets DEV to true only when running locally.
const LIVE_CHAT_ENABLED = (import.meta as any).env?.DEV === true;

const DEFAULT_TEXT_EN = `Welcome to Chapter 1: Introduction to Artificial Intelligence. 
In this module, we will explore the fundamental concepts of machine learning and how neural networks process information similar to the human brain. 
Please ensure you have completed the prerequisite reading before proceeding.`;

const DEFAULT_TEXT_AF = `Welkom by Hoofstuk 1: Inleiding tot Kunsmatige Intelligensie. 
In hierdie module sal ons die fundamentele konsepte van masjienleer verken en hoe neurale netwerke inligting verwerk, soortgelyk aan die menslike brein. 
Maak asseblief seker dat u die voorvereiste leeswerk voltooi het voordat u voortgaan.`;

type Language = 'en' | 'af';
type ActiveTab = 'studio' | 'transcribe';

const TRANSLATIONS = {
  en: {
    stop: "Stop",
    voiceStudio: "Voice Studio",
    voiceStudioSubtitle: "Choose your narrator",
    generateAudio: "Generate Audio",
    generateAll: "Generate All Slides",
    generatingBatch: "Generating Batch...",
    selectVoice: "Select Voice",
    speed: "Speed",
    uploadPdf: "Upload PDF",
    extractPage: "Extract Page",
    fixText: "Fix Text",
    enhanceConversational: "Conversational Polish",
    enhanceTooltip: "Rewrite text into natural conversational spoken style",
    translate: "Translate",
    courseContent: "Slide Content",
    deleteBlock: "Delete slide",
    block: "Slide",
    addBlock: "Add Slide",
    splitBlock: "Split at cursor",
    mergeBlock: "Merge with next",
    moveSelection: "Move selection to next",
    of: "of",
    chars: "characters",
    fixTextTooltip: "Fix garbled characters (decoding repair)",
    multilingual: "MULTILINGUAL",
    tabs: {
      studio: "Slide Voice-Over Studio",
      transcribe: "Audio Transcription & Afrikaans Voices",
      live: "Live Voice Chat (Gemini 3.8)",
    },
    voiceCategories: {
      all: "All Voices",
      afr: "🇿🇦 Conversational Afrikaans",
      educator: "🎓 Educators",
      storyteller: "🎙️ Storytellers",
      executive: "💼 Business",
      intl: "🇬🇧 English",
    },
    steps: {
      1: "Step 1: Upload or Extract. Start by bringing your content into the editor.",
      2: "Step 2: Refine. Split or Merge slides to match your presentation flow.",
      3: "Step 3: Narrator. Select a realistic conversational Afrikaans or English voice.",
      4: "Step 4: Generate. Click 'Generate Audio' to create high-quality speech.",
      5: "Step 5: Review. Play back the audio and download it for your website."
    },
    voiceLabels: {
      sannie: { label: "Sannie", desc: "Warm & Conversational" },
      elsabe: { label: "Elsabé", desc: "Professional Lecturer" },
      marietjie: { label: "Marietjie", desc: "Patient Mentor" },
      lize: { label: "Lize", desc: "Cape Melody & Cadence" },
      annelien: { label: "Annelien", desc: "Vibrant Podcast Host" },
      jan: { label: "Jan", desc: "Energetic Instructor" },
      piet: { label: "Piet", desc: "Deep & Authoritative" },
      kobus: { label: "Kobus", desc: "Fluent Business & Tech" },
      danie: { label: "Danie", desc: "Casual Fireside Storyteller" },
      francois: { label: "Francois", desc: "Wise Counselor" },
      kore: { label: "Kore", desc: "Soothing & Clear" },
      aoede: { label: "Aoede", desc: "Professional Narrator" },
      zephyr: { label: "Zephyr", desc: "Soft & Gentle" },
      puck: { label: "Puck", desc: "Energetic & Bright" },
      charon: { label: "Charon", desc: "Deep & Authoritative" },
      fenrir: { label: "Fenrir", desc: "Strong & Dynamic" }
    }
  },
  af: {
    stop: "Stop",
    voiceStudio: "Stem Studio",
    voiceStudioSubtitle: "Kies jou verteller",
    generateAudio: "Genereer Klank",
    generateAll: "Genereer Alle Skyfies",
    generatingBatch: "Genereer Tans...",
    selectVoice: "Kies Stem",
    speed: "Spoed",
    uploadPdf: "Laai PDF",
    extractPage: "Onttrek Bladsy",
    fixText: "Herstel Teks",
    enhanceConversational: "Gesprek-Poleer",
    enhanceTooltip: "Herskryf teks na 'n natuurlike geselsende praatstyl",
    translate: "Vertaal",
    courseContent: "Skyfie Inhoud",
    deleteBlock: "Verwyder skyfie",
    block: "Skyfie",
    addBlock: "Voeg skyfie by",
    splitBlock: "Verdeel by wyser",
    mergeBlock: "Voeg saam met volgende",
    moveSelection: "Skuif seleksie na volgende",
    of: "van",
    chars: "karakters",
    fixTextTooltip: "Herstel onleesbare karakters",
    multilingual: "MEERTALIG",
    tabs: {
      studio: "Skyfie Stem-Ateljee",
      transcribe: "Klank-Transkripsie & Afrikaanse Stemme",
      live: "Regstreekse Stemgesprek (Gemini 3.8)",
    },
    voiceCategories: {
      all: "Alle Stemme",
      afr: "🇿🇦 Gesprek-Afrikaans",
      educator: "🎓 Dosente",
      storyteller: "🎙️ Storievertellers",
      executive: "💼 Sake & Bestuur",
      intl: "🇬🇧 Engels",
    },
    steps: {
      1: "Stap 1: Laai op. Begin deur jou inhoud in die redigeerder te kry.",
      2: "Stap 2: Verfyn. Verdeel of voeg skyfies saam vir jou aanbieding.",
      3: "Stap 3: Verteller. Kies 'n realistiese geselsende Afrikaanse of Engelse stem.",
      4: "Stap 4: Genereer. Klik 'Genereer Klank' vir hoë-kwaliteit spraak.",
      5: "Stap 5: Hersien. Luister na die klank en laai dit af vir jou webwerf."
    },
    voiceLabels: {
      sannie: { label: "Sannie", desc: "Warm & Gesellig" },
      elsabe: { label: "Elsabé", desc: "Professionele Lektrise" },
      marietjie: { label: "Marietjie", desc: "Geduldige Mentor" },
      lize: { label: "Lize", desc: "Kaapse Ritmiek & Melodie" },
      annelien: { label: "Annelien", desc: "Lewendige Podsendings-Stem" },
      jan: { label: "Jan", desc: "Energieke Instrukteur" },
      piet: { label: "Piet", desc: "Diep & Gesaghebbend" },
      kobus: { label: "Kobus", desc: "Vlot Sake & Tegnologie" },
      danie: { label: "Danie", desc: "Kuier & Braai Gesels" },
      francois: { label: "Francois", desc: "Wyse Storieverteller" },
      kore: { label: "Kore", desc: "Sagte en duidelike stem" },
      aoede: { label: "Aoede", desc: "Professionele verteller" },
      zephyr: { label: "Zephyr", desc: "Kalm en rustig" },
      puck: { label: "Puck", desc: "Energiek en helder" },
      charon: { label: "Charon", desc: "Diep en gesaghebbend" },
      fenrir: { label: "Fenrir", desc: "Kragtig en vinnig" }
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
  const [activeTab, setActiveTab] = useState<ActiveTab>('studio');
  const [isLiveModalOpen, setIsLiveModalOpen] = useState(false);
  const [language, setLanguage] = useState<Language>(() => {
    try {
      return localStorage.getItem('app-language') === 'en' ? 'en' : 'af';
    } catch {
      return 'af';
    }
  });
  const [showVoicePicker, setShowVoicePicker] = useState(false);
  
  const [pages, setPages] = useState<CoursePage[]>([{ id: 1, text: DEFAULT_TEXT_AF }]);
  const [pageIndex, setPageIndex] = useState(0);
  const [text, setText] = useState<string>(DEFAULT_TEXT_AF);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>('sannie');
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
  const [isEnhancingScript, setIsEnhancingScript] = useState(false);
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [previewStatus, setPreviewStatus] = useState<{id: string, status: 'loading' | 'playing'} | null>(null);
  const [currentStep, setCurrentStep] = useState<number | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentBlobUrlRef = useRef<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const t = TRANSLATIONS[language];

  // Built-in voices plus the Afrikaans and English UK voices loaded from the Gemini Voice Library
  const [libraryVoices, setLibraryVoices] = useState<VoiceOption[]>([]);
  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchLibraryVoices(), fetchElevenLabsVoices()]).then(([gemini, eleven]) => {
      if (!cancelled) setLibraryVoices([...gemini, ...eleven]);
    });
    return () => { cancelled = true; };
  }, []);
  const allVoices = useMemo(() => [...VOICE_OPTIONS, ...libraryVoices], [libraryVoices]);

  const getSelectedVoice = useCallback(() => {
    return allVoices.find(v => v.id === selectedVoiceId) || VOICE_OPTIONS[0];
  }, [selectedVoiceId, allVoices]);

  const stopProcesses = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsTranslating(false);
    setIsEnhancingScript(false);
    setIsBatchGenerating(false);
    setAudioState(prev => ({ ...prev, isLoading: false }));
  }, []);

  const stopAudio = useCallback(() => {
    stopWebSpeech();
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
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new AudioCtx();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      analyserRef.current.connect(audioContextRef.current.destination);
    }
    if (audioRef.current && !mediaSourceRef.current && audioContextRef.current && analyserRef.current) {
      try {
        mediaSourceRef.current = audioContextRef.current.createMediaElementSource(audioRef.current);
        mediaSourceRef.current.connect(analyserRef.current);
      } catch (e) { 
        console.warn("Visualizer connection issue", e); 
      }
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
  };

  const setAudioSourceFromBase64 = (base64Audio: string) => {
    if (currentBlobUrlRef.current) URL.revokeObjectURL(currentBlobUrlRef.current);
    const blob = base64ToWavBlob(base64Audio, 24000);
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
      newPages[pageIndex] = { ...newPages[pageIndex], text: newText, audioData: undefined };
      return newPages;
    });
    setAudioState(prev => ({ ...prev, hasAudio: false }));
  };

  const handleExtract = () => {
    let nodeList = document.querySelectorAll('.mcg-block');
    if (nodeList.length === 0) {
      try { 
        if (window.parent && window.parent.document) {
          nodeList = window.parent.document.querySelectorAll('.mcg-block'); 
        }
      } catch (e) { 
        console.warn("Parent access denied", e); 
      }
    }
    if (nodeList.length === 0) { 
      alert(language === 'af' ? "Geen blokke gevind nie." : "No blocks found."); 
      return; 
    }
    const extractedPages: CoursePage[] = Array.from(nodeList).map((el, i) => ({
      id: i + 1,
      text: (el as HTMLElement).innerText.trim() || `(Slide ${i + 1})`
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
    } catch (error: any) { 
      alert(`Error: ${error.message}`); 
    } finally { 
      setAudioState(prev => ({ ...prev, isLoading: false })); 
    }
  };

  const handleGenerate = async () => {
    if (!text) return;
    stopAudio();
    setAudioState(prev => ({ ...prev, isLoading: true, error: null }));
    abortControllerRef.current = new AbortController();
    try {
      const selectedVoice = getSelectedVoice();
      const base64 = await generateSpeechForVoice(selectedVoice, text, language === 'af');
      setAudioSourceFromBase64(base64);
      ensureAudioContext();
      
      const audioBytes = decodeBase64(base64);
      setPages(prev => {
        const newPages = [...prev];
        newPages[pageIndex] = { ...newPages[pageIndex], audioData: audioBytes };
        return newPages;
      });
      setAudioState(prev => ({ ...prev, isLoading: false, hasAudio: true }));
      setCurrentStep(5);
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      if (err.isQuotaExceeded || err.message === 'QUOTA_EXCEEDED') {
        const selectedVoice = getSelectedVoice();
        speakWithWebSpeech(
          text, 
          language, 
          selectedVoice.gender, 
          playbackSpeed,
          () => setAudioState(prev => ({ ...prev, isPlaying: true, hasAudio: true, isLoading: false, error: null })),
          () => setAudioState(prev => ({ ...prev, isPlaying: false }))
        );
        setAudioState(prev => ({ 
          ...prev, 
          isLoading: false, 
          hasAudio: true,
          error: language === 'af'
            ? "Gemini TTS-kwota is tydelik bereik. Stem word nou outomaties afgespeel via jou stelsel-spraak!"
            : "Gemini TTS quota limit reached. Audio is playing via your device speech engine!"
        }));
        setCurrentStep(5);
        return;
      }
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
          const base64 = await generateSpeechForVoice(selectedVoice, page.text, language === 'af');
          const audioBytes = decodeBase64(base64);
          updatedPages[i] = { ...updatedPages[i], audioData: audioBytes };
          setPages([...updatedPages]);
          if (i === pageIndex) {
            setAudioSourceFromBase64(base64);
            setAudioState(prev => ({ ...prev, hasAudio: true, error: null }));
          }
        } catch (e: any) { 
          if (e.isQuotaExceeded || e.message === 'QUOTA_EXCEEDED') {
            break;
          }
          console.error(`Failed page ${i + 1}`, e); 
        }
      }
      setCurrentStep(5);
    } finally { 
      setIsBatchGenerating(false); 
    }
  };

  const handlePlayPause = () => {
    if (audioState.isPlaying) {
      if (audioRef.current) audioRef.current.pause();
      stopWebSpeech();
      setAudioState(prev => ({ ...prev, isPlaying: false }));
      return;
    }

    if (audioRef.current && currentBlobUrlRef.current && audioRef.current.src) {
      ensureAudioContext();
      audioRef.current.play();
      setAudioState(prev => ({ ...prev, isPlaying: true }));
    } else if (text.trim()) {
      const selectedVoice = getSelectedVoice();
      speakWithWebSpeech(
        text,
        language,
        selectedVoice.gender,
        playbackSpeed,
        () => setAudioState(prev => ({ ...prev, isPlaying: true })),
        () => setAudioState(prev => ({ ...prev, isPlaying: false }))
      );
    }
  };

  const handleDownload = () => {
    if (!currentBlobUrlRef.current) return;
    const a = document.createElement('a');
    a.href = currentBlobUrlRef.current;
    a.download = `voiceover-slide-${pageIndex + 1}.wav`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
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
    } catch (e: any) { 
      if (e.name !== 'AbortError') alert("Translation failed."); 
    } finally { 
      setIsTranslating(false); 
    }
  };

  const handleEnhanceConversational = async () => {
    if (!text) return;
    setIsEnhancingScript(true);
    try {
      const enhanced = await enhanceConversationalScript(text, language);
      setText(enhanced);
      setPages(prev => {
        const newPages = [...prev];
        newPages[pageIndex] = { ...newPages[pageIndex], text: enhanced, audioData: undefined };
        return newPages;
      });
      setAudioState(prev => ({ ...prev, hasAudio: false }));
    } catch (e: any) {
      alert("Script enhancement failed.");
    } finally {
      setIsEnhancingScript(false);
    }
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
    try { localStorage.setItem('app-language', lang); } catch { /* storage unavailable */ }
    if (pages.length === 1 && (pages[0].text === DEFAULT_TEXT_EN || pages[0].text === DEFAULT_TEXT_AF)) {
      const newDef = lang === 'af' ? DEFAULT_TEXT_AF : DEFAULT_TEXT_EN;
      setPages([{ id: 1, text: newDef }]);
      setText(newDef);
    }
  };

  const handlePageChange = (direction: 'next' | 'prev') => {
    const newIndex = direction === 'next' ? pageIndex + 1 : pageIndex - 1;
    if (newIndex >= 0 && newIndex < pages.length) {
      stopAudio();
      setPageIndex(newIndex);
      const targetPage = pages[newIndex];
      setText(targetPage.text);
      
      if (targetPage.audioData) {
        if (currentBlobUrlRef.current) URL.revokeObjectURL(currentBlobUrlRef.current);
        const blob = pcmToWavBlob(targetPage.audioData, 24000);
        const url = URL.createObjectURL(blob);
        currentBlobUrlRef.current = url;
        if (audioRef.current) {
          audioRef.current.src = url;
          audioRef.current.playbackRate = playbackSpeed;
          audioRef.current.load();
        }
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
      const blob = pcmToWavBlob(newPages[newIndex].audioData!, 24000);
      const url = URL.createObjectURL(blob);
      currentBlobUrlRef.current = url;
      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.playbackRate = playbackSpeed;
        audioRef.current.load();
      }
      setAudioState(prev => ({ ...prev, hasAudio: true }));
    } else {
      setAudioState(prev => ({ ...prev, hasAudio: false }));
      if (audioRef.current) audioRef.current.src = '';
    }
  };

  const handleAddBlock = () => {
    const newPage: CoursePage = { id: Date.now(), text: "" };
    const newPages = [...pages];
    newPages.splice(pageIndex + 1, 0, newPage);
    setPages(newPages);
    handlePageChange('next');
  };

  const handleSplitAtCursor = () => {
    if (!textareaRef.current) return;
    const start = textareaRef.current.selectionStart;
    const end = textareaRef.current.selectionEnd;
    
    const beforeText = text.substring(0, start).trim();
    const afterText = text.substring(end).trim();

    const newPages = [...pages];
    newPages[pageIndex] = { ...newPages[pageIndex], text: beforeText, audioData: undefined };
    newPages.splice(pageIndex + 1, 0, { id: Date.now(), text: afterText });
    
    setPages(newPages);
    setText(beforeText);
    setAudioState(prev => ({ ...prev, hasAudio: false }));
  };

  const handleMergeNext = () => {
    if (pageIndex >= pages.length - 1) return;
    
    const nextBlock = pages[pageIndex + 1];
    const combinedText = (text.trim() + " " + nextBlock.text.trim()).trim();
    
    const newPages = pages.filter((_, i) => i !== pageIndex + 1);
    newPages[pageIndex] = { ...newPages[pageIndex], text: combinedText, audioData: undefined };
    
    setPages(newPages);
    setText(combinedText);
    setAudioState(prev => ({ ...prev, hasAudio: false }));
  };

  const handleMoveSelection = () => {
    if (!textareaRef.current) return;
    const start = textareaRef.current.selectionStart;
    const end = textareaRef.current.selectionEnd;
    if (start === end) return;

    const selectedText = text.substring(start, end).trim();
    const remainingText = (text.substring(0, start) + text.substring(end)).replace(/\s+/g, ' ').trim();

    const newPages = [...pages];
    newPages[pageIndex] = { ...newPages[pageIndex], text: remainingText, audioData: undefined };

    if (pageIndex < pages.length - 1) {
      newPages[pageIndex+1] = { 
        ...newPages[pageIndex+1], 
        text: (selectedText + " " + newPages[pageIndex+1].text).trim(), 
        audioData: undefined 
      };
    } else {
      newPages.push({ id: Date.now(), text: selectedText });
    }

    setPages(newPages);
    setText(remainingText);
    setAudioState(prev => ({ ...prev, hasAudio: false }));
  };

  const handleVoicePreview = async (voice: VoiceOption) => {
    if (previewStatus || audioState.isPlaying) return;
    try {
      setPreviewStatus({ id: voice.id, status: 'loading' });
      if (voice.previewUrl) {
        const clip = new Audio(voice.previewUrl);
        clip.onended = () => setPreviewStatus(null);
        clip.onerror = () => setPreviewStatus(null);
        await clip.play();
        setPreviewStatus({ id: voice.id, status: 'playing' });
        return;
      }
      const sampleText = language === 'af' ? voice.previewSampleText.af : voice.previewSampleText.en;
      const base64 = await generateSpeechForVoice(voice, sampleText, language === 'af');
      const blob = base64ToWavBlob(base64);
      const url = URL.createObjectURL(blob);
      const previewAudio = new Audio(url);
      previewAudio.onended = () => { 
        setPreviewStatus(null); 
        URL.revokeObjectURL(url); 
      };
      previewAudio.play();
      setPreviewStatus({ id: voice.id, status: 'playing' });
    } catch (e: any) { 
      if (e.isQuotaExceeded || e.message === 'QUOTA_EXCEEDED') {
        const sampleText = language === 'af' ? voice.previewSampleText.af : voice.previewSampleText.en;
        speakWithWebSpeech(
          sampleText,
          language,
          voice.gender,
          playbackSpeed,
          () => setPreviewStatus({ id: voice.id, status: 'playing' }),
          () => setPreviewStatus(null)
        );
        return;
      }
      setPreviewStatus(null); 
    }
  };

  // Handlers for Transcription Panel insertion
  const handleApplyTranscriptionToCurrentSlide = (transcribed: string) => {
    setText(transcribed);
    setPages(prev => {
      const newPages = [...prev];
      newPages[pageIndex] = { ...newPages[pageIndex], text: transcribed, audioData: undefined };
      return newPages;
    });
    setAudioState(prev => ({ ...prev, hasAudio: false }));
    setActiveTab('studio');
  };

  const handleApplyTranscriptionAsNewSlides = (transcribed: string) => {
    // Split by paragraphs or double newlines
    const chunks = transcribed.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
    if (chunks.length === 0) chunks.push(transcribed);
    
    const newSlideList: CoursePage[] = chunks.map((chunk, idx) => ({
      id: Date.now() + idx,
      text: chunk,
    }));

    setPages(newSlideList);
    setPageIndex(0);
    setText(newSlideList[0].text);
    setAudioState(prev => ({ ...prev, hasAudio: false }));
    setActiveTab('studio');
  };

  const handleInsertLiveTextToSlide = (textToAdd: string) => {
    const updated = (text ? text + "\n\n" : "") + textToAdd;
    handleTextChange(updated);
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
      
      {/* Top Application Bar */}
      <header className="flex-none flex items-center justify-between px-6 py-3.5 bg-white border-b border-slate-200 max-w-[1600px] mx-auto w-full">
        <div className="flex items-center space-x-3">
          <div className="bg-gradient-to-tr from-indigo-600 to-violet-600 p-2.5 rounded-xl shadow-md shadow-indigo-200">
            <BookOpen className="text-white" size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-violet-600">
                CourseVoice AI
              </h1>
              <span className="text-[9px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md border border-indigo-100">
                PRO STUDIO
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-bold tracking-tight">
              {language === 'af' ? "E-Kursus Stemme & Klank-Transkripsie" : "eCourse Voiceover & Audio Transcription"}
            </p>
          </div>
        </div>

        {/* Studio / Transcription Navigation Tabs */}
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-inner">
            <button
              onClick={() => setActiveTab('studio')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'studio'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <FileText size={14} />
              <span>{t.tabs.studio}</span>
            </button>
            <button
              onClick={() => setActiveTab('transcribe')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'transcribe'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Mic size={14} />
              <span>{t.tabs.transcribe}</span>
              <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.2 rounded font-black">
                AFR
              </span>
            </button>
          </div>

          {/* Live Voice Chat Button (needs the WebSocket server, so it only exists in local dev) */}
          {LIVE_CHAT_ENABLED && (
          <button
            onClick={() => setIsLiveModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white rounded-xl text-xs font-extrabold shadow-md shadow-violet-200 transition-all transform active:scale-95"
            title="Converse in real-time with Gemini 3.8 Live API"
          >
            <Radio size={14} className="animate-pulse" />
            <span>{t.tabs.live}</span>
          </button>
          )}
        </div>

        {/* Global Controls & Language Switch */}
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setCurrentStep(1)} 
            className="text-slate-400 hover:text-indigo-600 transition-colors p-1.5 rounded-lg hover:bg-slate-100" 
            title="Show Guided Steps"
          >
            <HelpCircle size={19} />
          </button>
          <div className="flex bg-white rounded-lg p-0.5 shadow-sm border border-slate-200">
            <button 
              onClick={() => handleLanguageToggle('en')} 
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                language === 'en' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-400 hover:text-slate-700'
              }`}
            >
              ENG
            </button>
            <button 
              onClick={() => handleLanguageToggle('af')} 
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                language === 'af' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-400 hover:text-slate-700'
              }`}
            >
              AFR
            </button>
          </div>
        </div>
      </header>

      {/* Main Studio View OR Transcription Panel */}
      <main className="flex-1 min-h-0 overflow-hidden px-5 py-4 max-w-[1600px] mx-auto w-full">
        
        {activeTab === 'transcribe' ? (
          <TranscriptionPanel
            currentLanguage={language}
            onApplyToSlide={handleApplyTranscriptionToCurrentSlide}
            onApplyAsNewSlides={handleApplyTranscriptionAsNewSlides}
            voices={allVoices}
            selectedVoiceId={selectedVoiceId}
            onSelectVoiceId={setSelectedVoiceId}
          />
        ) : (
          <div className="h-full grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-0">
            
            {/* Left: Slide Editor & Navigation */}
            <div className="lg:col-span-7 flex flex-col min-h-0 relative">
              {currentStep === 1 && <StepPopup step={1} />}
              {currentStep === 2 && <StepPopup step={2} />}

              {/* Toolbar */}
              <div className="flex-none bg-white rounded-t-xl shadow-sm border border-slate-200 border-b-0 p-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center space-x-2">
                  <div className="relative">
                    <input 
                      type="file" 
                      accept=".pdf" 
                      ref={fileInputRef} 
                      onChange={handlePdfUpload} 
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                    />
                    <button 
                      disabled={audioState.isLoading} 
                      className="flex items-center space-x-2 px-3 py-2 bg-slate-50 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-100 transition-colors text-xs font-bold"
                    >
                      <FileUp size={14} className="text-indigo-600" />
                      <span>{t.uploadPdf}</span>
                    </button>
                  </div>
                  <button 
                    onClick={handleExtract} 
                    disabled={audioState.isLoading} 
                    className="flex items-center space-x-2 px-3 py-2 bg-slate-50 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-100 transition-colors text-xs font-bold"
                  >
                    <ScanSearch size={14} className="text-indigo-600" />
                    <span>{t.extractPage}</span>
                  </button>
                </div>

                <div className="flex items-center space-x-2">
                  {/* Conversational Script Enhancer */}
                  <button 
                    onClick={handleEnhanceConversational} 
                    disabled={isEnhancingScript || audioState.isLoading} 
                    className="flex items-center space-x-1.5 text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 text-xs font-bold px-2.5 py-1.5 rounded-lg transition-colors" 
                    title={t.enhanceTooltip}
                  >
                    {isEnhancingScript ? <Loader className="animate-spin" size={14} /> : <AudioWaveform size={14} />}
                    <span>{t.enhanceConversational}</span>
                  </button>

                  <button 
                    onClick={handleRepairText} 
                    className="flex items-center space-x-1.5 text-slate-500 hover:text-emerald-600 text-xs font-bold px-2.5 py-1.5 hover:bg-emerald-50 rounded-lg" 
                    title={t.fixTextTooltip}
                  >
                    <Wand2 size={14} />
                    <span>{t.fixText}</span>
                  </button>

                  <div className="w-px h-4 bg-slate-200"></div>

                  <button 
                    onClick={handleTranslate} 
                    disabled={isTranslating || audioState.isLoading} 
                    className="flex items-center space-x-1.5 text-slate-500 hover:text-indigo-600 text-xs font-bold px-2.5 py-1.5 hover:bg-indigo-50 rounded-lg"
                  >
                    {isTranslating ? <Loader className="animate-spin" size={14} /> : <ArrowRightLeft size={14} />}
                    <span>{t.translate}</span>
                  </button>
                </div>
              </div>

              {/* Text Area Card */}
              <div className="flex-1 flex flex-col min-h-0 bg-white shadow-sm border border-slate-200 overflow-hidden">
                <div className="flex-none px-4 py-2 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                  <div className="flex items-center space-x-3 text-[11px] text-slate-500 font-bold uppercase tracking-wider">
                    <div className="flex items-center gap-1.5">
                      <Layers size={13} />
                      <span>{t.courseContent}</span>
                    </div>
                    <div className="w-px h-3 bg-slate-200"></div>
                    <div className="flex items-center gap-2">
                      <button onClick={handleSplitAtCursor} className="flex items-center gap-1 text-slate-400 hover:text-indigo-600 transition-colors" title={t.splitBlock}><Scissors size={12} /><span>Split</span></button>
                      <button onClick={handleMergeNext} disabled={pageIndex === pages.length - 1} className="flex items-center gap-1 text-slate-400 hover:text-indigo-600 transition-colors disabled:opacity-30" title={t.mergeBlock}><Combine size={12} /><span>Merge</span></button>
                      <button onClick={handleMoveSelection} className="flex items-center gap-1 text-slate-400 hover:text-indigo-600 transition-colors" title={t.moveSelection}><ArrowBigRightDash size={12} /><span>Move Selection</span></button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button onClick={handleDeleteBlock} className="p-1.5 text-slate-300 hover:text-rose-500 rounded-lg transition-colors" title={t.deleteBlock}><Trash2 size={15} /></button>
                    <div className="flex items-center space-x-1 bg-white rounded-lg border border-slate-200 p-0.5 shadow-sm">
                      <button onClick={() => handlePageChange('prev')} disabled={pageIndex === 0} className="p-1 hover:bg-slate-100 rounded disabled:opacity-20"><ChevronLeft size={14} /></button>
                      <span className="text-[10px] font-bold text-slate-700 w-20 text-center uppercase">{t.block} {pageIndex + 1}/{pages.length}</span>
                      <button onClick={() => handlePageChange('next')} disabled={pageIndex === pages.length - 1} className="p-1 hover:bg-slate-100 rounded disabled:opacity-20"><ChevronRight size={14} /></button>
                      <button onClick={handleAddBlock} className="p-1 hover:bg-indigo-50 text-indigo-600 rounded" title={t.addBlock}><Plus size={14} /></button>
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-hidden relative">
                  <textarea 
                    ref={textareaRef} 
                    value={text} 
                    onChange={(e) => handleTextChange(e.target.value)} 
                    className="absolute inset-0 w-full h-full p-6 resize-none focus:outline-none text-slate-700 leading-relaxed text-base bg-transparent overflow-y-auto custom-scrollbar" 
                    placeholder="Enter course slide content..." 
                    spellCheck={false} 
                  />
                </div>

                <div className="flex-none px-4 py-2 bg-slate-50 border-t border-slate-100 text-right">
                  <span className="text-[10px] text-slate-400 font-bold">{text.length} {t.chars}</span>
                </div>
              </div>

              <div className="flex-none h-4 bg-slate-50 border-x border-slate-200 border-b rounded-b-xl shadow-inner"></div>
            </div>

            {/* Right: Realistic Conversational Voice Studio & Generation */}
            <div className="lg:col-span-5 flex flex-col min-h-0">
              <div className="flex-1 flex flex-col min-h-0 bg-white rounded-2xl shadow-sm border border-slate-200 p-5 overflow-hidden">
                
                <div className="flex-none flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <div className="bg-rose-100 p-2 rounded-xl text-rose-500">
                      <Mic size={20} />
                    </div>
                    <div>
                      <h2 className="text-base font-extrabold text-slate-800 leading-none">{t.voiceStudio}</h2>
                      <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-wider">{t.voiceStudioSubtitle}</p>
                    </div>
                  </div>
                  <span className="text-[9px] bg-rose-50 text-rose-700 font-black px-2 py-0.5 rounded-full uppercase border border-rose-100">
                    gemini-3.8-flash-tts
                  </span>
                </div>
                
                {/* Generation & Controls */}
                <div className="flex-none mb-4 space-y-3 relative">
                  {currentStep === 4 && <StepPopup step={4} />}
                  
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center space-x-2 text-[11px] text-slate-500 font-bold uppercase">
                        <Gauge size={14} />
                        <span>{t.speed}</span>
                      </div>
                      <span className="text-xs font-bold text-indigo-600 bg-white px-2 py-0.5 rounded-lg border border-indigo-100">
                        {playbackSpeed}x
                      </span>
                    </div>
                    <input 
                      type="range" 
                      min="0.5" 
                      max="2" 
                      step="0.25" 
                      value={playbackSpeed} 
                      onChange={(e) => { 
                        const s = parseFloat(e.target.value); 
                        setPlaybackSpeed(s); 
                        if(audioRef.current) audioRef.current.playbackRate = s; 
                      }} 
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" 
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    {audioState.isLoading || isBatchGenerating || isTranslating ? (
                      <button 
                        onClick={stopProcesses} 
                        className="col-span-2 py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-bold shadow-lg shadow-rose-100 transition-all flex items-center justify-center space-x-2 text-xs"
                      >
                        <Square size={14} fill="currentColor" />
                        <span>{t.stop}</span>
                      </button>
                    ) : (
                      <>
                        <button 
                          onClick={handleGenerate} 
                          disabled={!text} 
                          className="py-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 disabled:bg-slate-200 text-white rounded-xl font-bold shadow-lg shadow-indigo-100 transition-all flex items-center justify-center space-x-2 text-xs"
                        >
                          <Sparkles size={14} />
                          <span>{t.generateAudio}</span>
                        </button>
                        <button 
                          onClick={handleGenerateAll} 
                          disabled={!pages.length} 
                          className="py-3 px-3 rounded-xl border-2 border-indigo-50 text-indigo-700 font-bold hover:bg-indigo-50 transition-colors flex items-center justify-center gap-2 text-xs"
                        >
                          <Layers size={14} />
                          <span>{t.generateAll}</span>
                        </button>
                      </>
                    )}
                  </div>
                  
                  {isBatchGenerating && (
                    <div className="bg-indigo-50 rounded-xl p-3 border border-indigo-100 animate-pulse">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold text-indigo-700 flex items-center gap-1.5">
                          <Loader className="animate-spin" size={12} />
                          {t.generatingBatch}
                        </span>
                        <span className="text-[10px] text-indigo-600 font-mono font-bold">
                          {batchProgress.current} / {batchProgress.total}
                        </span>
                      </div>
                      <div className="w-full bg-indigo-100 rounded-full h-1.5 overflow-hidden">
                        <div 
                          className="bg-indigo-600 h-full rounded-full transition-all duration-500" 
                          style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                        ></div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Audio Player Screen */}
                <div className="flex-none mb-4 bg-slate-900 rounded-2xl p-4 relative overflow-hidden shadow-2xl min-h-[135px] flex flex-col justify-between group">
                  {currentStep === 5 && <StepPopup step={5} />}
                  <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start z-10">
                    <div className="bg-white/10 backdrop-blur-md px-2.5 py-1 rounded-lg text-[10px] text-white/90 font-bold tracking-widest uppercase flex items-center gap-1.5">
                      <span>{getSelectedVoice().label}</span>
                      {getSelectedVoice().isAfrVariant && (
                        <span className="text-[8px] bg-emerald-500 text-white px-1 rounded font-black">AFR</span>
                      )}
                    </div>
                    <div className="bg-white/10 backdrop-blur-md px-2.5 py-1 rounded-lg text-[10px] text-white/90 font-mono font-bold flex items-center gap-1.5">
                      <span className={audioState.isPlaying ? "animate-pulse text-emerald-400" : "text-slate-500"}>●</span>
                      {formatTime(audioState.currentTime)} / {formatTime(audioState.duration)}
                    </div>
                  </div>
                  <div className="mt-7 flex-1 flex items-center justify-center opacity-80 group-hover:opacity-100 transition-opacity min-h-[50px]">
                    <Visualizer analyser={analyserRef.current} isPlaying={audioState.isPlaying} />
                  </div>
                  <Controls 
                    isPlaying={audioState.isPlaying} 
                    onPlayPause={handlePlayPause} 
                    onReset={stopAudio} 
                    onDownload={handleDownload} 
                    disabled={!audioState.hasAudio || audioState.isLoading} 
                  />
                </div>
                
                {/* Voice selection: current voice plus pop-up picker */}
                <div className="flex-none relative">
                  {currentStep === 3 && <StepPopup step={3} />}
                  {(() => {
                    const sel = getSelectedVoice();
                    const meta = (t.voiceLabels as any)[sel.id] || { label: sel.label, desc: sel.description };
                    return (
                      <div className="p-3 rounded-xl border-2 border-indigo-100 bg-white">
                        <div className="flex items-center justify-between mb-2.5">
                          <span className="text-[10px] font-bold text-slate-400 tracking-widest uppercase">{t.selectVoice}</span>
                          <span className="text-[10px] text-slate-400 font-bold">{allVoices.length}</span>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <div className="w-10 h-10 flex-none rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-black">
                            {meta.label[0]}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[13px] font-extrabold text-slate-800 truncate">{meta.label}</div>
                            <div className="text-[10px] text-slate-400 font-bold truncate">{meta.desc}</div>
                          </div>
                          <button
                            onClick={() => handleVoicePreview(sel)}
                            className="flex-none p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-100 transition-colors"
                            title="Listen to realistic sample"
                          >
                            {previewStatus?.id === sel.id && previewStatus?.status === 'loading' ? (
                              <Loader className="animate-spin" size={15} />
                            ) : (
                              <Volume2 size={16} />
                            )}
                          </button>
                        </div>
                        <button
                          onClick={() => { setShowVoicePicker(true); if (currentStep === 3) setCurrentStep(4); }}
                          className="mt-3 w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors"
                        >
                          {language === 'af' ? `Blaai deur stemme (${allVoices.length})` : `Browse voices (${allVoices.length})`}
                        </button>
                      </div>
                    );
                  })()}
                </div>

              </div>
            </div>

          </div>
        )}

      </main>

      <VoicePicker
        isOpen={showVoicePicker}
        onClose={() => setShowVoicePicker(false)}
        voices={allVoices}
        selectedId={selectedVoiceId}
        onSelect={setSelectedVoiceId}
        onPreview={handleVoicePreview}
        previewingId={previewStatus?.status === 'loading' ? previewStatus.id : null}
        language={language}
        localize={(v) => {
          const m = (t.voiceLabels as any)[v.id];
          return m ? { label: m.label, desc: m.desc } : { label: v.label, desc: v.description };
        }}
      />

      {/* Live Voice Conversation Modal (Gemini 3.8 Live API) */}
      {LIVE_CHAT_ENABLED && (
      <LiveConversationModal
        isOpen={isLiveModalOpen}
        onClose={() => setIsLiveModalOpen(false)}
        currentLanguage={language}
        onInsertToSlide={handleInsertLiveTextToSlide}
      />
      )}

    </div>
  );
};

export default App;
