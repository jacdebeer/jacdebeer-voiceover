// Slide visuals: shared prompt-building for the queue (api.mts) and the worker (visuals-background.mts).
// @ts-ignore - plain JS module ported from GSA-accounts-explainer
import { SYSTEM, RECORDING_RULES, LEDGER_RULE, LEVEL_GUIDES } from './lessonPrompt.mjs';
// @ts-ignore - plain JS module
import { afrikaansGlossaryPrompt } from './afrikaansTerms.mjs';

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
  '   - NEVER SAY A SENTENCE TWICE. Each sentence of the script appears exactly once in the whole lesson: in a beat\'s "caption" OR in one of its "narration" entries, never in both, never in two beats. If a beat has a single script sentence, make it the caption and leave every narration entry as "". Do not split a sentence into pieces and also keep it whole.',
  '   - Keep one "narration" entry per revealed line of the beat. Where no script sentence belongs to a revealed line, use an empty string "".',
  '   - Use as many beats as the script needs (1 to 7). Do not add a beat that has no script sentence behind it.',
  '   - Use ONLY the figures, names, dates and document numbers given in the script (rule E0). Put numbers in the blocks exactly as the script states them.',
  '   - Omit "quiz" entirely: it would be silent.',
  '   - VISUALS MUST CARRY THE LESSON. Every beat needs at least one visual block that is not "text". Use "text" only for one short rule or note. When the slide explains a concept and gives no amounts, still draw it: "formula" for an equation (for example Bates = Eienaarsbelang + Laste), "cards" for categories or definitions, "change" for what goes up or down, "flow" for steps, "equation" or "t_accounts" when the slide gives figures.',
  '   - Everything on screen is revealed one element at a time, in step with the voice. Aim for one narration entry per revealed element (each formula part, card, change item, flow step, table row), and keep each beat to 2 to 5 revealed elements so the pace stays watchable.',
].join('\n');

// Emoji make the visuals friendlier. They are drawn on screen only, never spoken, so they stay out of caption and narration.
const ICON_RULE = [
  '',
  'I. ICONS. Emoji make the visuals friendly and easy to read. Give an "icon" (exactly ONE emoji) to: the lesson (top level "icon"), every beat ("icon" next to "title"), every card, formula part, change item, flow step, and every "text" block. Pick accounting emoji that fit the meaning: 🧾 source document or invoice, 💰 cash or money, 🏦 bank, 📒 journal or account, 📚 ledger, 📊 statements or reports, 🧮 calculation, ✏️ stationery, 📦 stock or inventory, 🛒 purchases, 🏷️ sales, 💵 income, 💸 expense, 📈 increase or profit, 📉 decrease or loss, ⚖️ balance or equation, 👤 owner or debtor, 💼 assets, 💳 liabilities, 📥 debit, 📤 credit, 🎯 goal, ✅ correct, ⚠️ warning, 💡 tip, 📆 daily, 🗓️ monthly, 📅 yearly, 🎓 lesson, 🔁 repeated procedure, 🔎 identify, 🗂️ classify. Never put emoji in "caption" or "narration", never two in a row, never the same emoji on every element.',
].join('\n');

export function buildSystem(lang: 'en' | 'af' = 'en'): string {
  return SYSTEM + '\n' + SLIDE_TEXT_RULE + '\n' + ICON_RULE + (lang === 'af' ? '\n\n' + afrikaansGlossaryPrompt() : '');
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
