// The user's own rules for every future lesson. A rule comes from the chat: "from now on ...". Two kinds:
//  - instruction: one sentence that is added to the instructions the lesson-writing model follows every time;
//  - pronunciation: a word and how the voice must say it, used every time a slide is voiced.
// Kept per user in Netlify Blobs, so they apply to every project and every render of that user.
import { getStore } from '@netlify/blobs';

export const RULES_STORE = 'user-rules';
export const MAX_RULES = 60;

export interface Rule {
  id: string;
  kind: 'instruction' | 'pronunciation';
  /** instruction: the sentence; pronunciation: a readable form such as "Bates is said Baates" */
  text: string;
  word?: string;
  say?: string;
  active: boolean;
  createdAt: number;
}

/** What the chat or the browser sends. Returns null when it is not a usable rule. */
export function cleanRule(input: any): Omit<Rule, 'id' | 'active' | 'createdAt'> | null {
  if (!input || typeof input !== 'object') return null;
  if (input.kind === 'pronunciation') {
    const word = typeof input.word === 'string' ? input.word.trim() : '';
    const say = typeof input.say === 'string' ? input.say.trim() : '';
    if (!word || !say || word.length > 40 || say.length > 60) return null;
    return { kind: 'pronunciation', word, say, text: `${word} → ${say}` };
  }
  const text = typeof input.text === 'string' ? input.text.replace(/\s+/g, ' ').trim() : '';
  if (text.length < 8 || text.length > 400) return null;
  return { kind: 'instruction', text };
}

const keyOf = (owner: string) => `rules-${owner.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120)}`;

export async function loadRules(owner: string): Promise<Rule[]> {
  try {
    const v: any = await getStore(RULES_STORE).get(keyOf(owner), { type: 'json' });
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

async function save(owner: string, rules: Rule[]): Promise<void> {
  await getStore(RULES_STORE).setJSON(keyOf(owner), rules);
}

export async function addRule(owner: string, input: any): Promise<{ rules: Rule[]; added?: Rule; error?: string }> {
  const clean = cleanRule(input);
  const rules = await loadRules(owner);
  if (!clean) return { rules, error: 'That is not a usable rule.' };
  if (rules.length >= MAX_RULES) return { rules, error: `You can keep at most ${MAX_RULES} rules. Delete one first.` };
  // the same rule twice is one rule
  const same = rules.find((r) => r.kind === clean.kind && (clean.kind === 'pronunciation' ? r.word?.toLowerCase() === clean.word?.toLowerCase() : r.text.toLowerCase() === clean.text.toLowerCase()));
  if (same) {
    Object.assign(same, clean, { active: true });
    await save(owner, rules);
    return { rules, added: same };
  }
  const rule: Rule = { id: crypto.randomUUID(), ...clean, active: true, createdAt: Date.now() };
  rules.push(rule);
  await save(owner, rules);
  return { rules, added: rule };
}

export async function updateRule(owner: string, id: string, patch: { active?: boolean }): Promise<Rule[] | null> {
  const rules = await loadRules(owner);
  const r = rules.find((x) => x.id === id);
  if (!r) return null;
  if (typeof patch.active === 'boolean') r.active = patch.active;
  await save(owner, rules);
  return rules;
}

export async function deleteRule(owner: string, id: string): Promise<Rule[]> {
  const rules = (await loadRules(owner)).filter((r) => r.id !== id);
  await save(owner, rules);
  return rules;
}

/** The instruction rules as a block for the lesson-writing prompt. Empty when there are none. */
export function rulesPromptBlock(rules: Rule[]): string {
  const list = rules.filter((r) => r.active && r.kind === 'instruction').map((r, i) => `${i + 1}. ${r.text}`);
  const words = rules.filter((r) => r.active && r.kind === 'pronunciation');
  if (!list.length && !words.length) return '';
  return (
    '\n\nHOUSE RULES FROM THE USER. These are the user\'s own standing rules. They apply to every lesson and override the rules above wherever they differ:\n' +
    (list.length ? list.join('\n') : '') +
    (words.length ? `\n${list.length ? '' : ''}Pronunciation (the voice is told this automatically; keep the written word as it is): ${words.map((w) => `${w.word} is said "${w.say}"`).join('; ')}.` : '')
  );
}

/** The pronunciation rules as a word map for the voice. */
export function pronunciationMap(rules: Rule[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rules) if (r.active && r.kind === 'pronunciation' && r.word && r.say) out[r.word] = r.say;
  return out;
}
