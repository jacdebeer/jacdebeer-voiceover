// Background worker for the lesson chat: asks Claude, validates the proposed edit, stores the answer for polling.
import { getStore } from '@netlify/blobs';
import { CHAT_STORE, runChat } from '../lib/chatJob.mts';

export default async (req: Request): Promise<Response> => {
  let jobId: string | undefined;
  try {
    ({ jobId } = await req.json());
  } catch {
    return new Response('', { status: 400 });
  }
  if (!jobId) return new Response('', { status: 400 });

  const store = getStore(CHAT_STORE);
  const job: any = await store.get(jobId, { type: 'json' });
  if (!job || job.status !== 'queued') return new Response('', { status: 202 });
  const base = { owner: job.owner, createdAt: job.createdAt };
  await store.setJSON(jobId, { ...base, status: 'running' });
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('The server is missing its Anthropic API key.');
    const result = await runChat(job.input, apiKey);
    await store.setJSON(jobId, { ...base, status: 'done', result });
  } catch (err: any) {
    await store.setJSON(jobId, { ...base, status: 'error', error: err?.message || 'The chat failed.' });
  }
  return new Response('', { status: 202 });
};
