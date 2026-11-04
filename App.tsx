import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  Mic, BookOpen, Sparkles, AlertCircle, ArrowRightLeft, ChevronLeft, ChevronRight, 
  ScanSearch, FileUp, Gauge, Volume2, Loader, Square, Layers, Wand2, Trash2, 
  X, HelpCircle, Library, CheckCircle2, Plus, Scissors, Combine, ArrowBigRightDash, 
  Radio, FileText, AudioWaveform, MessageSquare, Languages, Undo2, Presentation, ScrollText, MoreHorizontal, ArrowLeft, ArrowRight
} from 'lucide-react';
import { VoiceName, VOICE_OPTIONS, AudioState, CoursePage, VoiceOption } from './types';
import { generateSpeechForVoice, generateCheckedSpeech, translateText, enhanceConversationalScript, fetchLibraryVoices, fetchElevenLabsVoices } from './services/geminiService';
import { decodeBase64, pcmToWavBlob, base64ToWavBlob, speakWithWebSpeech, stopWebSpeech } from './utils/audioUtils';
import { loadWorkspace, saveWorkspace, saveAudio, loadAudio } from './services/workspaceService';
import { Visualizer } from './components/Visualizer';
import { VoicePicker } from './components/VoicePicker';
import { Controls } from './components/Controls';
import { TranscriptionPanel } from './components/TranscriptionPanel';
import { LiveConversationModal } from './components/LiveConversationModal';
import { VisualsModal, VisualsEntry } from './components/VisualsModal';
import { LibraryModal } from './components/LibraryModal';
import { BalanceModal } from './components/BalanceModal';
import { AllSlidesModal } from './components/AllSlidesModal';
import { RulesModal } from './components/RulesModal';
import { HelpModal } from './components/HelpModal';
import { saveAudio as saveAudioToLibrary, createCollection, LibraryLink, LibraryEditPayload } from './services/libraryService';
import { fetchRules } from './services/rulesService';
import { slideSize, SLIDE_LIMITS, balanceSlides } from './utils/slideBalance';
import { BRAND } from './brand/brand';
import { isAfrikaansText } from './utils/language';

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
  const [showVisuals, setShowVisuals] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showBalance, setShowBalance] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  // saved versions the open project came from (set when work is opened from the library), so saving again updates them
  const [libraryLink, setLibraryLink] = useState<LibraryLink | null>(null);
  const [audioSave, setAudioSave] = useState<{ busy: boolean; note: string | null; error: string | null }>({ busy: false, note: null, error: null });
  // the slide strip: a slide being dragged, where it would land, and the open slide menu
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [slideMenu, setSlideMenu] = useState<{ index: number; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!slideMenu) return;
    const close = () => setSlideMenu(null);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
  }, [slideMenu]);
  // the user's rules for future lessons: pronunciation rules are used by every voicing
  useEffect(() => { void fetchRules(); }, []);
  const [showAllVisuals, setShowAllVisuals] = useState(false);
  // the last whole-lesson change (translate all, balance), so it can be undone
  const [structUndo, setStructUndo] = useState<{ label: string; pages: CoursePage[]; pageIndex: number; language: Language; visuals: Record<number, VisualsEntry>; link: LibraryLink | null } | null>(null);
  const [translateAllProgress, setTranslateAllProgress] = useState<{ current: number; total: number } | null>(null);
  // Visuals built for each slide, kept until the page is closed.
  const [visualsBySlide, setVisualsBySlide] = useState<Record<number, VisualsEntry>>({});
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
  const [transcribedText, setTranscribedText] = useState<string>('');
  const [voiceoverText, setVoiceoverText] = useState<string>('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const hydratedRef = useRef(false);
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
  const af = language === 'af';

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

  // Restore saved work (text, voice, transcript and audio) once after sign-in
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await loadWorkspace();
      if (cancelled) return;
      if (saved) {
        const restored: CoursePage[] = await Promise.all(
          saved.pages.map(async (p) => ({
            id: p.id,
            text: p.text,
            audioData: p.hasAudio ? (await loadAudio(`p-${p.id}`)) ?? undefined : undefined,
          }))
        );
        if (cancelled) return;
        const idx = Math.min(Math.max(saved.pageIndex || 0, 0), restored.length - 1);
        setPages(restored);
        setPageIndex(idx);
        setText(restored[idx].text);
        if (saved.voiceId) setSelectedVoiceId(saved.voiceId);
        setTranscribedText(saved.transcript || '');
        const current = restored[idx];
        if (current.audioData) {
          const url = URL.createObjectURL(pcmToWavBlob(current.audioData, 24000));
          currentBlobUrlRef.current = url;
          if (audioRef.current) {
            audioRef.current.src = url;
            audioRef.current.load();
          }
          setAudioState(prev => ({ ...prev, hasAudio: true }));
        }
      }
      hydratedRef.current = true;
    })();
    return () => { cancelled = true; };
  }, []);

  // Save text, voice and transcript shortly after each change
  useEffect(() => {
    if (!hydratedRef.current) return;
    setSaveStatus('saving');
    const timer = setTimeout(async () => {
      const ok = await saveWorkspace({ pages, pageIndex, voiceId: selectedVoiceId, transcript: transcribedText });
      setSaveStatus(ok ? 'saved' : 'error');
    }, 1500);
    return () => clearTimeout(timer);
  }, [pages, pageIndex, selectedVoiceId, transcribedText]);

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
      const { base64 } = await generateCheckedSpeech(selectedVoice, text, isAfrikaansText(text, language));
      setAudioSourceFromBase64(base64);
      ensureAudioContext();
      
      const audioBytes = decodeBase64(base64);
      const generatedPageId = pages[pageIndex]?.id;
      if (generatedPageId !== undefined) void saveAudio(`p-${generatedPageId}`, audioBytes);
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
          const { base64 } = await generateCheckedSpeech(selectedVoice, page.text, isAfrikaansText(page.text, language));
          const audioBytes = decodeBase64(base64);
          void saveAudio(`p-${page.id}`, audioBytes);
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

  // ---- saving slide audio to the library
  const slideTitleFor = (i: number) => `${af ? 'Skyfie' : 'Slide'} ${i + 1}: ${(pages[i]?.text.trim().split(/\n/)[0] || '').replace(/^#+\s*/, '').slice(0, 60)}`.trim();
  const handleSaveAudio = async () => {
    const page = pages[pageIndex];
    if (!page?.audioData) return;
    const title = window.prompt(af ? 'Naam vir hierdie klank in die biblioteek:' : 'Name for this audio in the library:', slideTitleFor(pageIndex));
    if (!title || !title.trim()) return;
    setAudioSave({ busy: true, note: null, error: null });
    try {
      await saveAudioToLibrary({ title: title.trim(), text: page.text, pcm: page.audioData, lang: isAfrikaansText(page.text, language) ? 'af' : 'en', voiceLabel: getSelectedVoice().label, slideLabel: `${af ? 'Skyfie' : 'Slide'} ${pageIndex + 1}` });
      setAudioSave({ busy: false, note: af ? `Klank gestoor as "${title.trim()}" onder Biblioteek.` : `Audio saved as "${title.trim()}" in the Library.`, error: null });
    } catch (e: any) {
      setAudioSave({ busy: false, note: null, error: e?.message || 'Could not save the audio.' });
    }
  };
  const handleSaveAllAudio = async () => {
    const withAudio = pages.map((p, i) => ({ p, i })).filter((x) => x.p.audioData);
    if (!withAudio.length) return;
    const name = window.prompt(af ? 'Naam vir die kolleksie in die biblioteek:' : 'Name for the collection in the library:', af ? 'Klank van alle skyfies' : 'Audio of all slides');
    if (!name || !name.trim()) return;
    setAudioSave({ busy: true, note: null, error: null });
    let collectionId: string | null = null;
    try {
      collectionId = (await createCollection(name.trim(), language)).id;
      for (const { p, i } of withAudio) {
        await saveAudioToLibrary({ title: slideTitleFor(i), text: p.text, pcm: p.audioData!, lang: isAfrikaansText(p.text, language) ? 'af' : 'en', voiceLabel: getSelectedVoice().label, slideLabel: `${af ? 'Skyfie' : 'Slide'} ${i + 1}`, collectionId, position: i });
      }
      setAudioSave({ busy: false, note: af ? `${withAudio.length} klankgreep(e) gestoor in die kolleksie "${name.trim()}".` : `${withAudio.length} audio clip(s) saved in the collection "${name.trim()}".`, error: null });
    } catch (e: any) {
      if (collectionId) await fetch(`/api/library/collections/${collectionId}`, { method: 'DELETE' }).catch(() => {});
      setAudioSave({ busy: false, note: null, error: e?.message || 'Could not save the audio.' });
    }
  };

  // ---- opening saved work from the library in the studio
  const handleLibraryEdit = (payload: LibraryEditPayload) => {
    const base = Date.now();
    if (payload.kind === 'audio') {
      // a saved voice-over joins the open project as a new slide at the end; nothing is replaced
      const s = payload.slides[0];
      const added: CoursePage = { id: base, text: s.text, audioData: s.pcm };
      const next = [...pages, added];
      setPages(next);
      setShowLibrary(false);
      goToPage(next.length - 1, next);
      return;
    }
    const ok = window.confirm(af
      ? `Maak "${payload.title}" oop in die ateljee? Dit vervang die projek wat nou oop is. Jy kan dit ontdoen.`
      : `Open "${payload.title}" in the studio? It replaces the project that is open now. You can undo this.`);
    if (!ok) return;
    snapshot(af ? `Biblioteek oopgemaak: ${payload.title}` : `Opened from the library: ${payload.title}`);
    const voiceId = getSelectedVoice().id;
    const newPages: CoursePage[] = payload.slides.map((s, i) => ({ id: base + i, text: s.text, audioData: s.pcm }));
    const entries: Record<number, VisualsEntry> = {};
    const slides: LibraryLink['slides'] = {};
    payload.slides.forEach((s, i) => {
      slides[base + i] = { id: s.lessonId, token: s.token };
      // a lesson saved before the voice was kept is taken to be voiced with the narrator chosen now
      if (s.entry) entries[base + i] = { ...s.entry, voiceId: s.entry.voiceId || voiceId };
    });
    setPages(newPages);
    setVisualsBySlide(entries);
    setLibraryLink({ collectionId: payload.collectionId, title: payload.title, slides });
    setShowLibrary(false);
    goToPage(0, newPages);
    if (payload.slides.some((s) => s.entry)) { if (payload.kind === 'collection') setShowAllVisuals(true); else setShowVisuals(true); }
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

  const goToPage = (newIndex: number, list: CoursePage[] = pages) => {
    if (newIndex < 0 || newIndex >= list.length) return;
    stopAudio();
    setPageIndex(newIndex);
    const targetPage = list[newIndex];
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
  };

  const handlePageChange = (direction: 'next' | 'prev') => goToPage(direction === 'next' ? pageIndex + 1 : pageIndex - 1);

  // ---- whole-lesson changes: translate every slide, balance slide lengths. Each can be undone.
  const snapshot = (label: string) => setStructUndo({ label, pages, pageIndex, language, visuals: visualsBySlide, link: libraryLink });

  const handleTranslateAll = async () => {
    const filled = pages.filter((p) => p.text.trim()).length;
    if (!filled || isTranslating) return;
    const target = language === 'en' ? 'Afrikaans' : 'English';
    const ok = window.confirm(
      language === 'af'
        ? `Vertaal al ${filled} skyfies na Engels? Die klank en beelde van die skyfies moet daarna weer gemaak word. Jy kan dit ontdoen.`
        : `Translate all ${filled} slides to Afrikaans? Their audio and visuals will have to be made again. You can undo it.`
    );
    if (!ok) return;
    setIsTranslating(true);
    setTranslateAllProgress({ current: 0, total: filled });
    const ctl = new AbortController();
    abortControllerRef.current = ctl;
    try {
      // translate everything first and change nothing until every slide has worked: no half-translated lesson
      const out: string[] = [];
      let done = 0;
      for (const p of pages) {
        if (ctl.signal.aborted) throw new DOMException('Stopped', 'AbortError');
        if (!p.text.trim()) { out.push(p.text); continue; }
        out.push(await translateText(p.text, target));
        setTranslateAllProgress({ current: ++done, total: filled });
      }
      snapshot(language === 'af' ? 'Alle skyfies vertaal' : 'All slides translated');
      const next = pages.map((p, i) => ({ id: p.id, text: out[i] }));
      setPages(next);
      setText(next[pageIndex].text);
      setLanguage(language === 'en' ? 'af' : 'en');
      try { localStorage.setItem('app-language', language === 'en' ? 'af' : 'en'); } catch { /* storage unavailable */ }
      setVisualsBySlide({});
      stopAudio();
      setAudioState(prev => ({ ...prev, hasAudio: false }));
    } catch (e: any) {
      if (e?.name !== 'AbortError') alert(language === 'af' ? 'Vertaling het misluk. Niks is verander nie.' : 'Translation failed. Nothing was changed.');
    } finally {
      setIsTranslating(false);
      setTranslateAllProgress(null);
    }
  };

  const applyBalance = (slides: { text: string; keepId?: number }[]) => {
    snapshot(language === 'af' ? `Skyfies gebalanseer (${pages.length} → ${slides.length})` : `Slides balanced (${pages.length} → ${slides.length})`);
    const byId = new Map<number, CoursePage>(pages.map((p): [number, CoursePage] => [p.id, p]));
    let nextId = Date.now();
    const next: CoursePage[] = slides.map((sl) => {
      const old = sl.keepId !== undefined ? byId.get(sl.keepId) : undefined;
      return old ? old : { id: nextId++, text: sl.text };
    });
    const idx = Math.min(pageIndex, next.length - 1);
    setPages(next);
    setShowBalance(false);
    goToPage(idx, next);
  };

  const undoStructure = () => {
    if (!structUndo) return;
    setPages(structUndo.pages);
    setLanguage(structUndo.language);
    try { localStorage.setItem('app-language', structUndo.language); } catch { /* storage unavailable */ }
    setVisualsBySlide(structUndo.visuals);
    setLibraryLink(structUndo.link);
    goToPage(Math.min(structUndo.pageIndex, structUndo.pages.length - 1), structUndo.pages);
    setStructUndo(null);
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
    goToPage(pageIndex + 1, newPages);
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
  // Both work inside the open project: one replaces a slide of it, the other adds slides to it. Each can be undone.
  const handleApplyTranscriptionToCurrentSlide = (transcribed: string, target: number = pageIndex) => {
    const i = Math.min(Math.max(target, 0), pages.length - 1);
    snapshot(af ? `Skyfie ${i + 1} vervang deur die transkripsie` : `Slide ${i + 1} replaced by the transcription`);
    const next = pages.map((p, k) => (k === i ? { ...p, text: transcribed, audioData: undefined } : p));
    setPages(next);
    setAudioState(prev => ({ ...prev, hasAudio: false }));
    goToPage(i, next);
    setActiveTab('studio');
  };

  const handleApplyTranscriptionAsNewSlides = (transcribed: string, after: number = pageIndex) => {
    // paragraphs become slides; a paragraph that is too long to produce is cut into balanced slides
    const chunks = transcribed.split(/\n\s*\n/).map(x => x.trim()).filter(Boolean);
    if (chunks.length === 0 && transcribed.trim()) chunks.push(transcribed.trim());
    const texts = chunks.flatMap((c) => balanceSlides([c]).map((r) => r.text)).filter((x) => x.trim());
    if (!texts.length) return;
    const at = Math.min(Math.max(after, 0), pages.length - 1);
    snapshot(af ? `${texts.length} nuwe skyfie(s) bygevoeg na skyfie ${at + 1}` : `${texts.length} new slide(s) added after slide ${at + 1}`);
    const base = Date.now();
    const added: CoursePage[] = texts.map((text, idx) => ({ id: base + idx, text }));
    const next = [...pages.slice(0, at + 1), ...added, ...pages.slice(at + 1)];
    setPages(next);
    goToPage(at + 1, next);
    setActiveTab('studio');
  };

  // ---- any slide can be deleted or moved to another position (undo brings it back)
  const deleteSlideAt = (i: number) => {
    if (i < 0 || i >= pages.length) return;
    if (pages.length <= 1) { handleDeleteBlock(); return; }
    snapshot(af ? `Skyfie ${i + 1} verwyder` : `Slide ${i + 1} deleted`);
    const next = pages.filter((_, k) => k !== i);
    const keep = i < pageIndex ? pageIndex - 1 : Math.min(pageIndex, next.length - 1);
    setPages(next);
    setVisualsBySlide((prev) => { const n = { ...prev }; delete n[pages[i].id]; return n; });
    goToPage(i === pageIndex ? Math.min(i, next.length - 1) : keep, next);
  };

  const moveSlide = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= pages.length || to >= pages.length) return;
    snapshot(af ? `Skyfie ${from + 1} geskuif na posisie ${to + 1}` : `Slide ${from + 1} moved to position ${to + 1}`);
    const next = [...pages];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    setPages(next);
    // stay on the slide the user was on, wherever it ended up
    const cur = pages[pageIndex].id;
    goToPage(next.findIndex((p) => p.id === cur), next);
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
    <div className="h-full flex flex-col overflow-hidden bg-slate-50 font-sans selection:bg-indigo-100">
      
      {/* Top Application Bar */}
      <header className="flex-none flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-6 py-3 bg-white border-b border-slate-200 max-w-[1600px] mx-auto w-full">
        <div className="flex items-center gap-3">
          <img src={BRAND.logoMark} alt={BRAND.name} className="h-11 w-auto" />
          <div className="hidden sm:block">
            <h1 className="text-xl text-indigo-600 leading-none whitespace-nowrap">Get Sharp Academy</h1>
            <p className="brand-tag text-[13px] text-slate-500 leading-tight mt-1 whitespace-nowrap">
              CourseVoice Studio · {language === 'af' ? "Skyfies, stem en beelde" : "Slides, voice and visuals"}
            </p>
          </div>
        </div>

        {/* Studio / Transcription Navigation Tabs */}
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-inner">
            <button
              onClick={() => setActiveTab('studio')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
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
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
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
            className="flex items-center gap-2 px-3.5 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-xl text-xs font-extrabold shadow-md shadow-violet-200 transition-all transform active:scale-95"
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
            onClick={() => setShowLibrary(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-200"
            title={language === 'af' ? 'Gestoorde lesse' : 'Saved lessons'}
          >
            <Library size={14} />
            <span>{language === 'af' ? 'Biblioteek' : 'Library'}</span>
          </button>
          <button
            onClick={() => setShowRules(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-200"
            title={language === 'af' ? 'My reëls vir toekomstige lesse' : 'My rules for future lessons'}
            data-testid="header-rules"
          >
            <ScrollText size={14} />
            <span>{language === 'af' ? 'Reëls' : 'Rules'}</span>
          </button>
          <button
            onClick={() => setShowHelp(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-200"
            title={language === 'af' ? 'Hulp: handleiding' : 'Help: how to use'}
            data-testid="header-help"
          >
            <HelpCircle size={14} />
            <span>{language === 'af' ? 'Hulp' : 'Help'}</span>
          </button>
          <button 
            onClick={() => setCurrentStep(1)} 
            className="text-slate-400 hover:text-indigo-600 transition-colors p-1.5 rounded-lg hover:bg-slate-100" 
            title="Show Guided Steps"
          >
            <HelpCircle size={19} />
          </button>
          {saveStatus !== 'idle' && (
            <span className={`text-[10px] font-bold ${saveStatus === 'error' ? 'text-rose-500' : 'text-slate-400'}`}>
              {saveStatus === 'saving'
                ? (language === 'af' ? 'Stoor...' : 'Saving...')
                : saveStatus === 'saved'
                ? (language === 'af' ? 'Gestoor' : 'Saved')
                : (language === 'af' ? 'Kon nie stoor nie' : 'Not saved')}
            </span>
          )}
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
      <main className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden px-5 py-4 max-w-[1600px] mx-auto w-full">
        
        {activeTab === 'transcribe' ? (
          <TranscriptionPanel
            currentLanguage={language}
            onApplyToSlide={handleApplyTranscriptionToCurrentSlide}
            onApplyAsNewSlides={handleApplyTranscriptionAsNewSlides}
            slides={pages.map((p) => p.text.trim().split(/\n/)[0].slice(0, 36))}
            currentSlide={pageIndex}
            transcribedText={transcribedText}
            onTranscribedTextChange={setTranscribedText}
            voiceoverText={voiceoverText}
            onVoiceoverTextChange={setVoiceoverText}
            voices={allVoices}
            selectedVoiceId={selectedVoiceId}
            onSelectVoiceId={setSelectedVoiceId}
          />
        ) : (
          <div className="lg:h-full grid grid-cols-1 lg:grid-cols-12 gap-5 lg:min-h-0">
            
            {/* Left: Slides - import, edit, language, structure */}
            <div className="lg:col-span-7 flex flex-col min-h-[460px] lg:min-h-0 relative">
              {currentStep === 1 && <StepPopup step={1} />}
              {currentStep === 2 && <StepPopup step={2} />}

              {/* Toolbar, grouped in the order the work goes: bring content in, edit it, set the language, shape the slides */}
              <div className="flex-none bg-white rounded-t-xl shadow-sm border border-slate-200 border-b-0 px-3 py-2.5 flex flex-wrap items-end gap-x-4 gap-y-2">
                <div>
                  <div className="brand-label text-[10px] text-slate-400 mb-1">{af ? '1 · Inhoud' : '1 · Content'}</div>
                  <div className="flex items-center gap-1.5">
                    <div className="relative">
                      <input type="file" accept=".pdf" ref={fileInputRef} onChange={handlePdfUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                      <button disabled={audioState.isLoading} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-50 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-100 transition-colors text-xs font-bold">
                        <FileUp size={13} className="text-indigo-600" /><span>{t.uploadPdf}</span>
                      </button>
                    </div>
                    <button onClick={handleExtract} disabled={audioState.isLoading} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-50 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-100 transition-colors text-xs font-bold">
                      <ScanSearch size={13} className="text-indigo-600" /><span>{t.extractPage}</span>
                    </button>
                  </div>
                </div>

                <div>
                  <div className="brand-label text-[10px] text-slate-400 mb-1">{af ? '2 · Redigeer' : '2 · Edit'}</div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={handleEnhanceConversational} disabled={isEnhancingScript || audioState.isLoading}
                      className="flex items-center gap-1.5 text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 text-xs font-bold px-2.5 py-1.5 rounded-lg transition-colors" title={t.enhanceTooltip}>
                      {isEnhancingScript ? <Loader className="animate-spin" size={13} /> : <AudioWaveform size={13} />}<span>{t.enhanceConversational}</span>
                    </button>
                    <button onClick={handleRepairText} className="flex items-center gap-1.5 text-slate-500 hover:text-indigo-700 text-xs font-bold px-2 py-1.5 hover:bg-indigo-50 rounded-lg" title={t.fixTextTooltip}>
                      <Wand2 size={13} /><span>{t.fixText}</span>
                    </button>
                  </div>
                </div>

                <div>
                  <div className="brand-label text-[10px] text-slate-400 mb-1">{af ? '3 · Taal' : '3 · Language'}</div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={handleTranslate} disabled={isTranslating || audioState.isLoading}
                      className="flex items-center gap-1.5 text-slate-600 hover:text-indigo-700 text-xs font-bold px-2.5 py-1.5 border border-slate-200 hover:bg-indigo-50 rounded-lg" title={af ? 'Vertaal hierdie skyfie' : 'Translate this slide'}>
                      {isTranslating && !translateAllProgress ? <Loader className="animate-spin" size={13} /> : <ArrowRightLeft size={13} />}<span>{t.translate}</span>
                    </button>
                    <button onClick={handleTranslateAll} disabled={isTranslating || audioState.isLoading} data-testid="translate-all"
                      className="flex items-center gap-1.5 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 text-xs font-bold px-2.5 py-1.5 rounded-lg" title={af ? 'Vertaal al die skyfies' : 'Translate all slides'}>
                      {translateAllProgress ? <Loader className="animate-spin" size={13} /> : <Languages size={13} />}
                      <span>{translateAllProgress ? `${translateAllProgress.current}/${translateAllProgress.total}` : (af ? 'Vertaal alles' : 'Translate all')}</span>
                    </button>
                  </div>
                </div>

                <div>
                  <div className="brand-label text-[10px] text-slate-400 mb-1">{af ? '4 · Skyfies' : '4 · Slides'}</div>
                  <button onClick={() => setShowBalance(true)} data-testid="balance-open"
                    className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-lg border ${pages.some((p) => slideSize(p.text).level === 'toolong') ? 'text-rose-700 bg-rose-50 border-rose-200 hover:bg-rose-100' : 'text-slate-600 border-slate-200 hover:bg-indigo-50'}`}
                    title={af ? 'Skuif inhoud wat te veel is na die volgende skyfie' : 'Move content that does not fit on to the next slide'}>
                    <Scissors size={13} /><span>{af ? 'Balanseer skyfies' : 'Balance slides'}</span>
                  </button>
                </div>
              </div>

              {structUndo && (
                <div className="flex-none bg-indigo-50 border-x border-indigo-100 px-3 py-1.5 flex items-center justify-between gap-2 text-[11px] text-indigo-800 anim-slide-down" data-testid="undo-bar">
                  <span className="font-bold">{structUndo.label}</span>
                  <span className="flex items-center gap-2">
                    <button onClick={undoStructure} className="flex items-center gap-1 font-bold hover:underline"><Undo2 size={12} /> {af ? 'Ontdoen' : 'Undo'}</button>
                    <button onClick={() => setStructUndo(null)} className="text-indigo-400 hover:text-indigo-700" aria-label="Dismiss"><X size={12} /></button>
                  </span>
                </div>
              )}

              {/* Every slide at a glance: click to open, the bar shows how full it is, the dots show what is made */}
              <div className="flex-none bg-slate-50 border-x border-slate-200 px-2 py-1.5 flex items-center gap-1.5 overflow-x-auto custom-scrollbar" data-testid="slide-strip" role="tablist" aria-label={af ? 'Skyfies' : 'Slides'}>
                {pages.map((p, i) => {
                  const sz = slideSize(p.text);
                  const on = i === pageIndex;
                  const vis = visualsBySlide[p.id];
                  return (
                    <div key={p.id} className="relative flex-none group" data-testid="strip-slide"
                      draggable
                      onDragStart={(e) => { setDragFrom(i); setSlideMenu(null); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(i)); } catch { /* some browsers need data to start a drag */ } }}
                      onDragOver={(e) => { if (dragFrom !== null) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dragOver !== i) setDragOver(i); } }}
                      onDragLeave={() => { if (dragOver === i) setDragOver(null); }}
                      onDrop={(e) => { e.preventDefault(); if (dragFrom !== null) moveSlide(dragFrom, i); setDragFrom(null); setDragOver(null); }}
                      onDragEnd={() => { setDragFrom(null); setDragOver(null); }}>
                      {dragOver === i && dragFrom !== null && dragFrom !== i && <div className={`absolute top-0 bottom-0 w-1 rounded bg-indigo-500 z-10 ${dragFrom < i ? '-right-1' : '-left-1'}`} />}
                      <button role="tab" aria-selected={on} onClick={() => goToPage(i)} style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}
                        className={`anim-fade-up w-32 text-left rounded-lg border px-2 py-1.5 transition-all cursor-grab active:cursor-grabbing ${on ? 'bg-white border-indigo-300 shadow-sm' : 'bg-white/60 border-slate-200 hover:bg-white'} ${dragFrom === i ? 'opacity-40' : ''}`}
                        title={p.text.trim().slice(0, 140)}>
                        <div className="flex items-center justify-between gap-1 pr-4">
                          <span className={`text-[10px] font-bold ${on ? 'text-indigo-700' : 'text-slate-500'}`}>{i + 1}</span>
                          <span className="flex items-center gap-1 text-[9px]">
                            {p.audioData && <span title={af ? 'Klank gemaak' : 'Audio made'}>🔊</span>}
                            {vis && vis.slideText === p.text && <span title={af ? 'Beelde gemaak' : 'Visuals made'}>✨</span>}
                            {sz.level === 'toolong' && <span title={af ? 'Te lank' : 'Too long'}>⚠️</span>}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-600 truncate leading-tight mt-0.5">{(i === pageIndex ? text : p.text).trim().split(/\n/)[0].slice(0, 40) || '—'}</div>
                        <div className="h-1 rounded bg-slate-100 overflow-hidden mt-1"><div className={`h-full ${sz.level === 'toolong' ? 'bg-rose-500' : sz.level === 'long' ? 'bg-amber-400' : 'bg-violet-400'}`} style={{ width: `${Math.min(100, (sz.chars / SLIDE_LIMITS.maxChars) * 100)}%` }} /></div>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setSlideMenu(slideMenu?.index === i ? null : { index: i, x: Math.min(r.left, window.innerWidth - 230), y: r.bottom + 4 }); }}
                        className={`absolute top-1 right-1 w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:text-indigo-700 hover:bg-indigo-50 ${on || slideMenu?.index === i ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'}`}
                        aria-label={af ? `Skyfie ${i + 1}: skuif of verwyder` : `Slide ${i + 1}: move or delete`} data-testid={`slide-menu-${i}`}>
                        <MoreHorizontal size={13} />
                      </button>
                    </div>
                  );
                })}
                <button onClick={handleAddBlock} className="flex-none w-9 h-12 rounded-lg border border-dashed border-slate-300 text-slate-400 hover:text-indigo-600 hover:border-indigo-300 flex items-center justify-center" title={t.addBlock} aria-label={t.addBlock}><Plus size={14} /></button>
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
                    <button onClick={() => deleteSlideAt(pageIndex)} className="p-1.5 text-slate-300 hover:text-rose-500 rounded-lg transition-colors" title={t.deleteBlock} aria-label={t.deleteBlock} data-testid="delete-current"><Trash2 size={15} /></button>
                    <div className="flex items-center space-x-1 bg-white rounded-lg border border-slate-200 p-0.5 shadow-sm">
                      <button onClick={() => handlePageChange('prev')} disabled={pageIndex === 0} className="p-1 hover:bg-slate-100 rounded disabled:opacity-20" aria-label="Previous slide"><ChevronLeft size={14} /></button>
                      <span className="text-[10px] font-bold text-slate-700 w-20 text-center uppercase">{t.block} {pageIndex + 1}/{pages.length}</span>
                      <button onClick={() => handlePageChange('next')} disabled={pageIndex === pages.length - 1} className="p-1 hover:bg-slate-100 rounded disabled:opacity-20" aria-label="Next slide"><ChevronRight size={14} /></button>
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
                    placeholder={af ? 'Tik of plak die skyfie se teks...' : 'Enter course slide content...'} 
                    spellCheck={false} 
                  />
                </div>

                {(() => {
                  const sz = slideSize(text);
                  return (
                    <div className="flex-none px-4 py-2 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2" data-testid="length-meter">
                      <span className={`text-[10px] font-bold flex items-center gap-1.5 ${sz.level === 'toolong' ? 'text-rose-600' : sz.level === 'long' ? 'text-amber-600' : 'text-slate-400'}`}>
                        {sz.level === 'toolong' && <AlertCircle size={12} />}
                        {sz.chars} / {SLIDE_LIMITS.maxChars} {t.chars} · {sz.words} {af ? 'woorde' : 'words'}{sz.seconds ? ` · ≈ ${Math.floor(sz.seconds / 60)}:${String(sz.seconds % 60).padStart(2, '0')}` : ''}
                        {sz.level === 'toolong' && <span>{af ? '— te lank om te maak' : '— too long to produce'}</span>}
                      </span>
                      {sz.level === 'toolong' && (
                        <button onClick={() => setShowBalance(true)} className="text-[10px] font-bold text-rose-700 hover:underline flex items-center gap-1"><Scissors size={11} /> {af ? 'Balanseer skyfies' : 'Balance slides'}</button>
                      )}
                    </div>
                  );
                })()}
              </div>

              <div className="flex-none h-4 bg-slate-50 border-x border-slate-200 border-b rounded-b-xl shadow-inner"></div>
            </div>

            {/* Right: the production line, in order: narrator, audio, visuals */}
            <div className="lg:col-span-5 flex flex-col lg:min-h-0">
              <div className="lg:flex-1 flex flex-col lg:min-h-0 bg-white rounded-2xl shadow-sm border border-slate-200 p-5 lg:overflow-y-auto custom-scrollbar space-y-5">

                <div className="flex-none flex items-center justify-between">
                  <div>
                    <h2 className="text-xl text-indigo-600 leading-none">{t.voiceStudio}</h2>
                    <p className="brand-tag text-sm text-slate-400 mt-1">{BRAND.tagline}</p>
                  </div>
                  <span className="text-[9px] bg-violet-50 text-violet-700 font-black px-2 py-0.5 rounded-full uppercase border border-violet-100">
                    {getSelectedVoice().provider === 'elevenlabs' ? 'eleven_v3' : 'gemini-3.8-flash-tts'}
                  </span>
                </div>

                {/* ① Narrator */}
                <section className="flex-none relative anim-fade-up" aria-label={af ? 'Verteller' : 'Narrator'}>
                  {currentStep === 3 && <StepPopup step={3} />}
                  <div className="brand-label text-[11px] text-slate-500 mb-1.5 flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] flex items-center justify-center font-bold not-italic" style={{ fontFamily: 'Inter, sans-serif', letterSpacing: 0 }}>1</span>{af ? 'Verteller' : 'Narrator'}</div>
                  {(() => {
                    const sel = getSelectedVoice();
                    const meta = (t.voiceLabels as any)[sel.id] || { label: sel.label, desc: sel.description };
                    return (
                      <div className="p-3 rounded-xl border-2 border-indigo-100 bg-white space-y-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-10 h-10 flex-none rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-black">{meta.label[0]}</div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[13px] font-extrabold text-slate-800 truncate">{meta.label}</div>
                            <div className="text-[10px] text-slate-400 font-bold truncate">{meta.desc}</div>
                          </div>
                          <button onClick={() => handleVoicePreview(sel)} className="flex-none p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-100 transition-colors" title="Listen to realistic sample" aria-label="Preview voice">
                            {previewStatus?.id === sel.id && previewStatus?.status === 'loading' ? <Loader className="animate-spin" size={15} /> : <Volume2 size={16} />}
                          </button>
                          <button onClick={() => { setShowVoicePicker(true); if (currentStep === 3) setCurrentStep(4); }} className="flex-none px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors">
                            {af ? `Kies (${allVoices.length})` : `Choose (${allVoices.length})`}
                          </button>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-bold uppercase flex-none"><Gauge size={13} /><span>{t.speed}</span></div>
                          <input type="range" min="0.5" max="2" step="0.25" value={playbackSpeed}
                            onChange={(e) => { const s2 = parseFloat(e.target.value); setPlaybackSpeed(s2); if (audioRef.current) audioRef.current.playbackRate = s2; }}
                            className="flex-1 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                          <span className="text-xs font-bold text-indigo-600 bg-white px-2 py-0.5 rounded-lg border border-indigo-100">{playbackSpeed}x</span>
                        </div>
                      </div>
                    );
                  })()}
                </section>

                {/* ② Audio */}
                <section className="flex-none relative anim-fade-up" style={{ animationDelay: '70ms' }} aria-label={af ? 'Klank' : 'Audio'}>
                  {currentStep === 4 && <StepPopup step={4} />}
                  <div className="brand-label text-[11px] text-slate-500 mb-1.5 flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] flex items-center justify-center font-bold" style={{ fontFamily: 'Inter, sans-serif', letterSpacing: 0 }}>2</span>{af ? 'Klank van die skyfie' : 'Slide audio'}</div>
                  <div className="grid grid-cols-2 gap-3">
                    {audioState.isLoading || isBatchGenerating || isTranslating ? (
                      <button onClick={stopProcesses} className="col-span-2 py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-bold shadow-lg shadow-rose-100 transition-all flex items-center justify-center space-x-2 text-xs">
                        <Square size={14} fill="currentColor" /><span>{t.stop}</span>
                      </button>
                    ) : (
                      <>
                        <button onClick={handleGenerate} disabled={!text} className="py-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 disabled:bg-slate-200 text-white rounded-xl font-bold shadow-lg shadow-indigo-100 transition-all flex items-center justify-center space-x-2 text-xs">
                          <Sparkles size={14} /><span>{t.generateAudio}</span>
                        </button>
                        <button onClick={handleGenerateAll} disabled={!pages.length} className="py-3 px-3 rounded-xl border-2 border-indigo-50 text-indigo-700 font-bold hover:bg-indigo-50 transition-colors flex items-center justify-center gap-2 text-xs">
                          <Layers size={14} /><span>{t.generateAll}</span>
                        </button>
                      </>
                    )}
                  </div>
                  {isBatchGenerating && (
                    <div className="mt-3 bg-indigo-50 rounded-xl p-3 border border-indigo-100 animate-pulse">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold text-indigo-700 flex items-center gap-1.5"><Loader className="animate-spin" size={12} />{t.generatingBatch}</span>
                        <span className="text-[10px] text-indigo-600 font-mono font-bold">{batchProgress.current} / {batchProgress.total}</span>
                      </div>
                      <div className="w-full bg-indigo-100 rounded-full h-1.5 overflow-hidden"><div className="bg-indigo-600 h-full rounded-full transition-all duration-500" style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}></div></div>
                    </div>
                  )}

                  <div className="mt-3 bg-indigo-800 rounded-2xl p-3 relative overflow-hidden shadow-xl min-h-[104px] flex flex-col justify-between group">
                    {currentStep === 5 && <StepPopup step={5} />}
                    <div className="absolute top-0 left-0 right-0 p-3 flex justify-between items-start z-10">
                      <div className="bg-white/10 backdrop-blur-md px-2.5 py-1 rounded-lg text-[10px] text-white/90 font-bold tracking-widest uppercase flex items-center gap-1.5">
                        <span>{getSelectedVoice().label}</span>
                        {getSelectedVoice().isAfrVariant && <span className="text-[8px] bg-emerald-500 text-white px-1 rounded font-black">AFR</span>}
                      </div>
                      <div className="bg-white/10 backdrop-blur-md px-2.5 py-1 rounded-lg text-[10px] text-white/90 font-mono font-bold flex items-center gap-1.5">
                        <span className={audioState.isPlaying ? "animate-pulse text-emerald-400" : "text-slate-500"}>●</span>
                        {formatTime(audioState.currentTime)} / {formatTime(audioState.duration)}
                      </div>
                    </div>
                    <div className="mt-6 flex-1 flex items-center justify-center opacity-80 group-hover:opacity-100 transition-opacity min-h-[24px] max-h-[34px] overflow-hidden">
                      <Visualizer analyser={analyserRef.current} isPlaying={audioState.isPlaying} />
                    </div>
                    <Controls isPlaying={audioState.isPlaying} onPlayPause={handlePlayPause} onReset={stopAudio} onDownload={handleDownload} disabled={!audioState.hasAudio || audioState.isLoading} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2" data-testid="audio-save">
                    <button onClick={handleSaveAudio} disabled={!pages[pageIndex]?.audioData || audioSave.busy} data-testid="save-audio"
                      className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-40 flex items-center gap-1.5"
                      title={af ? 'Stoor die klank van hierdie skyfie in die biblioteek' : 'Save the audio of this slide in the library'}>
                      {audioSave.busy ? <Loader className="animate-spin" size={12} /> : <Library size={12} />} {af ? 'Stoor klank in biblioteek' : 'Save audio to library'}
                    </button>
                    {pages.filter((p) => p.audioData).length > 1 && (
                      <button onClick={handleSaveAllAudio} disabled={audioSave.busy} data-testid="save-all-audio"
                        className="px-3 py-1.5 rounded-lg text-[11px] font-bold border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40">
                        {af ? `Stoor al ${pages.filter((p) => p.audioData).length} klanke as kolleksie` : `Save all ${pages.filter((p) => p.audioData).length} audio clips as a collection`}
                      </button>
                    )}
                    {audioSave.note && <span className="text-[10px] text-emerald-700" data-testid="audio-saved">{audioSave.note}</span>}
                    {audioSave.error && <span className="text-[10px] text-rose-600">{audioSave.error}</span>}
                  </div>
                </section>

                {/* ③ Visuals: two separate productions */}
                <section className="flex-none anim-fade-up" style={{ animationDelay: '140ms' }} aria-label={af ? 'Beelde' : 'Visuals'}>
                  <div className="brand-label text-[11px] text-slate-500 mb-1.5 flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] flex items-center justify-center font-bold" style={{ fontFamily: 'Inter, sans-serif', letterSpacing: 0 }}>3</span>{af ? 'Skyfie-beelde' : 'Slide visuals'}</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button onClick={() => setShowVisuals(true)} disabled={!text.trim()} data-testid="open-slide-visuals"
                      className="text-left p-3 rounded-xl border-2 border-violet-100 hover:bg-violet-50 disabled:opacity-40 transition-colors">
                      <div className="flex items-center gap-2 text-violet-700 font-bold text-xs"><Wand2 size={14} />{af ? 'Hierdie skyfie' : 'This slide'}</div>
                      <div className="text-[10px] text-slate-500 leading-snug mt-1">{af ? `Beelde en stem vir skyfie ${pageIndex + 1}, met die gesels-redigeerder.` : `Visuals and voice for slide ${pageIndex + 1}, with the chat editor.`}</div>
                    </button>
                    <button onClick={() => setShowAllVisuals(true)} disabled={!pages.some((p) => p.text.trim())} data-testid="open-all-visuals"
                      className="text-left p-3 rounded-xl border-2 border-indigo-100 hover:bg-indigo-50 disabled:opacity-40 transition-colors">
                      <div className="flex items-center gap-2 text-indigo-700 font-bold text-xs"><Presentation size={14} />{af ? 'Alle skyfies in een html' : 'All slides in one html'}</div>
                      <div className="text-[10px] text-slate-500 leading-snug mt-1">
                        {(() => { const made = pages.filter((p) => { const v = visualsBySlide[p.id]; return v && v.slideText === p.text; }).length; return af ? `${made} van ${pages.length} skyfies klaar. Een les met al die skyfies.` : `${made} of ${pages.length} slides made. One lesson with every slide.`; })()}
                      </div>
                    </button>
                  </div>
                </section>

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

      {slideMenu && (
        <>
          <div className="fixed inset-0 z-[70]" onClick={() => setSlideMenu(null)} />
          <div className="fixed z-[71] w-56 bg-white rounded-xl border border-slate-200 shadow-2xl p-3 space-y-2 anim-pop" style={{ left: slideMenu.x, top: slideMenu.y }} role="menu" data-testid="slide-menu">
            <div className="brand-label text-[11px] text-slate-500">{af ? `Skyfie ${slideMenu.index + 1}` : `Slide ${slideMenu.index + 1}`}</div>
            <label className="block text-[11px] font-bold text-slate-700">
              {af ? 'Skuif na posisie' : 'Move to position'}
              <select value={slideMenu.index} onChange={(e) => { const to = Number(e.target.value); const from = slideMenu.index; setSlideMenu(null); moveSlide(from, to); }}
                className="mt-1 w-full px-2 py-1.5 rounded-lg border border-slate-300 text-xs" data-testid="move-to">
                {pages.map((_, k) => <option key={k} value={k}>{k + 1}</option>)}
              </select>
            </label>
            <div className="flex gap-2">
              <button disabled={slideMenu.index === 0} onClick={() => { const i = slideMenu.index; setSlideMenu(null); moveSlide(i, i - 1); }} className="flex-1 py-1.5 rounded-lg border border-slate-200 text-[11px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-30 flex items-center justify-center gap-1"><ArrowLeft size={11} /> {af ? 'Links' : 'Left'}</button>
              <button disabled={slideMenu.index === pages.length - 1} onClick={() => { const i = slideMenu.index; setSlideMenu(null); moveSlide(i, i + 1); }} className="flex-1 py-1.5 rounded-lg border border-slate-200 text-[11px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-30 flex items-center justify-center gap-1">{af ? 'Regs' : 'Right'} <ArrowRight size={11} /></button>
            </div>
            <button onClick={() => { const i = slideMenu.index; setSlideMenu(null); deleteSlideAt(i); }} data-testid="menu-delete"
              className="w-full py-1.5 rounded-lg border border-rose-200 text-rose-700 text-[11px] font-bold hover:bg-rose-50 flex items-center justify-center gap-1.5"><Trash2 size={12} /> {af ? 'Verwyder skyfie' : 'Delete slide'}</button>
            <p className="text-[10px] text-slate-400 leading-snug">{af ? 'Jy kan ook \'n skyfie na \'n ander plek sleep. Ontdoen staan bo die redigeerder.' : 'You can also drag a slide to another place. Undo is above the editor.'}</p>
          </div>
        </>
      )}

      {showHelp && <HelpModal af={language === 'af'} onClose={() => setShowHelp(false)} />}
      {showRules && <RulesModal af={language === 'af'} onClose={() => setShowRules(false)} />}

      {showLibrary && <LibraryModal language={language} onClose={() => setShowLibrary(false)} onEdit={handleLibraryEdit} />}

      {showBalance && <BalanceModal pages={pages} language={language} onApply={applyBalance} onClose={() => setShowBalance(false)} />}

      {showAllVisuals && (
        <AllSlidesModal
          pages={pages}
          language={language}
          voice={getSelectedVoice()}
          entries={visualsBySlide}
          onEntry={(pageId, entry) => setVisualsBySlide((prev) => ({ ...prev, [pageId]: entry }))}
          link={libraryLink}
          onLink={setLibraryLink}
          onBalance={() => { setShowAllVisuals(false); setShowBalance(true); }}
          onClose={() => setShowAllVisuals(false)}
        />
      )}

      {showVisuals && (
        <VisualsModal
          slideNumber={pageIndex + 1}
          slideText={text}
          language={language}
          voice={getSelectedVoice()}
          entry={visualsBySlide[pages[pageIndex]?.id]}
          onEntry={(entry) => {
            const id = pages[pageIndex]?.id;
            if (id === undefined) return;
            setVisualsBySlide((prev) => {
              const next = { ...prev };
              if (entry) next[id] = entry; else delete next[id];
              return next;
            });
          }}
          link={(() => { const id = pages[pageIndex]?.id; const l = id !== undefined && libraryLink ? libraryLink.slides[id] : undefined; return l ? { ...l, title: libraryLink!.collectionId ? `${af ? 'Skyfie' : 'Slide'} ${pageIndex + 1}${visualsBySlide[id!]?.data.title ? `: ${visualsBySlide[id!].data.title}` : ''}` : libraryLink!.title } : null; })()}
          onLink={(l) => {
            const id = pages[pageIndex]?.id;
            if (id === undefined || !l) return;
            // a slide of an opened collection stays in that collection; otherwise this slide is the saved lesson
            setLibraryLink((cur) => (cur?.collectionId ? { ...cur, slides: { ...cur.slides, [id]: { id: l.id, token: l.token } } } : { collectionId: null, title: l.title, slides: { [id]: { id: l.id, token: l.token } } }));
          }}
          onClose={() => setShowVisuals(false)}
        />
      )}

    </div>
  );
};

export default App;
