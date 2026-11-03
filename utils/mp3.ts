import { Mp3Encoder } from '@breezystack/lamejs';

const SAMPLE_RATE = 24000;
const KBPS = 56; // speech: about 7x smaller than WAV, SNR around 22 dB on a real clip

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/** 16-bit mono 24 kHz PCM to MP3. Yields to the page now and then so a long lesson does not freeze the window. */
export async function pcmToMp3(pcm: Uint8Array): Promise<Uint8Array> {
  const samples = new Int16Array(pcm.length >> 1);
  const view = new DataView(pcm.buffer, pcm.byteOffset, samples.length * 2);
  for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true);

  const enc = new Mp3Encoder(1, SAMPLE_RATE, KBPS);
  const parts: Uint8Array[] = [];
  const block = 1152 * 20;
  for (let i = 0, n = 0; i < samples.length; i += block, n++) {
    const chunk = enc.encodeBuffer(samples.subarray(i, i + block));
    if (chunk.length) parts.push(new Uint8Array(chunk));
    if (n % 25 === 24) await tick();
  }
  const tail = enc.flush();
  if (tail.length) parts.push(new Uint8Array(tail));
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
