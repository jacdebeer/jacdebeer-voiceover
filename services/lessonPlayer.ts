import playerCss from '../lesson-player/player.css?raw';
import playerBody from '../lesson-player/player-body.html?raw';
import playerJs from '../lesson-player/player.js?raw';

/** Lesson data produced by the model (see netlify/lib/lessonPrompt.mjs for the schema). */
export interface LessonData {
  lang?: string;
  title?: string;
  currency?: string;
  beats?: { title?: string; caption?: string; narration?: string[]; [k: string]: unknown }[];
  [k: string]: unknown;
}

/** Every line the player speaks, in order, without blanks or repeats of the same text. */
export function spokenLines(data: LessonData): string[] {
  const out: string[] = [];
  for (const b of data.beats ?? []) {
    for (const t of [b.caption, ...(b.narration ?? [])]) {
      const line = typeof t === 'string' ? t.trim() : '';
      if (line) out.push(line);
    }
  }
  return out;
}

const words = (s: string) => s.split(/\s+/).filter(Boolean);

/**
 * The slide text is the script, so the spoken lines must reproduce it word for word, in order.
 * Returns ok=true when they do; otherwise says where they first differ.
 */
export function checkScript(data: LessonData, slideText: string): { ok: boolean; detail: string } {
  const want = words(slideText);
  const got = words(spokenLines(data).join(' '));
  const n = Math.min(want.length, got.length);
  for (let i = 0; i < n; i++) {
    if (want[i] !== got[i]) {
      return { ok: false, detail: `Word ${i + 1} differs: slide has "${want[i]}", visuals speak "${got[i]}".` };
    }
  }
  if (want.length !== got.length) {
    return {
      ok: false,
      detail: got.length < want.length
        ? `The visuals leave out the last ${want.length - got.length} word(s) of the slide.`
        : `The visuals add ${got.length - want.length} word(s) that are not on the slide.`,
    };
  }
  return { ok: true, detail: 'Every spoken line matches the slide text.' };
}

/**
 * Builds the standalone player page.
 * audio maps the exact line text to a data: URI, so the visuals reveal in step with the voice.
 */
export function buildPlayerHtml(data: LessonData, audio: Record<string, string>): string {
  const safe = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c');
  const lesson = { ...data, embeddedAudioOnly: true };
  const title = String(data.title || 'Explainer').replace(/[<>&"]/g, '');
  return (
    `<!DOCTYPE html><html lang="${data.lang === 'af' ? 'af' : 'en'}"><head><meta charset="UTF-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title}</title>` +
    `<style>${playerCss}</style></head><body>${playerBody}` +
    `<script id="narrationAudio" type="application/json">${safe(audio)}</script>` +
    `<script id="lessonData" type="application/json">${safe(lesson)}</script>` +
    `<script>${playerJs.replace(/<\/script/gi, '<\\/script')}</script></body></html>`
  );
}
