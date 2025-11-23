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