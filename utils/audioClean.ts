const SAMPLE_RATE = 24000;
const FRAME = SAMPLE_RATE / 100; // 10 ms analysis frames
const HIGH_PASS_HZ = 70; // removes DC offset and low thumps that click at clip edges
const MERGE_GAP_FRAMES = 15; // gaps shorter than 150 ms are part of the same phrase
const MIN_SEGMENT_FRAMES = 12; // an isolated sound shorter than 120 ms is treated as noise
const LEAD_MS = 30;
const FADE_IN_MS = 10;
const FADE_OUT_MS = 40;
const TAIL_SILENCE_MS = 200;

/**
 * Each line is its own clip, and clips can start or end with a click, a thump or a short burst of noise.
 * Clean each one: high-pass filter, drop isolated bursts before or after the speech, fade the edges,
 * and finish with a little silence so the next line starts clean.
 */
export function cleanClip(pcm: Uint8Array): Uint8Array {
  const n = Math.floor(pcm.length / 2);
  if (n < FRAME * 3) return pcm;
  const src = new DataView(pcm.buffer, pcm.byteOffset, n * 2);

  // 1. high-pass (one pole)
  const rc = 1 / (2 * Math.PI * HIGH_PASS_HZ);
  const a = rc / (rc + 1 / SAMPLE_RATE);
  const x = new Float32Array(n);
  let prevIn = 0;
  let prevOut = 0;
  for (let i = 0; i < n; i++) {
    const v = src.getInt16(i * 2, true);
    prevOut = a * (prevOut + v - prevIn);
    prevIn = v;
    x[i] = prevOut;
  }

  // 2. energy per 10 ms frame
  const frames = Math.floor(n / FRAME);
  const rms = new Float32Array(frames);
  let peak = 0;
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let i = f * FRAME; i < (f + 1) * FRAME; i++) sum += x[i] * x[i];
    rms[f] = Math.sqrt(sum / FRAME);
    if (rms[f] > peak) peak = rms[f];
  }
  const threshold = Math.max(peak * 0.04, 30);

  // 3. group active frames into segments (small gaps are joined)
  const segs: [number, number][] = [];
  for (let f = 0; f < frames; f++) {
    if (rms[f] <= threshold) continue;
    const last = segs[segs.length - 1];
    if (last && f - last[1] <= MERGE_GAP_FRAMES) last[1] = f;
    else segs.push([f, f]);
  }
  // 4. keep everything from the first to the last real segment; isolated short ones at either end are noise
  let lo = 0;
  let hi = segs.length - 1;
  while (lo < hi && segs[lo][1] - segs[lo][0] + 1 < MIN_SEGMENT_FRAMES) lo++;
  while (hi > lo && segs[hi][1] - segs[hi][0] + 1 < MIN_SEGMENT_FRAMES) hi--;
  if (!segs.length) return pcm;

  const lead = Math.round((SAMPLE_RATE * LEAD_MS) / 1000);
  const startSample = Math.max(0, segs[lo][0] * FRAME - lead);
  const endSample = Math.min(n, (segs[hi][1] + 1) * FRAME + lead * 2);
  const len = endSample - startSample;

  // 5. fade the edges and add trailing silence
  const tail = Math.round((SAMPLE_RATE * TAIL_SILENCE_MS) / 1000);
  const out = new Uint8Array((len + tail) * 2);
  const dst = new DataView(out.buffer);
  const fin = Math.min(len, Math.round((SAMPLE_RATE * FADE_IN_MS) / 1000));
  const fout = Math.min(len, Math.round((SAMPLE_RATE * FADE_OUT_MS) / 1000));
  for (let i = 0; i < len; i++) {
    let gain = 1;
    if (i < fin) gain = i / fin;
    if (i >= len - fout) gain = Math.min(gain, (len - 1 - i) / fout);
    const v = Math.max(-32768, Math.min(32767, Math.round(x[startSample + i] * gain)));
    dst.setInt16(i * 2, v, true);
  }
  return out;
}

/**
 * Gemini TTS audio comes back with junk at both ends: a few garbage samples at the very start, and a burst of
 * full-scale noise (about 100 to 130 ms, large DC offset) after the last word. Cut both.
 * Measured on a real clip: first 8 samples were garbage; the last 127 ms was noise at rms ~17000 against
 * speech that never has a mean far from zero.
 */
export function stripArtifacts(pcm: Uint8Array): Uint8Array {
  const n = Math.floor(pcm.length / 2);
  const frames = Math.floor(n / FRAME);
  if (frames < 10) return pcm;
  const v = new DataView(pcm.buffer, pcm.byteOffset, n * 2);

  const rms = new Float32Array(frames);
  const mean = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    let sq = 0;
    for (let i = f * FRAME; i < (f + 1) * FRAME; i++) {
      const s = v.getInt16(i * 2, true);
      sum += s;
      sq += s * s;
    }
    mean[f] = sum / FRAME;
    rms[f] = Math.sqrt(sq / FRAME);
  }

  // tail: walk back over frames that are loud with a large DC offset (speech is centred on zero)
  let end = n;
  let f = frames - 1;
  while (f > 0 && rms[f] > 2000 && Math.abs(mean[f]) > 0.15 * rms[f]) f--;
  if (f < frames - 1) end = (f + 1) * FRAME;

  // head: a loud frame followed by near silence is a click, not speech
  let start = 0;
  let k = 0;
  while (k < 5 && rms[k] > 2000 && rms[k + 1] < 100) k++;
  start = k * FRAME;

  if (start === 0 && end === n) return pcm;
  return pcm.slice(start * 2, end * 2);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
