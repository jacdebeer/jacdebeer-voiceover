// Length of the finished presentation: how many seconds of narration each explained slide gets, and the instruction that tells the model
// how much to write and how deep to go. Used by the browser (the slider) and by the server (the prompt).

/** Assumed speaking rate of the narrators. A guess, not a measurement: the studio shows the real length after the voice is made. */
export const WORDS_PER_MINUTE = 140;
/** One sentence is the least a slide can carry. */
export const MIN_SLIDE_SECONDS = 10;
/** A slide is voiced as one take and its text is limited (about 380 words), so one slide cannot run longer than this. */
export const MAX_SLIDE_SECONDS = 150;
export const MIN_TOTAL_MINUTES = 1;
export const MAX_TOTAL_MINUTES = 30;

export const wordsForSeconds = (sec) => Math.round((sec * WORDS_PER_MINUTE) / 60);
export const secondsForWords = (words) => (words * 60) / WORDS_PER_MINUTE;

/**
 * Shares the total length out over the slides. `items` are the slides that will be produced, in order:
 *   { explain: true, weight }   gets a share of the time, between MIN_SLIDE_SECONDS and MAX_SLIDE_SECONDS
 *   { explain: false, fixed }   is read as written, so its length is fixed (seconds)
 * Returns { seconds: number[] (explained slides; fixed ones keep their length), achievable: {min, max}, total, limited: 'min' | 'max' | null }.
 */
export function planLength(totalSeconds, items) {
  const fixed = items.reduce((a, it) => a + (it.explain ? 0 : it.fixed || 0), 0);
  const ex = items.map((it, i) => ({ i, w: Math.max(0.1, it.weight || 1) })).filter((_, k) => items[k].explain);
  const min = fixed + ex.length * MIN_SLIDE_SECONDS;
  const max = fixed + ex.length * MAX_SLIDE_SECONDS;
  const seconds = items.map((it) => (it.explain ? 0 : it.fixed || 0));
  if (!ex.length) return { seconds, achievable: { min, max }, total: fixed, limited: null };

  let budget = Math.min(Math.max(totalSeconds, min), max) - fixed;
  let open = ex.slice();
  // water-filling: slides whose share falls outside the limits are pinned there and the rest share what is left
  for (let guard = 0; guard < 50 && open.length; guard++) {
    const wSum = open.reduce((a, o) => a + o.w, 0);
    let pinned = false;
    for (const o of open.slice()) {
      const share = (budget * o.w) / wSum;
      if (share < MIN_SLIDE_SECONDS || share > MAX_SLIDE_SECONDS) {
        const v = share < MIN_SLIDE_SECONDS ? MIN_SLIDE_SECONDS : MAX_SLIDE_SECONDS;
        seconds[o.i] = v; budget -= v; open = open.filter((x) => x !== o); pinned = true;
        break; // recompute the shares after each pin
      }
    }
    if (!pinned) { const wS = open.reduce((a, o) => a + o.w, 0); for (const o of open) seconds[o.i] = (budget * o.w) / wS; open = []; }
  }
  for (const o of ex) seconds[o.i] = Math.round(seconds[o.i]);
  const total = seconds.reduce((a, b) => a + b, 0);
  return { seconds, achievable: { min, max }, total, limited: totalSeconds < min - 0.5 ? 'min' : totalSeconds > max + 0.5 ? 'max' : null };
}

/** Rule L, added to the request of one explained slide. */
export function lengthBlock(sec, totalMinutes, slideCount) {
  const s = Math.max(MIN_SLIDE_SECONDS, Math.min(MAX_SLIDE_SECONDS, Math.round(sec)));
  const words = wordsForSeconds(s);
  const lo = Math.max(8, Math.round(words * 0.85));
  const hi = Math.round(words * 1.15);
  let depth;
  if (s <= 20) depth = 'ONE beat. Name each point of the outline in one short sentence and give the single idea behind it. No worked example and no story. A "narration" entry may cover several revealed elements; keep the screen very simple.';
  else if (s <= 45) depth = '1 or 2 beats. Say what each point means in a sentence or two. At most a one-line example; no full worked example. Keep the account drawings (rule K) but with one simple entry each.';
  else if (s <= 90) depth = '2 to 4 beats. Define each point, say briefly why it matters, and give ONE small worked example (one journal entry with its T-accounts). Finish with a one-sentence summary.';
  else if (s <= 125) depth = '4 to 6 beats. Define each point, explain why it matters and how it works, give ONE complete worked example following the accounting cycle (source document, journal, ledger, equation), then a short summary.';
  else depth = '5 to 8 beats. Teach each point fully: definition, why it matters, how it works, ONE complete worked example following the whole accounting cycle, a second shorter example or a contrast with a similar case, common mistakes, then a summary.';
  return [
    'L. LENGTH TARGET (overrides the length in rule H). This slide is one of ' + slideCount + ' in a presentation of about ' + totalMinutes + ' minute' + (totalMinutes === 1 ? '' : 's') + '. This slide gets about ' + s + ' seconds of narration.',
    '   - The whole voice-over (caption and every narration entry together) must be between ' + lo + ' and ' + hi + ' words. Count them before you answer.',
    '   - Depth: ' + depth,
    '   - Cover every point of the outline whatever the length. A shorter slide says less about each point, never skips a point. A longer slide adds depth and examples, never filler or repetition.',
  ].join('\n');
}

export const fmtSeconds = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
