// Slide visuals: shared prompt-building for the queue (api.mts) and the worker (visuals-background.mts).
// @ts-ignore - plain JS module ported from GSA-accounts-explainer
import { SYSTEM, RECORDING_RULES, LEDGER_RULE, LEVEL_GUIDES } from './lessonPrompt.mjs';
// @ts-ignore - plain JS module
import { afrikaansGlossaryPrompt } from './afrikaansTerms.mjs';

export const VISUALS_STORE = 'visual-jobs';
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
  '   - VISUALS MUST CARRY THE LESSON. Every beat needs at least one visual block that is not "text". Use "text" only for one short rule or note. Do not build a lesson only from "cards": cards are for a real list of categories or definitions, at most two beats in a lesson. Mix the block types: "formula" for an equation (for example Bates = Eienaarsbelang + Laste), "change" for what goes up or down, "flow" for steps, "equation", "t_accounts", "journal" and "source_document" for anything about accounts and entries.',
  '   - ACCOUNT ILLUSTRATIONS (the exception to "use only the given figures", for the visuals only). Whenever the script explains an account, says which account is debited or credited, says on which side an account increases, or explains a closing or appropriation entry, DRAW IT: a "t_accounts" block for each account it names, with the debit and the credit side, and a "journal" block when an entry is described. The script gives no amounts for this, so use simple round illustrative figures (for example 60 000), keep them consistent between the journal, the T-accounts and any "equation" block. NEVER add a note, heading or warning that says the figures are an example, an illustration or made up (no "Illustrasie", no "Illustration", no warning block about it): just show them. The narration stays exactly the script and must never read these figures. Every slide that is about the accounts of a company needs at least two beats with a T-account.',
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
  '   - When the topic needs figures, build ONE short worked example with simple round illustrative figures (for example 48 000 and 6 500), and do not add any note that the figures are for illustration. Never contradict the outline.',
  '   - Use the rich blocks: source_document, calculation, journal, t_accounts, ledger_columnar, equation, formula, cards, change, flow. Every beat needs at least one visual block that is not "text". Use "text" only for a short rule or note.',
  '   - VOICE-OVER. Write what the lecturer says aloud, in natural spoken language, as if explaining to students in class. "caption" is ONE introducing sentence. "narration" holds one or two spoken sentences per revealed element (each table row, card, step, tile, chip). Plain words only: no symbols, no abbreviations, no digits (write "ses duisend vyf honderd rand"). About 150 to 300 words in total, 5 to 8 beats.',
  '   - Never say a sentence twice: each spoken sentence appears exactly once in the whole lesson, in a caption or in one narration entry, never both. Do not mention "the slide".',
  '   - Omit "quiz" entirely: it would be silent.',
].join('\n');

// Every account a slide names is drawn, also on introduction, overview and summary slides.
const COVERAGE_RULE = [
  '',
  'K. ACCOUNT COVERAGE. First list every account the text names (for example Gewone Aandelekapitaal, Behoue Inkomste, Aanwendingsrekening, Inkomstebelasting, Dividende betaalbaar, Bank). Every one of them must be drawn at least once in the lesson as a "t_accounts" account with its normal side and at least one typical entry, with figures that agree with the rest of the lesson and with any SHARED EXAMPLE. This applies to introduction, overview, comparison and summary beats too, where you would otherwise show only cards, a flow or a formula. Cards, flows and formulas may add to the T-accounts but never replace them. An overview or summary beat may show up to 3 accounts side by side in one "t_accounts" block, each with one entry or its closing balance. Do not leave an account that the text names without a T-account.',
].join('\n');

// Text must fit the boxes it is drawn in.
const FIT_RULE = [
  '',
  'J. TEXT MUST FIT ITS BOX. Cards: "label" at most 4 words, "text" at most 14 words. Change items: "label" at most 5 words, "note" at most 8 words. Flow steps: "label" at most 4 words, "text" at most 14 words. Formula parts: "text" at most 3 words, "sub" at most 6 words. Text blocks: "heading" at most 5 words, "body" at most 30 words. Beat titles at most 6 words. Account names in T-accounts and column labels at most 3 words (use the standard short name). Put the detail in the narration, not on the screen. Use at most 4 cards, 5 flow steps, 5 formula parts and 6 change items per block; split a bigger list over two beats.',
].join('\n');

export function buildSystem(lang: 'en' | 'af' = 'en', mode: Mode = 'read'): string {
  const body = mode === 'explain' ? SYSTEM + '\n' + EXPLAIN_RULE : SYSTEM + '\n' + SLIDE_TEXT_RULE;
  return body + '\n' + ICON_RULE + COVERAGE_RULE + FIT_RULE + (lang === 'af' ? '\n\n' + afrikaansGlossaryPrompt() : '');
}

export function buildUserText(opts: { text: string; lang: 'en' | 'af'; level: Level; currency: string; mode?: Mode; context?: string }): string {
  const langName = opts.lang === 'af' ? 'Afrikaans' : 'English';
  const guide = (LEVEL_GUIDES as Record<string, string>)[opts.level];
  return (
    (opts.mode === 'explain'
      ? 'Slide outline (teach every point, in this order, and write the voice-over yourself):\n'
      : 'Slide script (voice-over text, use verbatim):\n') + opts.text +
    '\n\nCurrency symbol: ' + opts.currency +
    '\nThe ' + (opts.mode === 'explain' ? 'outline' : 'script') + ' is in ' + langName + '. Write every label, title, explanation and the whole voice-over in ' + langName + '.' +
    (opts.lang === 'af' ? ' Use South African Afrikaans accounting terminology.' : '') +
    (opts.context
      ? '\n\nSHARED EXAMPLE. Earlier slides of the same course already used these example figures (account, its entries, and the balance they add up to):\n' + opts.context +
        '\nWhen a T-account, journal, equation or calculation of this slide is about an account named above, use EXACTLY these amounts and counter-accounts and carry on from them: the closing balance of an earlier account is the opening balance (Saldo b/o) of the same account here, and a new entry builds on it. Only invent new figures for accounts that are not listed. Do not repeat the earlier slides\' entries as if they were new, and do not mention that the figures come from earlier slides.'
      : '') +
    (guide ? '\n\nAudience guide:\n' + guide : '') +
    '\n\n' + RECORDING_RULES +
    '\n\n' + LEDGER_RULE +
    '\nReturn the JSON object only.'
  );
}
