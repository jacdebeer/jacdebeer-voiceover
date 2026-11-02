// Slide visuals: shared prompt-building for the queue (api.mts) and the worker (visuals-background.mts).
// @ts-ignore - plain JS module ported from GSA-accounts-explainer
import { SYSTEM, RECORDING_RULES, LEDGER_RULE, LEVEL_GUIDES } from './lessonPrompt.mjs';

export const VISUALS_STORE = 'visual-jobs';
export const VISUALS_MODEL = 'claude-haiku-5-5';
export const VISUALS_MAX_OUTPUT_TOKENS = 32000;

export const LEVELS = ['g8', 'g9', 'g10', 'g11', 'g12', 'univ'] as const;
export type Level = (typeof LEVELS)[number];

// The slide text is the finished voice-over script. The visuals must follow it, never the other way round.
const SLIDE_TEXT_RULE = [
  '',
  'H. SLIDE-TEXT MODE (overrides F and G where they conflict).',
  '   The user message contains the exact voice-over script of ONE slide. Build the visuals that illustrate it.',
  '   - Do not translate, reword, shorten, extend or reorder the script.',
  '   - "caption" and every "narration" entry must be sentences copied character-for-character from the script. Reading each beat\'s caption and then its narration entries, beat by beat, must reproduce the whole script in its original order, with nothing added and nothing left out.',
  '   - Keep one "narration" entry per revealed line of the beat. Where no script sentence belongs to a revealed line, use an empty string "".',
  '   - Use as many beats as the script needs (1 to 7). Do not add a beat that has no script sentence behind it.',
  '   - Use ONLY the figures, names, dates and document numbers given in the script (rule E0). Put numbers in the blocks exactly as the script states them.',
  '   - Omit "quiz" entirely: it would be silent.',
].join('\n');

export function buildSystem(): string {
  return SYSTEM + '\n' + SLIDE_TEXT_RULE;
}

export function buildUserText(opts: { text: string; lang: 'en' | 'af'; level: Level; currency: string }): string {
  const langName = opts.lang === 'af' ? 'Afrikaans' : 'English';
  const guide = (LEVEL_GUIDES as Record<string, string>)[opts.level];
  return (
    'Slide script (voice-over text, use verbatim):\n' + opts.text +
    '\n\nCurrency symbol: ' + opts.currency +
    '\nThe script is in ' + langName + '. Write every label, title and explanation in ' + langName + ' too.' +
    (opts.lang === 'af' ? ' Use South African Afrikaans accounting terminology.' : '') +
    (guide ? '\n\nAudience guide:\n' + guide : '') +
    '\n\n' + RECORDING_RULES +
    '\n\n' + LEDGER_RULE +
    '\nReturn the JSON object only.'
  );
}
