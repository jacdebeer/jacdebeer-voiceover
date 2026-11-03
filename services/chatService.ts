import { LessonData } from './lessonPlayer';

export interface ChatTurn { role: 'user' | 'assistant'; text: string }

/** What Claude would change, worked out on the server from a checked JSON Patch. */
export interface ChatChanges {
  spoken: { kind: 'changed' | 'added' | 'removed'; beat: number; from?: string; to?: string }[];
  newLines: number;
  beatsAdded: number;
  beatsRemoved: number;
  blocksChanged: number;
  pronunciationsChanged: boolean;
}

/** The video's timeline, reported by the player: every line with the moment it is said, in seconds from the start. */
export interface LessonTimeline {
  total: number;
  beats: { title: string; start: number; end: number; blockTypes: string[]; items: { t: number; kind: string; text: string; blocks: number[] }[] }[];
}
export interface LessonPos { t: number; total: number; beat: number }

export const mmss = (t: number) => `${Math.floor(Math.round(t) / 60)}:${String(Math.round(t) % 60).padStart(2, '0')}`;

/** When a changed line is said: its own entry in the timeline, or the start of its beat. */
export function timeOfChange(tl: LessonTimeline | null, c: { beat: number; from?: string }): number | null {
  if (!tl) return null;
  if (c.from) for (const b of tl.beats) for (const it of b.items) if (it.text === c.from) return it.t;
  return tl.beats[c.beat]?.start ?? null;
}

export interface ChatProposal { summary: string; lesson: LessonData; changes: ChatChanges }
export interface ChatAnswer { reply: string; proposal: ChatProposal | null }

const POLL_MS = 1500;
const POLL_LIMIT = 200; // 5 minutes

/** Sends the conversation and the current lesson to Claude and waits for the answer. Nothing is changed by this call. */
export async function askChat(
  params: { lesson: LessonData; messages: ChatTurn[]; lang: 'en' | 'af'; mode: 'read' | 'explain'; timeline?: LessonTimeline | null; now?: number | null },
  signal?: AbortSignal,
): Promise<ChatAnswer> {
  const start = await fetch('/api/visuals-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal,
  });
  const started = await start.json().catch(() => ({}));
  if (start.status === 401) throw new Error('Your session has ended. Sign in again.');
  if (!start.ok) throw new Error(started.error || `Could not start the chat (HTTP ${start.status}).`);

  for (let i = 0; i < POLL_LIMIT; i++) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    if (signal?.aborted) throw new DOMException('Stopped', 'AbortError');
    const res = await fetch(`/api/visuals-chat/${started.jobId}`, { signal });
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) throw new Error('Your session has ended. Sign in again.');
    if (!res.ok) throw new Error(body.error || `Status check failed (HTTP ${res.status}).`);
    if (body.status === 'done') return body.result as ChatAnswer;
    if (body.status === 'error') throw new Error(body.error || 'The chat returned an error.');
  }
  throw new Error('Timed out after 5 minutes. Try again.');
}

/** Does applying this proposal change what the voice has to say? Then the whole slide is voiced again. */
export function needsNewVoice(c: ChatChanges): boolean {
  return c.spoken.length > 0 || c.pronunciationsChanged;
}
