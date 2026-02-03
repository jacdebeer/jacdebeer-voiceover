
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

export interface VoiceOption {
  id: string; // Unique identifier for the selection UI
  voiceName: VoiceName; // The actual prebuilt voice name for the API
  label: string;
  description: string;
  gender: 'Male' | 'Female';
  isAfrVariant?: boolean;
}

export interface CoursePage {
  id: number;
  text: string;
  audioData?: Uint8Array; // Cache raw PCM data
  duration?: number;
}

// 12 Options: 6 International/Default, 6 Specifically branded as Afrikaans
export const VOICE_OPTIONS: VoiceOption[] = [
  // Original Set
  { id: 'kore', voiceName: VoiceName.Kore, label: 'Kore', description: 'Calm & Soothing', gender: 'Female' },
  { id: 'aoede', voiceName: VoiceName.Aoede, label: 'Aoede', description: 'Professional & Composed', gender: 'Female' },
  { id: 'zephyr', voiceName: VoiceName.Zephyr, label: 'Zephyr', description: 'Soft & Gentle', gender: 'Female' },
  { id: 'puck', voiceName: VoiceName.Puck, label: 'Puck', description: 'Energetic & Clear', gender: 'Male' },
  { id: 'charon', voiceName: VoiceName.Charon, label: 'Charon', description: 'Deep & Authoritative', gender: 'Male' },
  { id: 'fenrir', voiceName: VoiceName.Fenrir, label: 'Fenrir', description: 'Fast & Dynamic', gender: 'Male' },
  
  // Afrikaans Specific Variants (Using the same engines but described for AF)
  { id: 'sannie', voiceName: VoiceName.Kore, label: 'Sannie', description: 'Vriendelik & Helder', gender: 'Female', isAfrVariant: true },
  { id: 'elsabe', voiceName: VoiceName.Aoede, label: 'Elsabé', description: 'Professioneel & Formeel', gender: 'Female', isAfrVariant: true },
  { id: 'marietjie', voiceName: VoiceName.Zephyr, label: 'Marietjie', description: 'Sag & Rustig', gender: 'Female', isAfrVariant: true },
  { id: 'jan', voiceName: VoiceName.Puck, label: 'Jan', description: 'Sterk & Duidelik', gender: 'Male', isAfrVariant: true },
  { id: 'piet', voiceName: VoiceName.Charon, label: 'Piet', description: 'Diep & Gesaghebbend', gender: 'Male', isAfrVariant: true },
  { id: 'kobus', voiceName: VoiceName.Fenrir, label: 'Kobus', description: 'Kragtig & Dinamies', gender: 'Male', isAfrVariant: true },
];

declare global {
  interface Window {
    lamejs: any;
    pdfjsLib: any;
  }
}
