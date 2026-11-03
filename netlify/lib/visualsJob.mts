// Slide visuals: shared prompt-building for the queue (api.mts) and the worker (visuals-background.mts).
// @ts-ignore - plain JS module ported from GSA-accounts-explainer
import { SYSTEM, RECORDING_RULES, LEDGER_RULE, LEVEL_GUIDES } from './lessonPrompt.mjs';
// @ts-ignore - plain JS module
import { afrikaansGlossaryPrompt } from './afrikaansTerms.mjs';

export const VISUALS_STORE = 'visual-jobs';
export const VISUALS_MODEL = 'claude-haiku-5-5';
export const VISUALS_MAX_OUTPUT_TOKENS = 32000;

export type Mode = 'read' | 'explain';

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

// Explain mode: the slide is only an outline (often just headings). Claude teaches it the way the original explainer did:
// the accounting cycle, rich accounting blocks, and a lecturer's spoken explanation.
const EXPLAIN_RULE = [
  '',
  'H. EXPLAIN MODE (overrides E0 and the "use only the given figures" limits where they conflict).',
  '   The user message is the OUTLINE of one slide, often only headings and fragments. You are the lecturer: teach it.',
  '   - Cover every point of the outline, in its order, using its terms exactly as written.',
  '   - For each point say what it means and why it matters, then show it. Follow the real accounting cycle of rule F wherever the topic has one: source document, analysis, journal entry, ledger, accounting equation, then a short summary.',
  '   - When the topic needs figures, build ONE short worked example with simple round illustrative figures (for example 48 000 and 6 500), and say in a "text" block that the figures are for illustration. Never contradict the outline.',
  '   - Use the rich blocks: source_document, calculation, journal, t_accounts, ledger_columnar, equation, formula, cards, change, flow. Every beat needs at least one visual block that is not "text". Use "text" only for a short rule or note.',
  '   - VOICE-OVER. Write what the lecturer says aloud, in natural spoken language, as if explaining to students in class. "caption" is ONE introducing sentence. "narration" holds one or two spoken sentences per revealed element (each table row, card, step, tile, chip). Plain words only: no symbols, no abbreviations, no digits (write "ses duisend vyf honderd rand"). About 150 to 300 words in total, 5 to 8 beats.',
  '   - Never say a sentence twice: each spoken sentence appears exactly once in the whole lesson, in a caption or in one narration entry, never both. Do not mention "the slide".',
  '   - Omit "quiz" entirely: it would be silent.',
].join('\n');

export function buildSystem(lang: 'en' | 'af' = 'en', mode: Mode = 'read'): string {
  const body = mode === 'explain' ? SYSTEM + '\n' + EXPLAIN_RULE : SYSTEM + '\n' + SLIDE_TEXT_RULE;
  return body + '\n' + ICON_RULE + (lang === 'af' ? '\n\n' + afrikaansGlossaryPrompt() : '');
}

export function buildUserText(opts: { text: string; lang: 'en' | 'af'; level: Level; currency: string; mode?: Mode }): string {
  const langName = opts.lang === 'af' ? 'Afrikaans' : 'English';
  const guide = (LEVEL_GUIDES as Record<string, string>)[opts.level];
  return (
    (opts.mode === 'explain'
      ? 'Slide outline (teach every point, in this order, and write the voice-over yourself):\n'
      : 'Slide script (voice-over text, use verbatim):\n') + opts.text +
    '\n\nCurrency symbol: ' + opts.currency +
    '\nThe ' + (opts.mode === 'explain' ? 'outline' : 'script') + ' is in ' + langName + '. Write every label, title, explanation and the whole voice-over in ' + langName + '.' +
    (opts.lang === 'af' ? ' Use South African Afrikaans accounting terminology.' : '') +
    (guide ? '\n\nAudience guide:\n' + guide : '') +
    '\n\n' + RECORDING_RULES +
    '\n\n' + LEDGER_RULE +
    '\nReturn the JSON object only.'
  );
}
