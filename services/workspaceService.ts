import { CoursePage } from "../types";

/** Saved work, stored per signed-in user in Netlify Blobs through /api/workspace. */
export interface SavedWorkspace {
  pages: { id: number; text: string; hasAudio: boolean }[];
  pageIndex: number;
  voiceId: string;
  transcript: string;
  savedAt: number;
}

export async function loadWorkspace(): Promise<SavedWorkspace | null> {
  try {
    const res = await fetch("/api/workspace");
    if (!res.ok) return null;
    const data = await res.json();
    const w = data?.workspace;
    if (!w || !Array.isArray(w.pages) || w.pages.length === 0) return null;
    return w as SavedWorkspace;
  } catch {
    return null;
  }
}

export async function saveWorkspace(state: {
  pages: CoursePage[];
  pageIndex: number;
  voiceId: string;
  transcript: string;
}): Promise<boolean> {
  try {
    const body: SavedWorkspace = {
      pages: state.pages.map((p) => ({ id: p.id, text: p.text, hasAudio: Boolean(p.audioData) })),
      pageIndex: state.pageIndex,
      voiceId: state.voiceId,
      transcript: state.transcript,
      savedAt: Date.now(),
    };
    const res = await fetch("/api/workspace", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Audio is raw 24 kHz PCM. Keys may contain letters, digits and dashes only. */
export async function saveAudio(key: string, bytes: Uint8Array): Promise<boolean> {
  try {
    const res = await fetch(`/api/workspace/audio/${key}`, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: bytes,
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function loadAudio(key: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(`/api/workspace/audio/${key}`);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}
