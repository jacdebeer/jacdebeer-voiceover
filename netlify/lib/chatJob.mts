// Chat editor for a finished lesson: the user asks for changes in plain words, Claude answers and proposes them as a
// small JSON Patch. Nothing is applied until the user confirms in the browser. Shared by api.mts (queue) and chat-background.mts.
// @ts-ignore - plain JS module
import { SYSTEM } from './lessonPrompt.mjs';
// @ts-ignore - plain JS module
import { afrikaansGlossaryPrompt } from './afrikaansTerms.mjs';
// @ts-ignore - plain JS module
import { applyPatch, describeChanges } from './lessonPatch.mjs';
// @ts-ignore - plain JS module
import { addDefaultIcons } from './lessonRepair.mjs';
import { VISUALS_MODEL } from './visualsJob.mts';

export const CHAT_STORE = 'chat-jobs';
export const CHAT_MAX_OUTPUT_TOKENS = 16000;
export const MAX_LESSON_CHARS = 150_000;
export const MAX_MESSAGE_CHARS = 2000;

export interface ChatMessage { role: 'user' | 'assistant'; text: string }
export interface ChatInput { lesson: any; messages: ChatMessage[]; lang: 'en' | 'af'; mode?: 'read' | 'explain' }
export interface ChatResult {
  reply: string;
  proposal: null | { summary: string; lesson: any; changes: any };
}

const EDIT_RULES = [
  '',
  'EDITING MODE. You are editing a FINISHED lesson that already has visuals and a recorded voice-over. The user chats with you to change it.',
  'You never change the lesson yourself. You answer in the chat and, when the request is clear, PROPOSE changes. The user must confirm before anything is applied and the lesson is regenerated.',
  '',
  'Reply with ONE JSON object and nothing else:',
  '{ "reply": string, "proposal": null | { "summary": string, "ops": [ { "op": "add"|"replace"|"remove", "path": string, "value"?: any } ] } }',
  '- "reply": short, plain, friendly, in the language the user writes in. Say what you will change, or ask ONE clarifying question when the request is ambiguous (then "proposal" is null). When you only answer a question, "proposal" is null. Never mention JSON, paths or operations.',
  '- "summary": one sentence describing the change for the confirmation card, in the language of the lesson.',
  '- "ops": RFC 6902 JSON Patch against the lesson document you are given. Paths are JSON Pointers, arrays are 0-based ("/beats/2/blocks/0/rows/1"). Append to an array with "/-". At most 40 operations. Allowed top-level keys: icon, title, subtitle, currency, labels, scenario, beats, pronunciations.',
  '- Make the SMALLEST change that satisfies the request. Do not rewrite untouched parts. Keep ids, structure and every other field as they are.',
  '- Every changed or added block must follow the block schemas and rules above exactly (same field names, one emoji "icon" where icons are used, figures that agree with each other and with the narration).',
  '',
  'WHAT THE USER MAY ASK FOR',
  '1. VISUAL changes: change, add, remove or reorder blocks, rows, figures, labels, titles, emoji, colours of the standard block types. A visual-only change does NOT touch caption or narration and costs no voice credits. Prefer it whenever the request is about how something looks.',
  '2. SPOKEN-TEXT changes: change "caption" and "narration" entries. Narration entry i is spoken when the i-th revealed element of the beat appears (elements are revealed in order through the beat\'s blocks: every table row, card, step, tile and chip is one element). If you add or remove a revealed element, add or remove the matching narration entry at the same position (use "" when nothing is said). Changing spoken text means the whole lesson must be voiced again (credits); say so in "reply". Write plain spoken words: no symbols, abbreviations or digits. Never say a sentence twice.',
  '3. PRONUNCIATION: the object "pronunciations" maps a written word to how the voice must say it, for example {"Bates": "Baates"}. It only affects the audio, never the screen. Use "add" or "replace" on "/pronunciations/<word>" (or add the whole "/pronunciations" object if it does not exist yet). At most 50 words.',
  '4. AUDIO that cannot be changed here: the narrator voice, speed and volume. If asked, explain that the narrator is chosen in the Narrator list of this window and that the volume is already levelled.',
  '',
  'Keep the lesson in its language. Do not translate it unless asked. Never invent facts the user did not give; for figures that are not specified, keep the existing ones.',
].join('\n');

export function buildChatSystem(lang: 'en' | 'af'): string {
  return SYSTEM + '\n' + EDIT_RULES + (lang === 'af' ? '\n\n' + afrikaansGlossaryPrompt() : '');
}

/** The conversation as Anthropic messages: roles alternate, start with the user, and the last turn carries the lesson. */
export function buildChatMessages(input: ChatInput): { role: 'user' | 'assistant'; content: string }[] {
  const turns: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const m of input.messages.slice(-12)) {
    const text = String(m.text || '').slice(0, MAX_MESSAGE_CHARS).trim();
    if (!text) continue;
    const role = m.role === 'assistant' ? 'assistant' : 'user';
    const last = turns[turns.length - 1];
    if (last && last.role === role) last.content += '\n' + text;
    else turns.push({ role, content: text });
  }
  while (turns.length && turns[0].role !== 'user') turns.shift();
  if (!turns.length || turns[turns.length - 1].role !== 'user') throw new Error('The chat has no question from the user.');
  const beats: any[] = input.lesson?.beats ?? [];
  const outline = beats.map((b, i) => `Beat ${i}: ${b?.title ?? ''}`).join('\n');
  const last = turns[turns.length - 1];
  last.content =
    'The lesson as it is now (a JSON document; count beats from 0):\n' + JSON.stringify(input.lesson) +
    '\n\nBeats:\n' + outline +
    (input.mode === 'read'
      ? '\n\nNote: this lesson reads a slide script word for word. Tell the user in your reply when a spoken-text change makes the voice-over differ from the slide.'
      : '') +
    '\n\nThe user\'s request:\n' + last.content +
    '\n\nReturn the JSON object only.';
  return turns;
}

function extractJson(text: string): any {
  let t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(t); } catch { /* fall through */ }
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
  throw new Error('not json');
}

async function callModel(apiKey: string, system: string, messages: any[], fetchImpl: typeof fetch): Promise<string> {
  const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: VISUALS_MODEL, max_tokens: CHAT_MAX_OUTPUT_TOKENS, system, messages }),
  });
  const body: any = await res.json();
  if (!res.ok) {
    console.error('Anthropic error', res.status, body?.error?.message);
    throw new Error(`Anthropic API error ${res.status}: ${body?.error?.message || 'request failed'}`);
  }
  if (body.stop_reason === 'max_tokens') throw new Error('The answer ran past the output limit. Ask for a smaller change.');
  return (body.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('');
}

/** Asks Claude, checks any proposal against the lesson rules, and gives the model one chance to repair a bad proposal. */
export async function runChat(input: ChatInput, apiKey: string, fetchImpl: typeof fetch = fetch): Promise<ChatResult> {
  const system = buildChatSystem(input.lang);
  const messages: any[] = buildChatMessages(input);
  let lastError = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await callModel(apiKey, system, messages, fetchImpl);
    let parsed: any;
    try {
      parsed = extractJson(raw);
    } catch {
      lastError = 'Your answer was not a single valid JSON object.';
      messages.push({ role: 'assistant', content: raw.slice(0, 4000) }, { role: 'user', content: lastError + ' Return the JSON object only.' });
      continue;
    }
    const reply = typeof parsed?.reply === 'string' ? parsed.reply.trim().slice(0, 1500) : '';
    const p = parsed?.proposal;
    if (!p || !Array.isArray(p.ops) || !p.ops.length) {
      return { reply: reply || 'Tell me what you would like to change.', proposal: null };
    }
    try {
      const after = applyPatch(input.lesson, p.ops);
      addDefaultIcons(after);
      const changes = describeChanges(input.lesson, after);
      const nothing = !changes.spoken.length && !changes.blocksChanged && !changes.beatsAdded && !changes.beatsRemoved && !changes.pronunciationsChanged &&
        JSON.stringify(after) === JSON.stringify(input.lesson);
      if (nothing) return { reply: reply || 'Nothing would change.', proposal: null };
      const summary = typeof p.summary === 'string' && p.summary.trim() ? p.summary.trim().slice(0, 300) : 'Apply the proposed changes';
      return { reply: reply || summary, proposal: { summary, lesson: after, changes } };
    } catch (e: any) {
      lastError = String(e?.message || e);
      messages.push({ role: 'assistant', content: raw.slice(0, 6000) }, {
        role: 'user',
        content: `That change list cannot be applied: ${lastError}\nFix it and return the corrected JSON object only (same format).`,
      });
    }
  }
  return { reply: `I could not turn that into a safe change (${lastError}). Try describing it differently or in smaller steps.`, proposal: null };
}
