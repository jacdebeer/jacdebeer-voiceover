/**
 * Decodes a base64 string into a Uint8Array of bytes.
 */
export function decodeBase64(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Encodes a Float32Array (audio buffer) into 16-bit PCM base64 string at 16kHz for Live API.
 */
export function pcmFloat32ToBase64(float32Array: Float32Array): string {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  
  let binary = '';
  const bytes = new Uint8Array(int16Array.buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Converts a base64 audio response to a playable WAV Blob.
 * Handles both already-wrapped WAV files (with RIFF header) and raw PCM.
 */
export function base64ToWavBlob(base64: string, sampleRate: number = 24000): Blob {
  const bytes = decodeBase64(base64);
  // Check if starts with 'RIFF'
  if (bytes.length > 4 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
    return new Blob([bytes as any], { type: 'audio/wav' });
  }
  return pcmToWavBlob(bytes, sampleRate);
}

/**
 * Decodes raw PCM data into an AudioBuffer.
 */
export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

/**
 * Converts raw PCM data (Int16) to MP3 Blob using lamejs.
 */
export function convertPcmToMp3(pcmData: Uint8Array, sampleRate: number): Blob {
  if (!window.lamejs) {
    throw new Error("lamejs library not loaded");
  }

  const samples = new Int16Array(pcmData.buffer);
  const encoder = new window.lamejs.Mp3Encoder(1, sampleRate, 128);
  const mp3Data: Int8Array[] = [];
  
  const mp3buf = encoder.encodeBuffer(samples);
  if (mp3buf.length > 0) {
    mp3Data.push(mp3buf);
  }
  
  const endBuf = encoder.flush();
  if (endBuf.length > 0) {
    mp3Data.push(endBuf);
  }
  
  return new Blob(mp3Data, { type: 'audio/mp3' });
}

/**
 * Wraps raw PCM data in a WAV container for native playback.
 */
export function pcmToWavBlob(pcmData: Uint8Array, sampleRate: number = 24000, numChannels: number = 1): Blob {
  const bytesPerSample = 2; // 16-bit
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcmData.length;
  const fileSize = 36 + dataSize;

  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF identifier
  writeString(view, 0, 'RIFF');
  // file length
  view.setUint32(4, fileSize, true);
  // RIFF type
  writeString(view, 8, 'WAVE');
  // format chunk identifier
  writeString(view, 12, 'fmt ');
  // format chunk length
  view.setUint32(16, 16, true);
  // sample format (1 is PCM)
  view.setUint16(20, 1, true);
  // channel count
  view.setUint16(22, numChannels, true);
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate
  view.setUint32(28, byteRate, true);
  // block align
  view.setUint16(32, blockAlign, true);
  // bits per sample
  view.setUint16(34, 16, true);
  // data chunk identifier
  writeString(view, 36, 'data');
  // data chunk length
  view.setUint32(40, dataSize, true);

  // Copy PCM data
  const pcmBytes = new Uint8Array(buffer, 44);
  pcmBytes.set(pcmData);

  return new Blob([buffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * High-reliability browser Web Speech fallback for when API quota is exhausted.
 */
export function speakWithWebSpeech(
  text: string,
  language: 'af' | 'en',
  gender?: 'Male' | 'Female',
  rate: number = 1.0,
  onStart?: () => void,
  onEnd?: () => void
): boolean {
  if (typeof window === 'undefined' || !window.speechSynthesis) return false;

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = rate;
  utterance.pitch = gender === 'Female' ? 1.05 : 0.95;
  utterance.lang = language === 'af' ? 'af-ZA' : 'en-US';

  const voices = window.speechSynthesis.getVoices();
  const targetPrefix = language === 'af' ? 'af' : 'en';
  const matchingVoice = voices.find(v => v.lang.toLowerCase().startsWith(targetPrefix)) || voices[0];
  if (matchingVoice) utterance.voice = matchingVoice;

  if (onStart) utterance.onstart = onStart;
  if (onEnd) utterance.onend = onEnd;
  utterance.onerror = () => onEnd?.();

  window.speechSynthesis.speak(utterance);
  return true;
}

export function stopWebSpeech() {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}
