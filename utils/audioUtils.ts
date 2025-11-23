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
 * Decodes raw PCM data into an AudioBuffer.
 * Gemini 2.5 Flash TTS typically returns 24kHz audio.
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
      // Convert Int16 PCM to Float32 (-1.0 to 1.0)
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

  // Create Int16Array from the Uint8Array buffer
  const samples = new Int16Array(pcmData.buffer);
  
  // Initialize encoder: 1 channel, sampleRate, 128kbps
  // Access Mp3Encoder from the global window.lamejs object
  const encoder = new window.lamejs.Mp3Encoder(1, sampleRate, 128);
  
  const mp3Data: Int8Array[] = [];
  
  // Encode
  const mp3buf = encoder.encodeBuffer(samples);
  if (mp3buf.length > 0) {
    mp3Data.push(mp3buf);
  }
  
  // Flush
  const endBuf = encoder.flush();
  if (endBuf.length > 0) {
    mp3Data.push(endBuf);
  }
  
  return new Blob(mp3Data, { type: 'audio/mp3' });
}

/**
 * Wraps raw PCM data in a WAV container for native playback.
 * This allows using HTMLAudioElement which supports high-quality time stretching (preservesPitch).
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
  // byte rate (sample rate * block align)
  view.setUint32(28, byteRate, true);
  // block align (channel count * bytes per sample)
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