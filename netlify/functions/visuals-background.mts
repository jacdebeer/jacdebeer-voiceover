// Background worker (runs up to 15 minutes): asks Claude for the slide visuals and stores the result.
// It has no user session. The job id is an unguessable UUID that api.mts created for a signed-in user.
import { getStore } from '@netlify/blobs';
// @ts-ignore - plain JS module
import { repairSpokenLines, dedupeSelf, addDefaultIcons, stripIllustrationNotes, tidyApostrophes } from '../lib/lessonRepair.mjs';
import { VISUALS_STORE, VISUALS_MAX_OUTPUT_TOKENS, buildSystem, buildUserText } from '../lib/visualsJob.mts';
import { callMessages } from '../lib/anthropic.mts';

export default async (req: Request): Promise<Response> => {
  let jobId: string | undefined;
  try {
    ({ jobId } = await req.json());
  } catch {
    return new Response('', { status: 400 });
  }
  if (!jobId) return new Response('', { status: 400 });

  const store = getStore(VISUALS_STORE);
  const job: any = await store.get(jobId, { type: 'json' });
  if (!job || job.status !== 'queued') return new Response('', { status: 202 });

  const base = { owner: job.owner, createdAt: job.createdAt };
  await store.setJSON(jobId, { ...base, status: 'running' });

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('The server is missing its Anthropic API key.');

    const result = await callMessages(apiKey, {
      max_tokens: VISUALS_MAX_OUTPUT_TOKENS,
      system: buildSystem(job.input.lang, job.input.mode),
      messages: [{ role: 'user', content: buildUserText(job.input) }],
    });
    if (result.ok === false) throw new Error(`Anthropic API error ${result.status}: ${result.message}`);
    const reply: any = result.reply;
    if (reply.stop_reason === 'max_tokens') {
      throw new Error('The visuals ran past the output limit. Split the slide into smaller slides.');
    }
    let text = (reply.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('').trim();
    text = text.replace(/^```(?:json)?/, '').replace(/```$/, '').trim();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('The model returned text that is not valid JSON. Generate again.');
    }
    // the model sometimes speaks a sentence twice (caption and narration); keep each script sentence once
    const { removed } = job.input.mode === 'explain' ? dedupeSelf(data) : repairSpokenLines(data, job.input.text);
    if (removed.length) console.log(`Removed ${removed.length} repeated spoken line(s) from the lesson`);
    const notes = stripIllustrationNotes(data);
    if (notes) console.log(`Removed ${notes} illustration note(s)`);
    tidyApostrophes(data);
    const iconsAdded = addDefaultIcons(data);
    if (iconsAdded) console.log(`Added ${iconsAdded} default emoji icon(s)`);
    data.lang = job.input.lang;
    data.mode = job.input.mode === 'explain' ? 'explain' : 'read';
    data.currency = job.input.currency;
    await store.setJSON(jobId, { ...base, status: 'done', data });
  } catch (err: any) {
    await store.setJSON(jobId, { ...base, status: 'error', error: err?.message || 'Generation failed.' });
  }
  return new Response('', { status: 202 });
};
