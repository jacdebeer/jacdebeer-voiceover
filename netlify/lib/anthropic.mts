// The model that builds the visuals and answers in the chat. A more capable model draws better lessons (richer blocks, text that
// fits, T-accounts where they belong); the fast model is the fallback when the first one is not available on the account.
export const PRIMARY_MODEL = process.env.VISUALS_MODEL || 'claude-sonnet-5-5';
export const FALLBACK_MODEL = process.env.VISUALS_FALLBACK_MODEL || 'claude-haiku-5-5';

export interface MessageParams { max_tokens: number; system: string; messages: { role: 'user' | 'assistant'; content: string }[] }

/** One Messages API call; if the primary model is rejected (unknown model, limit above what it allows) the fallback model answers. */
export async function callMessages(apiKey: string, params: MessageParams, fetchImpl: typeof fetch = fetch): Promise<{ ok: true; reply: any; model: string } | { ok: false; status: number; message: string }> {
  const models = PRIMARY_MODEL === FALLBACK_MODEL ? [PRIMARY_MODEL] : [PRIMARY_MODEL, FALLBACK_MODEL];
  let last: { ok: false; status: number; message: string } = { ok: false, status: 0, message: 'no model' };
  for (const model of models) {
    const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, ...params }),
    });
    const reply: any = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, reply, model };
    const message = reply?.error?.message || 'request failed';
    console.error('Anthropic error', model, res.status, message);
    last = { ok: false, status: res.status, message };
    // 400 / 404 / 422: this model cannot take the request, try the next one. Anything else (key, rate limit, outage) will not change by switching.
    if (![400, 404, 422].includes(res.status)) break;
  }
  return last;
}
