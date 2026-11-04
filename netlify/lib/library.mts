// Lesson library on Netlify Database (Postgres). See netlify/database/migrations for the tables.
//
// A lesson is saved in three steps so that no single request is large (function requests are limited to about 6 MB):
//   1. POST /api/library                      creates the row (status "saving") and returns its id and public token
//   2. PUT  /api/library/:id/audio/:idx       one MP3 clip per spoken line
//   3. POST /api/library/:id/finish           stores the embed page and marks the lesson "ready"
// Owner routes need a signed-in user. The embed routes are public, but only for a lesson its owner has made public.
import { getDatabase } from '@netlify/database';
import { randomBytes } from 'node:crypto';

const MAX_AUDIO_BYTES = 3 * 1024 * 1024; // one clip, a few hundred KB in practice
const MAX_CLIPS = 400;
const MAX_JSON_CHARS = 2_000_000;
const MAX_HTML_CHARS = 1_500_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{16,64}$/;

let cached: ReturnType<typeof getDatabase> | null = null;
function database() {
  // LIBRARY_TEST_DB_URL exists only so the routes can be tested outside Netlify; on Netlify getDatabase() picks the right branch itself.
  if (!cached) cached = getDatabase(process.env.LIBRARY_TEST_DB_URL ? { connectionString: process.env.LIBRARY_TEST_DB_URL } : undefined);
  return cached;
}

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const toBuffer = (v: any): Buffer => (Buffer.isBuffer(v) ? v : Buffer.from(v));

function audioResponse(req: Request, data: Buffer, mime: string, cache: string): Response {
  const base = { 'Content-Type': mime, 'Accept-Ranges': 'bytes', 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff' };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') || '');
  if (!range) return new Response(data, { status: 200, headers: { ...base, 'Content-Length': String(data.length) } });
  // Safari will not play audio from a server that ignores Range requests
  let start = range[1] === '' ? Math.max(0, data.length - Number(range[2])) : Number(range[1]);
  let end = range[1] === '' || range[2] === '' ? data.length - 1 : Math.min(Number(range[2]), data.length - 1);
  if (!(start <= end) || start >= data.length) {
    return new Response(null, { status: 416, headers: { ...base, 'Content-Range': `bytes */${data.length}` } });
  }
  const part = data.subarray(start, end + 1);
  return new Response(part, { status: 206, headers: { ...base, 'Content-Range': `bytes ${start}-${end}/${data.length}`, 'Content-Length': String(part.length) } });
}

const summary = (r: any) => ({
  id: r.id,
  kind: r.kind ?? 'lesson',
  collectionId: r.collection_id ?? null,
  position: r.position ?? null,
  title: r.title,
  lang: r.lang,
  mode: r.mode,
  voiceLabel: r.voice_label,
  slideLabel: r.slide_label,
  words: r.words,
  seconds: r.seconds,
  clipCount: r.clip_count,
  isPublic: r.is_public,
  publicToken: r.public_token,
  createdAt: r.created_at,
});

/** Public embed routes: the lesson page and its audio. No sign-in, but only while the owner has made the lesson public. */
export async function embedRoute(req: Request, route: string): Promise<Response | null> {
  const page = /^\/api\/embed\/([A-Za-z0-9_-]+)$/.exec(route);
  const clip = /^\/api\/embed\/([A-Za-z0-9_-]+)\/audio\/(\d{1,3})$/.exec(route);
  if (!page && !clip) return null;
  if (req.method !== 'GET' && req.method !== 'HEAD') return json({ error: 'Method not allowed' }, 405);
  const token = (page || clip)![1];
  if (!TOKEN.test(token)) return json({ error: 'Not found' }, 404);
  const db = database();

  if (page) {
    const rows: any[] = await db.sql`SELECT html FROM lessons WHERE public_token = ${token} AND is_public = true AND status = 'ready'`;
    if (!rows.length || !rows[0].html) return new Response('Not found', { status: 404 });
    return new Response(rows[0].html, {
      status: 200,
      // not cached anywhere, so unsharing a lesson takes effect on the next visit
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' },
    });
  }
  const rows: any[] = await db.sql`
    SELECT a.data, a.mime FROM lesson_audio a JOIN lessons l ON l.id = a.lesson_id
    WHERE l.public_token = ${token} AND l.is_public = true AND l.status = 'ready' AND a.idx = ${Number(clip![2])}`;
  if (!rows.length) return new Response('Not found', { status: 404 });
  // browser cache only (private), for a few minutes: a shared cache would keep serving the audio after the lesson is unshared
  return audioResponse(req, toBuffer(rows[0].data), rows[0].mime, 'private, max-age=300');
}

/** Owner routes. Returns null when the path is not a library path. */
export async function libraryRoute(req: Request, route: string, user: { id: string; email?: string }): Promise<Response | null> {
  if (route !== '/api/library' && !route.startsWith('/api/library/')) return null;
  const db = database();
  const owner = String(user.id);

  if (route === '/api/library') {
    if (req.method === 'GET') {
      const rows: any[] = await db.sql`
        SELECT id, kind, collection_id, position, title, lang, mode, voice_label, slide_label, words, seconds, clip_count, is_public, public_token, created_at
        FROM lessons WHERE owner_id = ${owner} AND status = 'ready' ORDER BY created_at DESC LIMIT 1000`;
      const cols: any[] = await db.sql`SELECT id, title, lang, created_at FROM collections WHERE owner_id = ${owner} ORDER BY created_at DESC LIMIT 200`;
      return json({ lessons: rows.map(summary), collections: cols.map((c) => ({ id: c.id, title: c.title, lang: c.lang, createdAt: c.created_at })) });
    }
    if (req.method === 'POST') {
      let b: any;
      try { b = await req.json(); } catch { return json({ error: 'Invalid request body' }, 400); }
      const title = typeof b?.title === 'string' ? b.title.trim().slice(0, 200) : '';
      const lessonJson = JSON.stringify(b?.lesson ?? null);
      if (!title) return json({ error: 'A title is required.' }, 400);
      if (!b?.lesson || typeof b.lesson !== 'object' || lessonJson.length > MAX_JSON_CHARS) return json({ error: 'The lesson is missing or too large.' }, 400);
      const clipCount = Number.isInteger(b.clipCount) ? b.clipCount : 0;
      if (clipCount < 0 || clipCount > MAX_CLIPS) return json({ error: 'Too many audio clips.' }, 400);
      const text = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : null);
      const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
      const kind = b.kind === 'audio' ? 'audio' : 'lesson';
      const sourceJson = b.source && typeof b.source === 'object' ? JSON.stringify(b.source) : null;
      if (sourceJson && sourceJson.length > MAX_JSON_CHARS) return json({ error: 'The lesson source is too large.' }, 400);
      let collectionId: string | null = null;
      if (b.collectionId != null) {
        if (typeof b.collectionId !== 'string' || !UUID.test(b.collectionId)) return json({ error: 'Invalid collection.' }, 400);
        const own: any[] = await db.sql`SELECT 1 AS x FROM collections WHERE id = ${b.collectionId} AND owner_id = ${owner}`;
        if (!own.length) return json({ error: 'Collection not found.' }, 404);
        collectionId = b.collectionId;
      }
      const position = Number.isInteger(b.position) && b.position >= 0 && b.position < 1000 ? b.position : null;
      const token = randomBytes(16).toString('base64url');
      const rows: any[] = await db.sql`
        INSERT INTO lessons (owner_id, owner_email, title, lang, mode, voice_label, slide_label, words, seconds, clip_count, lesson, public_token, kind, collection_id, position, source)
        VALUES (${owner}, ${user.email ?? null}, ${title}, ${b.lang === 'en' ? 'en' : 'af'}, ${text(b.mode, 20)}, ${text(b.voiceLabel, 100)}, ${text(b.slideLabel, 100)},
                ${num(b.words)}, ${num(b.seconds)}, ${clipCount}, ${lessonJson}::jsonb, ${token}, ${kind}, ${collectionId}, ${position}, ${sourceJson}::jsonb)
        RETURNING id, public_token`;
      return json({ id: rows[0].id, token: rows[0].public_token }, 201);
    }
    return json({ error: 'Method not allowed' }, 405);
  }

  const cm = /^\/api\/library\/collections(?:\/([^/]+))?$/.exec(route);
  if (cm) {
    if (!cm[1]) {
      if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
      let b: any;
      try { b = await req.json(); } catch { return json({ error: 'Invalid request body' }, 400); }
      const title = typeof b?.title === 'string' ? b.title.trim().slice(0, 200) : '';
      if (!title) return json({ error: 'A title is required.' }, 400);
      const rows: any[] = await db.sql`INSERT INTO collections (owner_id, title, lang) VALUES (${owner}, ${title}, ${b.lang === 'en' ? 'en' : 'af'}) RETURNING id, title, lang, created_at`;
      return json({ id: rows[0].id, title: rows[0].title, lang: rows[0].lang, createdAt: rows[0].created_at }, 201);
    }
    if (!UUID.test(cm[1])) return json({ error: 'Not found' }, 404);
    if (req.method === 'PATCH') {
      let b: any;
      try { b = await req.json(); } catch { return json({ error: 'Invalid request body' }, 400); }
      const title = typeof b?.title === 'string' ? b.title.trim().slice(0, 200) : '';
      if (!title) return json({ error: 'A title is required.' }, 400);
      const rows: any[] = await db.sql`UPDATE collections SET title = ${title}, updated_at = now() WHERE id = ${cm[1]} AND owner_id = ${owner} RETURNING id, title, lang, created_at`;
      return rows.length ? json({ id: rows[0].id, title: rows[0].title, lang: rows[0].lang, createdAt: rows[0].created_at }) : json({ error: 'Not found' }, 404);
    }
    if (req.method === 'DELETE') {
      const rows: any[] = await db.sql`DELETE FROM collections WHERE id = ${cm[1]} AND owner_id = ${owner} RETURNING id`;
      return rows.length ? json({ ok: true }) : json({ error: 'Not found' }, 404);
    }
    return json({ error: 'Method not allowed' }, 405);
  }

  const m = /^\/api\/library\/([^/]+)(?:\/(audio\/(\d{1,3})|finish))?$/.exec(route);
  if (!m || !UUID.test(m[1])) return json({ error: 'Not found' }, 404);
  const id = m[1];
  const sub = m[2];

  if (!sub) {
    if (req.method === 'GET') {
      const rows: any[] = await db.sql`SELECT * FROM lessons WHERE id = ${id} AND owner_id = ${owner}`;
      if (!rows.length) return json({ error: 'Not found' }, 404);
      return json({ ...summary(rows[0]), lesson: rows[0].lesson, source: rows[0].source ?? null, status: rows[0].status });
    }
    if (req.method === 'PATCH') {
      let b: any;
      try { b = await req.json(); } catch { return json({ error: 'Invalid request body' }, 400); }
      const title = typeof b?.title === 'string' && b.title.trim() ? b.title.trim().slice(0, 200) : null;
      const isPublic = typeof b?.isPublic === 'boolean' ? b.isPublic : null;
      const rows: any[] = await db.sql`
        UPDATE lessons SET title = COALESCE(${title}, title), is_public = COALESCE(${isPublic}, is_public), updated_at = now()
        WHERE id = ${id} AND owner_id = ${owner} AND status = 'ready'
        RETURNING id, kind, collection_id, position, title, lang, mode, voice_label, slide_label, words, seconds, clip_count, is_public, public_token, created_at`;
      return rows.length ? json(summary(rows[0])) : json({ error: 'Not found' }, 404);
    }
    if (req.method === 'DELETE') {
      const rows: any[] = await db.sql`DELETE FROM lessons WHERE id = ${id} AND owner_id = ${owner} RETURNING id`;
      return rows.length ? json({ ok: true }) : json({ error: 'Not found' }, 404);
    }
    return json({ error: 'Method not allowed' }, 405);
  }

  if (sub === 'finish') {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    let b: any;
    try { b = await req.json(); } catch { return json({ error: 'Invalid request body' }, 400); }
    const html = typeof b?.html === 'string' ? b.html : '';
    if (!html || html.length > MAX_HTML_CHARS) return json({ error: 'The embed page is missing or too large.' }, 400);
    const have: any[] = await db.sql`SELECT clip_count, (SELECT count(*)::int FROM lesson_audio WHERE lesson_id = ${id}) AS n FROM lessons WHERE id = ${id} AND owner_id = ${owner}`;
    if (!have.length) return json({ error: 'Not found' }, 404);
    // never mark a lesson ready with clips missing
    if (have[0].n < have[0].clip_count) return json({ error: `Only ${have[0].n} of ${have[0].clip_count} audio clips arrived.` }, 409);
    // Editing a saved lesson: the new version takes the place of the old one in one statement, keeping its embed link, sharing and place in its collection.
    if (typeof b?.replaces === 'string') {
      if (!UUID.test(b.replaces) || b.replaces === id) return json({ error: 'Invalid lesson to replace.' }, 400);
      const swapped: any[] = await db.sql`
        WITH old AS (
          DELETE FROM lessons WHERE id = ${b.replaces} AND owner_id = ${owner} AND status = 'ready'
          RETURNING public_token, is_public, collection_id, position, created_at
        )
        UPDATE lessons SET html = ${html}, status = 'ready', updated_at = now(),
          public_token = old.public_token, is_public = old.is_public, collection_id = old.collection_id,
          position = COALESCE(lessons.position, old.position), created_at = old.created_at
        FROM old WHERE lessons.id = ${id} AND lessons.owner_id = ${owner}
        RETURNING lessons.id`;
      if (!swapped.length) return json({ error: 'The saved lesson you were editing no longer exists.' }, 409);
      return json({ ok: true, replaced: true });
    }
    await db.sql`UPDATE lessons SET html = ${html}, status = 'ready', updated_at = now() WHERE id = ${id} AND owner_id = ${owner}`;
    return json({ ok: true });
  }

  // audio/:idx
  const idx = Number(m[3]);
  if (req.method === 'PUT') {
    if (idx >= MAX_CLIPS) return json({ error: 'Too many audio clips.' }, 400);
    const body = Buffer.from(await req.arrayBuffer());
    if (!body.length || body.length > MAX_AUDIO_BYTES) return json({ error: 'Audio is empty or too large.' }, 413);
    const own: any[] = await db.sql`SELECT 1 AS x FROM lessons WHERE id = ${id} AND owner_id = ${owner} AND status = 'saving'`;
    if (!own.length) return json({ error: 'Not found' }, 404);
    await db.sql`
      INSERT INTO lesson_audio (lesson_id, idx, mime, data) VALUES (${id}, ${idx}, 'audio/mpeg', ${body})
      ON CONFLICT (lesson_id, idx) DO UPDATE SET data = EXCLUDED.data`;
    return json({ ok: true });
  }
  if (req.method === 'GET' || req.method === 'HEAD') {
    const rows: any[] = await db.sql`
      SELECT a.data, a.mime FROM lesson_audio a JOIN lessons l ON l.id = a.lesson_id WHERE a.lesson_id = ${id} AND l.owner_id = ${owner} AND a.idx = ${idx}`;
    if (!rows.length) return json({ error: 'Not found' }, 404);
    return audioResponse(req, toBuffer(rows[0].data), rows[0].mime, 'private, max-age=3600');
  }
  return json({ error: 'Method not allowed' }, 405);
}
