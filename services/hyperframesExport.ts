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

function compositionHtml(
  data: LessonData,
  p: Awaited<ReturnType<typeof plan>>,
  id: string,
  zoom: number[],
  audioUris?: Record<string, string>, // set for the in-app preview: plays the lines itself instead of using <audio> files
): string {
  const num = (n: number) => n.toFixed(3);
  const sections = p.beats
    .map(
      (b, i) => `
  <section class="clip beat" id="beat${i}" data-start="${num(b.start)}" data-duration="${num(b.end - b.start)}" data-track-index="1">
    <div class="beatInner" style="zoom:${zoom[i] ?? 1}">
      <div class="head"><h1>${data.icon && String(data.icon).trim().length <= 8 ? `<span class="ico big">${esc(String(data.icon).trim())}</span>` : ''}${esc(String(data.title || ''))}</h1></div>
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
      if (c.file && !audioUris) {
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
/* the emoji fonts are OS-bundled: local() tells the renderer to use the machine's own copy */
@font-face{font-family:'Apple Color Emoji';src:local('Apple Color Emoji')}
@font-face{font-family:'Segoe UI Emoji';src:local('Segoe UI Emoji')}
@font-face{font-family:'Noto Color Emoji';src:local('Noto Color Emoji')}
html{font-size:${FONT_PX}px}
html,body{margin:0;padding:0;background:#EEF1F6}
#stage{position:relative;width:${W}px;height:${H}px;overflow:hidden;background:#EEF1F6;font-family:var(--font)}
${audioUris ? '#stage{position:absolute;left:0;top:0;transform-origin:0 0}.beat{display:none}html,body{overflow:hidden;height:100%}' : ''}
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
</div>${audioUris ? previewDriver(p, audioUris) : ''}
</body>
</html>
`;
}

/** Controls and a small clock that stand in for the HyperFrames player, so the composition can be watched in the app. */
function previewDriver(p: Awaited<ReturnType<typeof plan>>, audioUris: Record<string, string>): string {
  const cues = p.beats.flatMap((b) =>
    b.cues.filter((c) => c.file && audioUris[c.text]).map((c) => ({ start: +c.start.toFixed(3), dur: +c.dur.toFixed(3), src: audioUris[c.text] })),
  );
  const beats = p.beats.map((b, i) => ({ id: 'beat' + i, start: +b.start.toFixed(3), end: +b.end.toFixed(3) }));
  const data = JSON.stringify({ total: +p.total.toFixed(3), cues, beats }).replace(/</g, '\\u003c');
  return `
<div id="bar"><button id="pp">&#9654;</button><input id="seek" type="range" min="0" max="1000" value="0"><span id="clock">0:00</span></div>
<style>
#bar{position:fixed;left:0;right:0;bottom:0;height:44px;background:#111827;color:#fff;display:flex;gap:12px;align-items:center;padding:0 14px;font:600 13px system-ui}
#bar button{background:#fff;color:#111827;border:0;border-radius:8px;width:34px;height:28px;font-size:14px;cursor:pointer}
#bar input{flex:1}
</style>
<script>
(function(){
  var D = ${data}, t = 0, playing = false, t0 = 0, auds = [], started = {};
  var stage = document.getElementById('stage'), pp = document.getElementById('pp'), seek = document.getElementById('seek'), clock = document.getElementById('clock');
  function fit(){
    var s = Math.min(innerWidth / ${W}, (innerHeight - 44) / ${H});
    stage.style.transform = 'scale(' + s + ')';
    stage.style.left = Math.max(0, (innerWidth - ${W} * s) / 2) + 'px';
  }
  function stopAudio(){ auds.forEach(function(a){ try{ a.pause(); }catch(e){} }); auds = []; }
  function show(){
    D.beats.forEach(function(b){ document.getElementById(b.id).style.display = (t >= b.start && t < b.end) ? 'block' : 'none'; });
    tl.time(t);
    seek.value = Math.round(t / D.total * 1000);
    var m = Math.floor(t / 60), sec = Math.floor(t % 60); clock.textContent = m + ':' + (sec < 10 ? '0' : '') + sec;
  }
  function startCue(i, offset){
    started[i] = 1;
    var a = new Audio(D.cues[i].src); a.currentTime = offset || 0; auds.push(a);
    var pr = a.play(); if(pr && pr.catch) pr.catch(function(){});
  }
  function frame(){
    if(!playing) return;
    t = (performance.now() - t0) / 1000;
    if(t >= D.total){ t = D.total; setPlaying(false); show(); return; }
    D.cues.forEach(function(c, i){ if(!started[i] && t >= c.start && t < c.start + c.dur) startCue(i, t - c.start); });
    show();
    requestAnimationFrame(frame);
  }
  function setPlaying(on){
    playing = on; pp.innerHTML = on ? '&#10074;&#10074;' : '&#9654;';
    stopAudio();
    if(on){
      if(t >= D.total - 0.05) t = 0;
      started = {};
      D.cues.forEach(function(c, i){ if(t >= c.start + c.dur) started[i] = 1; });
      t0 = performance.now() - t * 1000;
      D.cues.forEach(function(c, i){ if(!started[i] && t >= c.start) startCue(i, t - c.start); });
      requestAnimationFrame(frame);
    }
  }
  pp.onclick = function(){ setPlaying(!playing); };
  seek.oninput = function(){ var was = playing; if(was) setPlaying(false); t = seek.value / 1000 * D.total; show(); if(was) setPlaying(true); };
  window.addEventListener('resize', fit);
  fit(); show();
})();
</script>`;
}

const ZOOMS = [2.4, 2.2, 2, 1.8, 1.65, 1.5, 1.35, 1.2, 1.1, 1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.45];

/**
 * Pick a zoom per beat so the content fills the frame: scale small beats up, shrink tall ones down.
 * Each candidate is measured in a real 1920x1080 layout, because wider text wraps differently at each zoom.
 */
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
      const beat = doc.querySelector(`#beat${i}`) as HTMLElement;
      const inner = beat.querySelector('.beatInner') as HTMLElement;
      beat.style.display = 'block';
      beat.style.opacity = '1';
      // every revealed element must be on screen when measuring
      beat.querySelectorAll('[data-reveal]').forEach((n) => ((n as HTMLElement).style.cssText += ';visibility:visible;opacity:1'));
      let chosen = ZOOMS[ZOOMS.length - 1];
      for (const z of ZOOMS) {
        inner.style.zoom = String(z);
        const top = inner.getBoundingClientRect().top;
        const kids = Array.from(inner.children) as HTMLElement[];
        const bottom = Math.max(...kids.map((k) => k.getBoundingClientRect().bottom));
        // wide blocks (T-accounts, journals) must not be cut off on the right either
        const innerRight = inner.getBoundingClientRect().right;
        const right = Math.max(...Array.from(inner.querySelectorAll('*')).map((n) => (n as HTMLElement).getBoundingClientRect().right));
        // and no box may be wider inside than it is itself (a table sticking out of its card)
        const spills = Array.from(inner.querySelectorAll('*')).some((n) => {
          const e = n as HTMLElement;
          return e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1;
        });
        if (bottom - top <= room && right <= innerRight + 1 && !spills) {
          chosen = z;
          break;
        }
      }
      out.push(chosen);
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

/** The same composition as the zip, as a self-contained page with play/pause and a scrubber, for watching inside the app. */
export async function buildHyperframesPreviewHtml(
  data: LessonData,
  audio: Record<string, string>,
  slideNumber: number,
): Promise<string> {
  const id = `slide-${slideNumber}`;
  const p = await plan(data, audio);
  if (!p.beats.length) throw new Error('There are no beats to preview.');
  const zoom = await fitZoom((z) => compositionHtml(data, p, id, z), p.beats.length);
  return compositionHtml(data, p, id, zoom, audio);
}
