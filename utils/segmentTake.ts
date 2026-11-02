// A slide is voiced in ONE take, so the voice, accent, tone, volume and pace cannot drift between lines.
// This cuts that take back into the spoken lines, so each visual still appears with its own line.
//
// How: find the silent gaps. Each line should hold about as much speech as it has letters (speech time is measured
// between pauses, so a colon or comma pause inside a line does not matter). A small dynamic program picks, for every
// line, the pair of gaps that best fits that, and it prefers long pauses at line ends.

const SAMPLE_RATE = 24000;
const FRAME = SAMPLE_RATE / 100; // 10 ms
const MIN_GAP_FRAMES = 9; // gaps of 90 ms or more are found
const MIN_CUT_FRAMES = 12; // a line may only end in a gap of 120 ms or more

export interface TakeSplit {
  segments: Uint8Array[]; // 16-bit PCM, one per line, cut in the middle of the pause
  /** 0..1. Low means the split is not trustworthy and the lines should be voiced one by one instead. */
  confidence: number;
  detail: string;
}

const letters = (t: string) => Math.max(1, t.replace(/[^\p{L}\p{N}]/gu, '').length);

export function splitTake(pcm: Uint8Array, lines: string[]): TakeSplit {
  const n = Math.floor(pcm.length / 2);
  const L = lines.length;
  if (L === 1) return { segments: [pcm], confidence: 1, detail: 'single line' };
  const v = new DataView(pcm.buffer, pcm.byteOffset, n * 2);
  const nf = Math.floor(n / FRAME);
  const rms = new Float32Array(nf);
  for (let f = 0; f < nf; f++) {
    let sq = 0;
    for (let i = f * FRAME; i < (f + 1) * FRAME; i++) {
      const x = v.getInt16(i * 2, true);
      sq += x * x;
    }
    rms[f] = Math.sqrt(sq / FRAME);
  }
  const sorted = Array.from(rms).sort((a, b) => a - b);
  const threshold = Math.max(sorted[Math.floor(nf * 0.9)] * 0.05, 15);
  const silent = Array.from(rms, (r) => r < threshold);

  const active = new Int32Array(nf + 1); // prefix count of speech frames
  for (let f = 0; f < nf; f++) active[f + 1] = active[f] + (silent[f] ? 0 : 1);
  let a0 = 0;
  while (a0 < nf && silent[a0]) a0++;
  let a1 = nf;
  while (a1 > a0 && silent[a1 - 1]) a1--;
  if (a1 - a0 < L * 20) return { segments: [], confidence: 0, detail: 'take is too short for its text' };

  const gaps: [number, number][] = [];
  for (let f = a0; f < a1; ) {
    if (!silent[f]) {
      f++;
      continue;
    }
    let g = f;
    while (g < a1 && silent[g]) g++;
    if (g - f >= MIN_GAP_FRAMES && g - f >= MIN_CUT_FRAMES) gaps.push([f, g]);
    f = g;
  }
  const M = gaps.length;
  if (M < L - 1) return { segments: [], confidence: 0, detail: `found ${M} pauses for ${L} lines` };

  const lt = lines.map(letters);
  const r = (active[a1] - active[a0]) / lt.reduce((a, b) => a + b, 0); // speech frames per letter
  const actBetween = (j: number, k: number) => {
    const s = j < 0 ? a0 : gaps[j][1];
    const e = k >= M ? a1 : gaps[k][0];
    return active[e] - active[s];
  };
  const lineCost = (i: number, j: number, k: number) => {
    const exp = lt[i] * r;
    const got = actBetween(j, k);
    const c = ((got - exp) / (0.22 * exp + 30)) ** 2;
    return k < M ? c - 1.5 * Math.log((gaps[k][1] - gaps[k][0]) / 10) : c;
  };

  const INF = 1e18;
  const best: number[][] = Array.from({ length: L }, () => new Array(M + 1).fill(INF));
  const back: number[][] = Array.from({ length: L }, () => new Array(M + 1).fill(-1));
  for (let k = 0; k < M; k++) best[0][k] = lineCost(0, -1, k);
  for (let i = 1; i < L; i++) {
    for (let k = 0; k <= M; k++) {
      if (i < L - 1 && k >= M) continue;
      if (i === L - 1 && k !== M) continue;
      for (let j = 0; j < k; j++) {
        if (best[i - 1][j] >= INF) continue;
        const val = best[i - 1][j] + lineCost(i, j, k);
        if (val < best[i][k]) {
          best[i][k] = val;
          back[i][k] = j;
        }
      }
    }
  }
  if (best[L - 1][M] >= INF) return { segments: [], confidence: 0, detail: 'no split fits' };
  const path: number[] = [M];
  for (let i = L - 1, k = M; i > 0; i--) {
    k = back[i][k];
    path.push(k);
  }
  path.reverse(); // path[i] = the gap that ends line i (M means the end of the take)

  const segments: Uint8Array[] = [];
  let worst = 0;
  let minGapMs = Infinity;
  let prev = -1;
  for (let i = 0; i < L; i++) {
    const k = path[i];
    const s = prev < 0 ? a0 : Math.floor((gaps[prev][0] + gaps[prev][1]) / 2);
    const e = k >= M ? a1 : Math.floor((gaps[k][0] + gaps[k][1]) / 2);
    const dev = Math.abs(actBetween(prev, k) / (lt[i] * r) - 1);
    worst = Math.max(worst, dev);
    if (k < M) minGapMs = Math.min(minGapMs, (gaps[k][1] - gaps[k][0]) * 10);
    segments.push(pcm.slice(s * FRAME * 2, Math.min(n, e * FRAME) * 2));
    prev = k;
  }
  // every line should hold about as much speech as its letters suggest; a big miss means the cuts are probably wrong
  const confidence = Math.max(0, Math.min(1, 1 - Math.max(0, worst - 0.25) / 0.5));
  return {
    segments,
    confidence,
    detail: `worst line is ${(worst * 100).toFixed(0)}% off its expected speech time; shortest line-end pause ${Number.isFinite(minGapMs) ? minGapMs.toFixed(0) : '-'} ms`,
  };
}

/** Fade the edges of a cut line and add a little silence, so playing the lines one after another never clicks. */
export function finishSegment(pcm: Uint8Array): Uint8Array {
  const n = Math.floor(pcm.length / 2);
  const lead = Math.round(SAMPLE_RATE * 0.04);
  const tail = Math.round(SAMPLE_RATE * 0.2);
  const out = new Uint8Array((n + lead + tail) * 2);
  const src = new DataView(pcm.buffer, pcm.byteOffset, n * 2);
  const dst = new DataView(out.buffer);
  const fin = Math.min(n, Math.round(SAMPLE_RATE * 0.006));
  const fout = Math.min(n, Math.round(SAMPLE_RATE * 0.02));
  for (let i = 0; i < n; i++) {
    let g = 1;
    if (i < fin) g = i / fin;
    if (i >= n - fout) g = Math.min(g, (n - 1 - i) / fout);
    dst.setInt16((lead + i) * 2, Math.round(src.getInt16(i * 2, true) * g), true);
  }
  return out;
}
