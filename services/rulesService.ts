// The user's rules for every future lesson (see netlify/lib/rules.mts). Kept on the server per user; the pronunciation rules are
// also held here so every voicing can use them without asking the server again.

export interface UserRule {
  id: string;
  kind: 'instruction' | 'pronunciation';
  text: string;
  word?: string;
  say?: string;
  active: boolean;
  createdAt: number;
}
export interface SuggestedRule { kind: 'instruction' | 'pronunciation'; text: string; word?: string; say?: string }

let cache: UserRule[] = [];
let pron: Record<string, string> = {};
let loaded = false;
const listeners = new Set<() => void>();

const apply = (d: any) => {
  cache = Array.isArray(d?.rules) ? d.rules : [];
  pron = d?.pronunciations && typeof d.pronunciations === 'object' ? d.pronunciations : {};
  loaded = true;
  listeners.forEach((f) => f());
};

async function call(path: string, init?: RequestInit) {
  const res = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || `Request failed (${res.status})`);
  return d;
}

export const getRules = () => cache;
export const rulesLoaded = () => loaded;
/** The pronunciation rules, as {word: how it is said}, for the voice. */
export const getGlobalPronunciations = () => pron;
export const onRulesChange = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };

export async function fetchRules(): Promise<UserRule[]> {
  try { apply(await call('/api/rules')); } catch { /* not signed in, or offline: no rules */ }
  return cache;
}
export async function saveRule(rule: SuggestedRule): Promise<UserRule[]> {
  apply(await call('/api/rules', { method: 'POST', body: JSON.stringify({ rule }) }));
  return cache;
}
export async function setRuleActive(id: string, active: boolean): Promise<UserRule[]> {
  apply(await call(`/api/rules/${id}`, { method: 'PATCH', body: JSON.stringify({ active }) }));
  return cache;
}
export async function removeRule(id: string): Promise<UserRule[]> {
  apply(await call(`/api/rules/${id}`, { method: 'DELETE' }));
  return cache;
}
