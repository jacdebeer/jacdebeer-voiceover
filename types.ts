export enum VoiceName {
  Kore = 'Kore',
  Puck = 'Puck',
  Charon = 'Charon',
  Fenrir = 'Fenrir',
  Zephyr = 'Zephyr',
  Aoede = 'Aoede',
}

export interface AudioState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  isLoading: boolean;
  error: string | null;
  hasAudio: boolean;
}

export type VoiceCategory = 'conversational' | 'educator' | 'storyteller' | 'executive';

export interface VoiceOption {
  id: string; // Unique identifier for the selection UI
  voiceName: VoiceName | string; // Prebuilt voice name, or a Voice Library id when isLibrary is true
  label: string;
  description: string;
  conversationalBio: string;
  gender: 'Male' | 'Female';
  stylePrompt: string; // Custom speechMetadata style for Gemini 3.8 Flash TTS
  previewSampleText: {
    af: string;
    en: string;
  };
  isAfrVariant?: boolean;
  category?: VoiceCategory;
  isLibrary?: boolean; // Loaded from the Gemini Voice Library
  locale?: string; // e.g. af-ZA or en-GB
}

export interface CoursePage {
  id: number;
  text: string;
  audioData?: Uint8Array; // Raw audio buffer
  duration?: number;
}

export interface TranscriptionRecord {
  id: string;
  timestamp: number;
  text: string;
  audioBlob?: Blob;
  language: 'af' | 'en' | 'auto';
  durationSeconds?: number;
}

export interface LiveMessageItem {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

// Full array of realistic conversational voices
export const VOICE_OPTIONS: VoiceOption[] = [
  // Realistic Conversational Afrikaans Voices
  {
    id: 'sannie',
    voiceName: VoiceName.Kore,
    label: 'Sannie',
    description: 'Vriendelik & Warm Geselsstyl',
    conversationalBio: 'Natuurlike, alledaagse Afrikaanse geselsstem vol warmte, empatie en gemak.',
    gender: 'Female',
    stylePrompt: 'Natuurlike, warm, vriendelike en ontspanne Afrikaanse geselsstyl met lewendige intonasie.',
    previewSampleText: {
      af: 'Goeiedag! Ek is Sannie, en ek gesels graag natuurlik en warm saam met jou studente.',
      en: "Hello! I'm Sannie, speaking warmly and naturally for your course voice-over.",
    },
    isAfrVariant: true,
    category: 'conversational',
  },
  {
    id: 'elsabe',
    voiceName: VoiceName.Aoede,
    label: 'Elsabé',
    description: 'Professionele Lektrise',
    conversationalBio: 'Artikulerende, akademiese Afrikaanse lektrise met kristalhelder uitspraak en gesag.',
    gender: 'Female',
    stylePrompt: 'Duidelike, formele tog toeganklike Afrikaanse lektrisestem met akkurate artikulasie en selfvertroue.',
    previewSampleText: {
      af: 'Welkom by hierdie lesing. Ons ondersoek vandag kernbegrippe met duidelike insig.',
      en: 'Welcome to this module. Today we analyze the foundational concepts in detail.',
    },
    isAfrVariant: true,
    category: 'educator',
  },
  {
    id: 'marietjie',
    voiceName: VoiceName.Zephyr,
    label: 'Marietjie',
    description: 'Geduldige & Sagte Mentor',
    conversationalBio: 'Kalm, bemoedigende en gerusstellende e-kursus tutor wat ingewikkelde temas maklik maak.',
    gender: 'Female',
    stylePrompt: 'Sagte, rustige, geduldige en bemoedigende Afrikaanse mentorstem met kalmerende ritme.',
    previewSampleText: {
      af: 'Moenie bekommerd wees nie; ons neem dit stap vir stap sodat jy alles rustig bemeester.',
      en: 'Take your time; we will explore each concept step by step at your own pace.',
    },
    isAfrVariant: true,
    category: 'educator',
  },
  {
    id: 'lize',
    voiceName: VoiceName.Zephyr,
    label: 'Lize',
    description: 'Kaapse Ritmiek & Gesels',
    conversationalBio: 'Warm, melodieuse en spontane Kaaps-geïnspireerde geselsstem vol kleur en karakter.',
    gender: 'Female',
    stylePrompt: 'Warm, melodieuse, gesellige en lewendige Kaapse spraakstyl met natuurlike kadens.',
    previewSampleText: {
      af: 'Aitsa! Kom ons kyk gou saam hoe maklik hierdie transkripsie eintlik werk.',
      en: "Hey there! Let's take a look at how seamless this voice-over really is.",
    },
    isAfrVariant: true,
    category: 'conversational',
  },
  {
    id: 'annelien',
    voiceName: VoiceName.Kore,
    label: 'Annelien',
    description: 'Lewendige Podsendings-Stem',
    conversationalBio: 'Moderne, energieke en boeiende inhoudskepper-stem ideaal vir videolesse.',
    gender: 'Female',
    stylePrompt: 'Lewendige, entoesiastiese en moderne podsendings-aanbieder met dinamiese klem.',
    previewSampleText: {
      af: 'Bly ingeskakel! Vandag het ons ongelooflike insigte wat jou denke gaan verander.',
      en: 'Stay tuned! Today we have fascinating takeaways that will elevate your understanding.',
    },
    isAfrVariant: true,
    category: 'storyteller',
  },
  {
    id: 'jan',
    voiceName: VoiceName.Puck,
    label: 'Jan',
    description: 'Energieke Instrukteur',
    conversationalBio: 'Spontane, lewendige en duidelike instrukteur wat energie en fokus na lesse bring.',
    gender: 'Male',
    stylePrompt: 'Spontane, duidelike, energieke en lewendige Afrikaanse dosent met praktiese selfvertroue.',
    previewSampleText: {
      af: 'Hallo span! Kom ons spring dadelik weg met die praktiese voorbeelde vir vandag.',
      en: "Hey everyone! Let's jump straight into the practical examples for today.",
    },
    isAfrVariant: true,
    category: 'educator',
  },
  {
    id: 'piet',
    voiceName: VoiceName.Charon,
    label: 'Piet',
    description: 'Diep & Gesaghebbend',
    conversationalBio: 'Resonante, kalm en gesaghebbende dokumentêre stem wat vertroue inboesem.',
    gender: 'Male',
    stylePrompt: 'Diep, resonante, gesaghebbende en rustige dokumentêre verteller met gewigtige stembuiging.',
    previewSampleText: {
      af: 'Die geskiedenis en tegnologie agter hierdie deurbraak bly werklik merkwaardig.',
      en: 'The rich foundation behind this development remains truly remarkable.',
    },
    isAfrVariant: true,
    category: 'executive',
  },
  {
    id: 'kobus',
    voiceName: VoiceName.Fenrir,
    label: 'Kobus',
    description: 'Vlot Sake & Tegnologie',
    conversationalBio: 'Vinnige, dinamiese en moderne sakestem met skerp tempo en professionele flair.',
    gender: 'Male',
    stylePrompt: 'Vinnige, dinamiese, skerp en professionele tegnologie- en sakestem met hoë akkuraatheid.',
    previewSampleText: {
      af: 'Doeltreffendheid en spoed is kardinaal in die hedendaagse digitale werkplek.',
      en: 'Efficiency and agility are paramount in the contemporary digital landscape.',
    },
    isAfrVariant: true,
    category: 'executive',
  },
  {
    id: 'danie',
    voiceName: VoiceName.Puck,
    label: 'Danie',
    description: 'Kuier & Braai Gesels',
    conversationalBio: 'Gemaklike, humoristiese en eg-Suid-Afrikaanse kuierstem vir informele stories en verduidelikings.',
    gender: 'Male',
    stylePrompt: 'Gemoedelike, humoristiese, informele en eg-Suid-Afrikaanse geselsstem vol warmte.',
    previewSampleText: {
      af: 'Man, dis so eenvoudig soos om koffie te maak om die oggendvuur. Kom luister hier.',
      en: "It really couldn't be simpler once you get the hang of it. Listen closely.",
    },
    isAfrVariant: true,
    category: 'conversational',
  },
  {
    id: 'francois',
    voiceName: VoiceName.Charon,
    label: 'Francois',
    description: 'Wyse Raadgewer & Storieverteller',
    conversationalBio: 'Ervare, rustige lewensles-instrukteur met afgemete stembuiging en diepgaande insig.',
    gender: 'Male',
    stylePrompt: 'Rustige, wyse, bepeinsende en meesleurende storieverteller met volwasse timbre.',
    previewSampleText: {
      af: 'Kennis word wysheid wanneer ons dit met begrip en toewyding in ons lewens toepas.',
      en: 'Knowledge transforms into wisdom when applied with diligence and reflection.',
    },
    isAfrVariant: true,
    category: 'storyteller',
  },

  // International Standard English Narrators
  {
    id: 'kore',
    voiceName: VoiceName.Kore,
    label: 'Kore',
    description: 'Calm & Soothing',
    conversationalBio: 'Soothing, gentle, and clear narrator ideal for meditation, wellness, or gentle instruction.',
    gender: 'Female',
    stylePrompt: 'Calm, soothing, warm, and clear educational narration.',
    previewSampleText: {
      af: 'Hallo, ek is Kore. Ek lees jou e-kursus voor met rustige en duidelike spraak.',
      en: "Hello, I'm Kore. I deliver clear and soothing voice-overs for your digital courses.",
    },
    category: 'conversational',
  },
  {
    id: 'aoede',
    voiceName: VoiceName.Aoede,
    label: 'Aoede',
    description: 'Professional & Composed',
    conversationalBio: 'Polished, corporate narrator suited for business briefings and academic modules.',
    gender: 'Female',
    stylePrompt: 'Professional, articulate, well-paced executive narrator.',
    previewSampleText: {
      af: 'Welkom. Ek is Aoede, jou professionele aanbieder vir formele opleidingsmodules.',
      en: "Welcome. I am Aoede, your executive narrator for professional learning materials.",
    },
    category: 'executive',
  },
  {
    id: 'zephyr',
    voiceName: VoiceName.Zephyr,
    label: 'Zephyr',
    description: 'Soft & Gentle',
    conversationalBio: 'Gentle, introspective tone for narrative storytelling and mindful e-learning.',
    gender: 'Female',
    stylePrompt: 'Soft, gentle, peaceful voice with subtle emotional depth.',
    previewSampleText: {
      af: "Goeiedag. Ek is Zephyr, met 'n sagte en rustige stem vir jou inhoud.",
      en: "Greetings. I'm Zephyr, providing a gentle and composed voice for your projects.",
    },
    category: 'storyteller',
  },
  {
    id: 'puck',
    voiceName: VoiceName.Puck,
    label: 'Puck',
    description: 'Energetic & Clear',
    conversationalBio: 'Bright, cheerful male voice that keeps students alert and motivated.',
    gender: 'Male',
    stylePrompt: 'Bright, cheerful, energetic, and articulate presenter.',
    previewSampleText: {
      af: 'Hallo daar! Ek is Puck, gereed om energie en lewe in jou kursus in te blaas.',
      en: "Hey there! I'm Puck, bringing vibrancy and enthusiasm to your learning modules.",
    },
    category: 'conversational',
  },
  {
    id: 'charon',
    voiceName: VoiceName.Charon,
    label: 'Charon',
    description: 'Deep & Authoritative',
    conversationalBio: 'Resonant, grounded voice conveying trust, authority, and weight.',
    gender: 'Male',
    stylePrompt: 'Deep, authoritative, reassuring, and resonant narration.',
    previewSampleText: {
      af: "Goeiedag. Ek is Charon, met 'n diep en gesaghebbende stem vir jou kursus.",
      en: "Good day. I am Charon, offering a grounded and authoritative tone for your content.",
    },
    category: 'executive',
  },
  {
    id: 'fenrir',
    voiceName: VoiceName.Fenrir,
    label: 'Fenrir',
    description: 'Fast & Dynamic',
    conversationalBio: 'Bold, punchy male narrator for high-speed technical or sprint training modules.',
    gender: 'Male',
    stylePrompt: 'Dynamic, crisp, fast-paced, and engaging speaker.',
    previewSampleText: {
      af: 'Hallo! Ek is Fenrir, vir vinnige, dinamiese en skerp stemopnames.',
      en: "Hello! I'm Fenrir, built for dynamic, crisp, and high-energy narration.",
    },
    category: 'storyteller',
  },
];

declare global {
  interface Window {
    lamejs: any;
    pdfjsLib: any;
  }
}
