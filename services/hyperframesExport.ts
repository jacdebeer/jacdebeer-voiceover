import playerCss from '../lesson-player/player.css?raw';
import { LessonData, buildPlayerHtml } from './lessonPlayer';
import { makeZip } from '../utils/zip';

const W = 1920;
const H = 1080;
const FONT_PX = 26; // the player sizes everything in rem, so this scales it to a 1080p frame
const LINE_GAP = 0.35; // seconds of air after a spoken line
const SILENT_STEP = 1.2; // seconds a revealed row stays up when its line has no audio
const BEAT_HOLD = 0.9;
const GSAP_URL = 'https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function dataUriBytes(uri: string): Uint8Array {
  const bin = atob(uri.slice(uri.indexOf(',') + 1));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Length in seconds of a 24 kHz 16-bit mono WAV (44-byte header). */
const wavSeconds = (bytes: Uint8Array) => Math.max(0, (bytes.length - 44) / (24000 * 2));

interface Cue {
  text: string;
  file: string; // path inside the project, '' when the line has no audio
  start: number;
  dur: number;
}
interface BeatPlan {
  title: string;
  html: string; // the player's own rendering of the finished beat
  start: number;
  end: number;
  reveals: { index: number; at: number }[];
  cues: Cue[];
}

async function loadPlayer(data: LessonData, audio: Record<string, string>): Promise<HTMLIFrameElement> {
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;left:-99999px;top:0;width:1100px;height:900px;border:0';
  f.srcdoc = buildPlayerHtml(data, audio);
  document.body.appendChild(f);
  await new Promise<void>((res) => f.addEventListener('load', () => res(), { once: true }));
  return f;
}

/**
 * Reads each finished beat out of the player (so the video looks exactly like the preview) and lays out
 * a timeline from the real length of every voiced line.
 */
async function plan(data: LessonData, audio: Record<string, string>) {
  const frame = await loadPlayer(data, audio);
  const win: any = frame.contentWindow;
  const files: { path: string; data: Uint8Array }[] = [];
  const fileFor = new Map<string, { path: string; secs: number }>();

  const audioFor = (text: string) => {
    const t = (text || '').trim();
    if (!t || !audio[t]) return null;
    let hit = fileFor.get(t);
    if (!hit) {
      const bytes = dataUriBytes(audio[t]);
      hit = { path: `audio/line-${String(fileFor.size + 1).padStart(3, '0')}.wav`, secs: wavSeconds(bytes) };
      fileFor.set(t, hit);
      files.push({ path: hit.path, data: bytes });
    }
    return hit;
  };

  const beats: BeatPlan[] = [];
  let t = 0.4;
  try {
    win.showAll = true;
    for (let i = 0; i < (data.beats ?? []).length; i++) {
      const b = data.beats![i];
      win.bi = i;
      win.renderBeat();
      const stage: HTMLElement = win.document.getElementById('pStage');
      stage.querySelectorAll('.pop,.now').forEach((n: Element) => n.classList.remove('pop', 'now'));
      const steps = stage.querySelectorAll('[data-reveal]').length;
      const plan: BeatPlan = { title: b.title || '', html: stage.innerHTML, start: t, end: t, reveals: [], cues: [] };

      const speak = (text: string) => {
        const a = audioFor(text);
        const line = (text || '').trim();
        if (!line) return null;
        const dur = a ? a.secs : Math.max(1.5, line.split(/\s+/).length * 0.35);
        plan.cues.push({ text: line, file: a ? a.path : '', start: t, dur });
        return dur;
      };

      const cap = speak(b.caption || '');
      if (cap) t += cap + LINE_GAP;
      const narration = b.narration ?? [];
      for (let k = 0; k < steps; k++) {
        plan.reveals.push({ index: k, at: t });
        const d = speak(narration[k] || '');
        t += d ? d + LINE_GAP : SILENT_STEP;
      }
      // Lines beyond the revealed rows are not spoken by the live player; the video speaks them so the script is complete.
      for (let k = steps; k < narration.length; k++) {
        const d = speak(narration[k] || '');
        if (d) t += d + LINE_GAP;
      }
      t += BEAT_HOLD;
      plan.end = t;
      beats.push(plan);
    }
  } finally {
    frame.remove();
  }
  return { beats, files, total: t };
}

function compositionHtml(data: LessonData, p: Awaited<ReturnType<typeof plan>>, id: string, zoom: number[]): string {
  const num = (n: number) => n.toFixed(3);
  const sections = p.beats
    .map(
      (b, i) => `
  <section class="clip beat" id="beat${i}" data-start="${num(b.start)}" data-duration="${num(b.end - b.start)}" data-track-index="1">
    <div class="beatInner" style="zoom:${zoom[i] ?? 1}">
      <div class="head"><h1>${esc(String(data.title || ''))}</h1></div>
      <div class="stage" id="stage${i}">${b.html}</div>
    </div>
  </section>`,
    )
    .join('');

  let n = 0;
  const subs: string[] = [];
  const audios: string[] = [];
  const js: string[] = [];
  p.beats.forEach((b, i) => {
    js.push(`tl.fromTo('#beat${i}',{opacity:0},{opacity:1,duration:0.45,ease:'power1.out'},${num(b.start)});`);
    b.reveals.forEach((r) => {
      js.push(`tl.fromTo(rows(${i})[${r.index}],{autoAlpha:0,y:18},{autoAlpha:1,y:0,duration:0.6,ease:'power3.out'},${num(r.at)});`);
    });
    b.cues.forEach((c) => {
      n++;
      subs.push(`<div class="sub" id="sub${n}">${esc(c.text)}</div>`);
      js.push(`tl.fromTo('#sub${n}',{autoAlpha:0,y:10},{autoAlpha:1,y:0,duration:0.25},${num(c.start)});`);
      js.push(`tl.to('#sub${n}',{autoAlpha:0,duration:0.25},${num(c.start + c.dur + LINE_GAP - 0.25)});`);
      if (c.file) {
        audios.push(
          `<audio id="line${n}" data-start="${num(c.start)}" data-duration="${num(c.dur)}" data-track-index="2" data-volume="1" src="${c.file}"></audio>`,
        );
      }
    });
  });

  return `<!DOCTYPE html>
<html lang="${data.lang === 'af' ? 'af' : 'en'}">
<head>
<meta charset="UTF-8">
<title>${esc(String(data.title || 'Slide explainer'))}</title>
<style>
${playerCss.replace(/html\{font-size:var\(--fs\)\}/, '').replace(/transition:[^;}]*;?/g, '')}
html{font-size:${FONT_PX}px}
html,body{margin:0;padding:0;background:#EEF1F6}
#stage{position:relative;width:${W}px;height:${H}px;overflow:hidden;background:#EEF1F6;font-family:var(--font)}
.beat{position:absolute;inset:0;padding:48px 96px 150px}
.beatInner{height:100%;overflow:hidden}
.beat .head{margin-bottom:14px}
.beat .stage{min-height:0}
.sub{position:absolute;left:96px;right:96px;bottom:48px;background:var(--ink);color:#fff;border-radius:16px;padding:20px 28px;font-size:1.15rem;line-height:1.35;text-align:center}
</style>
</head>
<body>
<div id="stage" data-composition-id="${id}" data-start="0" data-width="${W}" data-height="${H}">${sections}
  ${subs.join('\n  ')}
  ${audios.join('\n  ')}
  <script src="${GSAP_URL}"></script>
  <script>
    var tl = gsap.timeline({ paused: true });
    function rows(i){ return document.querySelectorAll('#stage' + i + ' [data-reveal]'); }
    ${js.join('\n    ')}
    tl.to({}, { duration: 0.001 }, ${num(p.total - 0.001)}); /* keeps the last beat on screen until the end */
    window.__timelines = window.__timelines || {};
    window.__timelines[${JSON.stringify(id)}] = tl;
  </script>
</div>
</body>
</html>
`;
}

/** If a beat is taller than the frame allows, shrink it so nothing is cut off. */
async function fitZoom(html: (zoom: number[]) => string, count: number): Promise<number[]> {
  const f = document.createElement('iframe');
  f.style.cssText = `position:fixed;left:-99999px;top:0;width:${W}px;height:${H}px;border:0`;
  f.srcdoc = html(new Array(count).fill(1)).replace(/<script src="[^"]*gsap[^"]*"><\/script>[\s\S]*?<\/script>/, '');
  document.body.appendChild(f);
  await new Promise<void>((res) => f.addEventListener('load', () => res(), { once: true }));
  const out: number[] = [];
  try {
    const doc = f.contentDocument!;
    const room = H - 48 - 150; // frame minus the beat's top and bottom padding
    for (let i = 0; i < count; i++) {
      const inner = doc.querySelector(`#beat${i} .beatInner`) as HTMLElement;
      const kids = Array.from(inner.children) as HTMLElement[];
      const natural = kids.reduce((n, k) => n + k.offsetHeight + 14, 0);
      out.push(natural > room ? Math.max(0.45, +(room / natural).toFixed(3)) : 1);
    }
  } finally {
    f.remove();
  }
  return out;
}

const readme = (id: string, seconds: number) => `# ${id}

HyperFrames project built from one voiced slide. About ${seconds.toFixed(1)} seconds at ${W}x${H}.

- index.html: the composition (HTML plus a GSAP timeline)
- audio/: one clip per spoken line, placed on the timeline at the moment its visual appears

Needs Node.js 22+ and FFmpeg.

    npx hyperframes preview     # watch it in the browser
    npx hyperframes render      # write the MP4

If a command or option differs on your version, run \`npx hyperframes --help\`.
`;

/** Builds a HyperFrames project (index.html plus the voiced audio lines) and returns it as a .zip. */
export async function buildHyperframesZip(
  data: LessonData,
  audio: Record<string, string>,
  slideNumber: number,
): Promise<Blob> {
  const id = `slide-${slideNumber}`;
  const p = await plan(data, audio);
  if (!p.beats.length) throw new Error('There are no beats to export.');
  const build = (zoom: number[]) => compositionHtml(data, p, id, zoom);
  const zoom = await fitZoom(build, p.beats.length);
  const enc = new TextEncoder();
  return makeZip([
    { path: 'index.html', data: enc.encode(build(zoom)) },
    { path: 'README.md', data: enc.encode(readme(id, p.total)) },
    ...p.files,
  ]);
}
