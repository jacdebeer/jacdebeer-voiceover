// Slide length limits and the auto-balance that moves overflowing content on to the next slide.
//
// Why these limits: a slide becomes one voice take and one visuals generation. The server accepts up to 20 000 characters
// of text and a one-take voicing is attempted up to 18 000, so those are not the practical limit. The practical limit is
// that a long slide gives a long take (the whole slide is voiced again for every change) and a large visuals answer. A
// 518-word explanation rendered fine in testing; the limits below stay well inside that, with a margin.

export const SLIDE_LIMITS = {
  /** above this a slide is too long to produce reliably: it must be split */
  maxChars: 2400,
  maxWords: 380,
  /** a slide that is split is cut so that its parts come out about this long */
  targetChars: 1500,
  /** a leftover piece shorter than this is joined to the slide before it when the result still fits */
  minTailChars: 350,
} as const;

export type SlideLevel = 'ok' | 'long' | 'toolong';

export interface SlideSize {
  chars: number;
  words: number;
  /** about 2.6 spoken words per second */
  seconds: number;
  level: SlideLevel;
}

export const wordCountOf = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

export function slideSize(text: string): SlideSize {
  const chars = text.trim().length;
  const words = wordCountOf(text);
  const level: SlideLevel = chars > SLIDE_LIMITS.maxChars || words > SLIDE_LIMITS.maxWords ? 'toolong' : chars > SLIDE_LIMITS.targetChars * 1.25 ? 'long' : 'ok';
  return { chars, words, seconds: Math.round(words / 2.6), level };
}

const fits = (t: string) => t.length <= SLIDE_LIMITS.maxChars && wordCountOf(t) <= SLIDE_LIMITS.maxWords;

/** A short line without closing punctuation is a heading: it is kept with the paragraph that follows it. */
function isHeading(line: string): boolean {
  const t = line.trim();
  return t.length > 0 && t.length <= 90 && wordCountOf(t) <= 12 && !/[.!?…,;]$/.test(t);
}

/** Pieces no larger than the limit: sentences first, then clauses, then words. */
function breakDown(text: string): string[] {
  if (fits(text)) return [text];
  const out: string[] = [];
  const pack = (parts: string[], joiner: string) => {
    let cur = '';
    for (const p of parts) {
      const next = cur ? cur + joiner + p : p;
      if (cur && !fits(next)) { out.push(cur); cur = p; } else cur = next;
    }
    if (cur) out.push(cur);
  };
  const sentences = text.split(/(?<=[.!?…])\s+/).filter(Boolean);
  const small: string[] = [];
  for (const s of sentences) {
    if (fits(s)) small.push(s);
    else {
      const clauses = s.split(/(?<=[,;:])\s+/).filter(Boolean);
      for (const c of clauses) {
        if (fits(c)) small.push(c);
        else {
          // one unbroken stretch of text: cut it at words
          const w = c.split(/\s+/);
          let cur = '';
          for (const x of w) {
            if (cur && !fits(cur + ' ' + x)) { small.push(cur); cur = x; } else cur = cur ? cur + ' ' + x : x;
          }
          if (cur) small.push(cur);
        }
      }
    }
  }
  pack(small, ' ');
  return out;
}

interface Unit { text: string; src: number }

function unitsOf(text: string, src: number): Unit[] {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const units: Unit[] = [];
  let heading = '';
  for (const line of lines) {
    if (isHeading(line) && lines.length > 1) {
      heading = heading ? heading + '\n' + line : line;
      continue;
    }
    const body = heading ? heading + '\n' + line : line;
    heading = '';
    for (const piece of breakDown(body)) units.push({ text: piece, src });
  }
  if (heading) units.push({ text: heading, src });
  return units;
}

const sizeOf = (u: Unit[]) => u.reduce((n, x) => n + x.text.length + 1, 0);
const join = (u: Unit[]) => u.map((x) => x.text).join('\n\n');

/** How many units to keep on this slide: the prefix whose length is closest to `target` without passing the limit. */
function cut(units: Unit[], target: number): number {
  let best = 1;
  let acc = 0;
  for (let i = 0; i < units.length; i++) {
    acc += units[i].text.length + 1;
    if (i > 0 && !fits(join(units.slice(0, i + 1)))) break;
    if (Math.abs(acc - target) <= Math.abs(sizeOf(units.slice(0, best)) - target)) best = i + 1;
    if (acc >= target) break;
  }
  return best;
}

export interface BalancedSlide {
  text: string;
  /** indexes of the original slides whose content is in this slide */
  from: number[];
  /** the slide is exactly an original slide: nothing moved in or out */
  unchanged: boolean;
  /** index of that original slide when unchanged */
  original?: number;
}

/**
 * Walks the slides in order. A slide that is too long keeps the first part, cut so that the parts of the overflow come out
 * even, and the rest moves to the start of the next slide, which may overflow in turn. Whatever is left after the last
 * slide becomes new slides at the end. Headings stay with the paragraph after them, and a paragraph is only split when it
 * is longer than the limit by itself.
 */
export function balanceSlides(texts: string[]): BalancedSlide[] {
  const out: BalancedSlide[] = [];
  let carry: Unit[] = [];
  const emit = (units: Unit[], originalIndex?: number) => {
    const text = join(units);
    const from = Array.from(new Set(units.map((u) => u.src)));
    out.push({ text, from, unchanged: false, original: originalIndex });
  };
  const flush = (units: Unit[], originalIndex?: number) => {
    let rest = units;
    let first = true;
    while (rest.length) {
      if (fits(join(rest))) { emit(rest, first ? originalIndex : undefined); return; }
      const parts = Math.max(2, Math.ceil(Math.max(sizeOf(rest) / SLIDE_LIMITS.maxChars, wordCountOf(join(rest)) / SLIDE_LIMITS.maxWords)));
      const n = cut(rest, sizeOf(rest) / parts);
      emit(rest.slice(0, n), first ? originalIndex : undefined);
      rest = rest.slice(n);
      first = false;
      if (originalIndex !== undefined) { carry = rest; return; } // the rest goes to the next slide
    }
  };
  texts.forEach((t, i) => {
    // nothing moved in and it fits: the slide stays exactly as the user wrote it
    if (!carry.length && fits(t)) { out.push({ text: t, from: [i], unchanged: true, original: i }); return; }
    const units = carry.concat(unitsOf(t, i));
    carry = [];
    if (!units.length) { out.push({ text: '', from: [i], unchanged: true, original: i }); return; }
    flush(units, i);
  });
  while (carry.length) {
    const units = carry;
    carry = [];
    flush(units, undefined);
  }
  // a tiny last piece joins the slide before it when the two still fit
  while (out.length > 1) {
    const last = out[out.length - 1];
    const prev = out[out.length - 2];
    if (last.original === undefined && last.text.length < SLIDE_LIMITS.minTailChars && fits(prev.text + '\n\n' + last.text)) {
      out.splice(out.length - 2, 2, { text: prev.text + '\n\n' + last.text, from: Array.from(new Set(prev.from.concat(last.from))), unchanged: false, original: prev.original });
    } else break;
  }
  return out;
}

/** A plain summary for the confirmation dialog. */
export function describeBalance(texts: string[], result: BalancedSlide[]) {
  return {
    before: texts.length,
    after: result.length,
    tooLongBefore: texts.filter((t) => slideSize(t).level === 'toolong').length,
    tooLongAfter: result.filter((r) => slideSize(r.text).level === 'toolong').length,
    changed: result.filter((r) => !r.unchanged).length,
  };
}
