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
  id: VoiceName;
  label: string;
  description: string;
  gender: 'Male' | 'Female';
}

export interface CoursePage {
  id: number;
  text: string;
  audioData?: Uint8Array; // Cache raw PCM data
  duration?: number;
}

export const VOICE_OPTIONS: VoiceOption[] = [
  { id: VoiceName.Kore, label: 'Kore', description: 'Calm & Soothing', gender: 'Female' },
  { id: VoiceName.Aoede, label: 'Aoede', description: 'Professional & Composed', gender: 'Female' },
  { id: VoiceName.Zephyr, label: 'Zephyr', description: 'Soft & Gentle', gender: 'Female' },
  { id: VoiceName.Puck, label: 'Puck', description: 'Energetic & Clear', gender: 'Male' },
  { id: VoiceName.Charon, label: 'Charon', description: 'Deep & Authoritative', gender: 'Male' },
  { id: VoiceName.Fenrir, label: 'Fenrir', description: 'Fast & Dynamic', gender: 'Male' },
];

declare global {
  interface Window {
    lamejs: any;
    pdfjsLib: any;
  }
}