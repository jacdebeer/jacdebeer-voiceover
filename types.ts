export enum VoiceName {
  Kore = 'Kore',
  Puck = 'Puck',
  Charon = 'Charon',
  Fenrir = 'Fenrir',
  Zephyr = 'Zephyr',
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

export const VOICE_OPTIONS: VoiceOption[] = [
  { id: VoiceName.Kore, label: 'Kore', description: 'Calm & Soothing', gender: 'Female' },
  { id: VoiceName.Puck, label: 'Puck', description: 'Energetic & Clear', gender: 'Male' },
  { id: VoiceName.Charon, label: 'Charon', description: 'Deep & Authoritative', gender: 'Male' },
  { id: VoiceName.Fenrir, label: 'Fenrir', description: 'Fast & Dynamic', gender: 'Male' },
  { id: VoiceName.Zephyr, label: 'Zephyr', description: 'Soft & Gentle', gender: 'Female' },
];

declare global {
  interface Window {
    lamejs: any;
  }
}