// The model is told to use each sentence of the slide script once. It sometimes puts the same sentence in a beat's caption AND in
// its narration, so the voice says everything twice. This walks the spoken lines in playing order against the script and blanks
// any line that only repeats text that has already been spoken.

const words = (t) =>
  String(t || '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

function indexOfRun(hay, needle, from, to) {
  if (!needle.length) return -1;
  for (let i = from; i + needle.length <= to; i++) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) {
      if (hay[i + j] !== needle[j]) { ok = false; break; }
    }
    if (ok) return i;
  }
  return -1;
}

/** Returns { data, removed } where removed lists the lines that were blanked. */
export function repairSpokenLines(data, scriptText) {
  const script = words(scriptText);
  const removed = [];
  if (!script.length || !Array.isArray(data?.beats)) return { data, removed };
  let pos = 0; // how far into the script the voice has got

  const visit = (text) => {
    const w = words(text);
    if (!w.length) return true;
    const ahead = indexOfRun(script, w, pos, script.length);
    if (ahead >= 0) {
      pos = ahead + w.length;
      return true; // new text: keep
    }
    if (indexOfRun(script, w, 0, pos) >= 0) return false; // already spoken: duplicate
    return true; // not in the script at all (reworded): leave it, the script check will report it
  };

  for (const beat of data.beats) {
    if (typeof beat.caption === 'string' && beat.caption.trim()) {
      if (!visit(beat.caption)) {
        removed.push(beat.caption);
        beat.caption = '';
      }
    }
    if (Array.isArray(beat.narration)) {
      beat.narration = beat.narration.map((n) => {
        if (typeof n !== 'string' || !n.trim()) return n;
        if (visit(n)) return n;
        removed.push(n);
        return '';
      });
    }
  }
  return { data, removed };
}

/**
 * Explain mode has no script to compare with, so only repeats are removed: a narration entry (or caption) that says the same
 * words as a line already spoken earlier in the lesson is blanked.
 */
export function dedupeSelf(data) {
  const removed = [];
  if (!Array.isArray(data?.beats)) return { data, removed };
  const seen = new Set();
  const key = (t) => words(t).join(' ');
  const once = (t) => {
    const k = key(t);
    if (!k) return true;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  };
  for (const beat of data.beats) {
    if (typeof beat.caption === 'string' && beat.caption.trim() && !once(beat.caption)) {
      removed.push(beat.caption);
      beat.caption = '';
    }
    if (Array.isArray(beat.narration)) {
      beat.narration = beat.narration.map((n) => {
        if (typeof n !== 'string' || !n.trim() || once(n)) return n;
        removed.push(n);
        return '';
      });
    }
  }
  return { data, removed };
}

// ---------------------------------------------------------------------------------------------------------------------
// Accounting emoji. The prompt asks the model for an "icon" on every beat, card, formula part, change item, flow step and
// text box. When it leaves one out, a fitting emoji is chosen from the wording (Afrikaans or English), so a slide never
// comes back without them. Emoji are drawn on screen only and are never spoken.

const KEYWORDS = [
  [/skryfbehoeftes|stationery/, '✏️'], [/bankrekening|\bbank\b/, '🏦'], [/kontant|\bcash\b|\bgeld\b|money|rand\b/, '💰'],
  [/faktuur|invoice|bronstuk|source document|kwitansie|receipt|dokument/, '🧾'], [/joernaal|journal/, '📒'],
  [/grootboek|ledger/, '📚'], [/voorraad|inventor|\bstock\b|inkoop|aankoop|purchase/, '📦'], [/verkope|verkoop|\bsales?\b/, '🏷️'],
  [/inkomste|revenue|income/, '💵'], [/uitgawe|\bkoste\b|\bkoste|expense|\bcost/, '💸'], [/\bwins\b|profit/, '📈'],
  [/verlies|\bloss/, '📉'], [/eienaarsbelang|ekwiteit|equity|eienaar|owner/, '👤'], [/\bbates?\b|assets?\b/, '💼'],
  [/\blaste?\b|liabilit|skuld|\bdebt/, '💳'], [/debiet|debit/, '📥'], [/krediet|credit/, '📤'],
  [/balans|balance|vergelyking|equation|\bbel\b/, '⚖️'], [/\bstaat\b|\bstate\b|statement|verslag|report/, '📊'],
  [/toeneem|vermeerder|increase|\bup\b/, '📈'], [/afneem|verminder|decrease|\bdown\b/, '📉'], [/\bdoel\b|goal|target/, '🎯'],
  [/akkura|accura|korrek|correct|perfek/, '✅'], [/dagliks|daily/, '📆'], [/maandeliks|monthly/, '🗓️'],
  [/jaarliks|annual|jaareind|year-?end|jaar\b/, '📅'], [/sessie|welkom|welcome|lesson|\bles\b/, '🎓'],
  [/bereken|calculat/, '🧮'], [/klassifiseer|classif/, '🗂️'], [/identifiseer|identif/, '🔎'], [/besluit|decide|decision/, '💡'],
  [/prosedure|procedure|proses|process|praktyk|practice/, '🔁'], [/rekening|account/, '📒'],
];
const ROTATION = ['🧮', '📒', '📊', '💼', '🧾', '💰'];
const TONE_ICON = { info: '💡', rule: '📌', warn: '⚠️' };

const valid = (x) => typeof x === 'string' && x.trim() && x.trim().length <= 8;

function pick(text, fallbackIndex) {
  const t = String(text || '').toLowerCase();
  for (const [re, emoji] of KEYWORDS) if (re.test(t)) return emoji;
  return ROTATION[fallbackIndex % ROTATION.length];
}

/** Fills in a missing icon everywhere the player can show one. Returns how many it added. */
export function addDefaultIcons(data) {
  let added = 0;
  let n = 0;
  const fill = (obj, text) => {
    if (obj && !valid(obj.icon)) { obj.icon = pick(text, n); added++; }
    n++;
  };
  if (!data || !Array.isArray(data.beats)) return 0;
  fill(data, `${data.title || ''} ${data.subtitle || ''}`);
  for (const beat of data.beats) {
    fill(beat, `${beat.title || ''} ${beat.note || ''}`);
    for (const blk of beat.blocks || []) {
      switch (blk.type) {
        case 'text':
          if (!valid(blk.icon)) {
            const wording = `${blk.heading || ''} ${blk.body || ''}`.toLowerCase();
            blk.icon = KEYWORDS.some(([re]) => re.test(wording)) ? pick(wording, n) : TONE_ICON[blk.tone] || '💡';
            added++;
          }
          n++;
          break;
        case 'flow': for (const s of blk.steps || []) fill(s, `${s.label || ''} ${s.text || ''}`); break;
        case 'cards': for (const c of blk.cards || []) fill(c, `${c.label || ''} ${c.text || ''}`); break;
        case 'change':
          for (const it of blk.items || []) {
            if (!valid(it.icon)) { it.icon = KEYWORDS.some(([re]) => re.test(String(it.label || '').toLowerCase())) ? pick(it.label, n) : (it.dir === 'up' ? '📈' : '📉'); added++; }
            n++;
          }
          break;
        case 'formula': for (const p of blk.parts || []) if (p && p.text !== undefined) fill(p, p.text); break;
        default: break;
      }
    }
  }
  return added;
}

// Notes that tell the viewer the figures are only an illustration ("Illustrasie: Die syfers is slegs 'n voorbeeld ...") are not
// wanted anywhere in the content. The model is told not to write them; this removes the ones that still come, and the ones in
// lessons that were made before.
const NOTE_HEADING = /^\s*(?:illustrasie|illustratiewe|illustration|illustrative|voorbeeld(?:e|figure|syfers)?|example(?: figures)?)\b/i;
const NOTE_SENTENCE = /(?:syfers|bedrae|figure|figures|amounts|numbers|dokumentnommer|document number|vennootskap?nommer)[^.!?]*(?:voorbeeld|example|illustra\w*|uitgedink|invented|made[- ]up|fictional|fiktief|gekies|chosen)|(?:slegs|net|only|just|merely)\s+(?:\S+\s+){0,2}(?:voorbeeld|example|illustrasie)|(?:voorbeeld|example)\s+(?:om|to|van die (?:syfers|bedrae))/i;

/** Removes the "figures are only an example" notes. Returns how many blocks were removed or trimmed. */
export function stripIllustrationNotes(data) {
  let changed = 0;
  if (!data || !Array.isArray(data.beats)) return 0;
  // the header line ("Maatskappy \u00B7 Illustrasie \u00B7 Geen BTW") and the subtitle can carry the same word
  for (const holder of [data, data.scenario]) {
    if (!holder || typeof holder !== 'object') continue;
    for (const k of ['subtitle', 'period', 'entity', 'vat']) {
      if (typeof holder[k] === 'string' && /^\s*(?:illustrasie|illustratiewe|illustration|illustrative)\b/i.test(holder[k])) { delete holder[k]; changed++; }
    }
  }
  for (const beat of data.beats) {
    if (!Array.isArray(beat.blocks)) continue;
    const kept = [];
    for (const blk of beat.blocks) {
      if (!blk || blk.type !== 'text') { kept.push(blk); continue; }
      const headingNote = NOTE_HEADING.test(String(blk.heading || ''));
      const sentences = String(blk.body || '').split(/(?<=[.!?\u2026])\s+/).filter(Boolean);
      const isNote = (sn) => NOTE_SENTENCE.test(sn);
      if (!headingNote && !(blk.tone === 'warn' && sentences.some(isNote)) && !(sentences.length > 0 && sentences.every(isNote))) { kept.push(blk); continue; }
      changed++;
      const rest = sentences.filter((sn) => !isNote(sn));
      // what is left after the note is real content: keep it as a plain note without the warning
      if (rest.length) kept.push({ type: 'text', tone: 'info', icon: '\uD83D\uDCA1', body: rest.join(' ') });
    }
    beat.blocks = kept;
  }
  return changed;
}

/** A straight apostrophe in the Afrikaans article ('n) becomes the typographic one (\u2019n) used everywhere else, on screen only. */
export function tidyApostrophes(data) {
  let n = 0;
  const fix = (t) => (typeof t === 'string' ? t.replace(/(^|[\s(\u201C"])'n\b/g, (m, pre) => { n++; return pre + '\u2019n'; }) : t);
  const walk = (o) => {
    if (Array.isArray(o)) { o.forEach((v, i) => { if (typeof v === 'string') o[i] = fix(v); else walk(v); }); return; }
    // the spoken lines (caption, narration) are left alone: the audio is found by their exact text
    if (o && typeof o === 'object') for (const k of Object.keys(o)) { if (k === 'caption' || k === 'narration') continue; if (typeof o[k] === 'string') o[k] = fix(o[k]); else walk(o[k]); }
  };
  walk(data);
  return n;
}

// Bookkeeping conventions that apply to every lesson, whatever the model wrote:
// - the folio (Fol) column is always left empty;
// - a date in a journal, ledger, T-account or equation is only the day of the month ("31", not "31-Mar-23" or "31 Mei 2026");
// - a payment by EFT has the EFT number (EFT118) as its source document in the Doc column, not the supplier's invoice number.
const dayOnly = (v) => {
  if (typeof v !== 'string') return v;
  const t = v.trim();
  if (/^\d{1,2}$/.test(t)) return t;
  let m = t.match(/^(\d{4})-\d{1,2}-(\d{1,2})/);            // 2026-05-31
  if (m) return String(Number(m[2]));
  m = t.match(/^(\d{1,2})\s*[-\/.\s]\s*(?:[A-Za-z\u00C0-\u024F]{3,}|\d{1,2})\b/);   // 31-Mar-23, 31 Mei 2026, 31/03/2023
  if (m) return String(Number(m[1]));
  return v;
};
const EFT_NO = /\bEFT[\s\-#:]*(\d+)/i;

export function normalizeBookkeeping(data) {
  const out = { fol: 0, dates: 0, eft: 0 };
  if (!data || !Array.isArray(data.beats)) return out;
  const clearFol = (o) => { if (o && typeof o === 'object' && typeof o.fol === 'string' && o.fol !== '') { o.fol = ''; out.fol++; } };
  const fixDate = (o, key = 'date') => { if (o && typeof o[key] === 'string') { const d = dayOnly(o[key]); if (d !== o[key]) { o[key] = d; out.dates++; } } };
  const eftDoc = (row) => {
    const m = String(row.details || '').match(EFT_NO) || String(row.docNo || '').match(EFT_NO);
    if (m && String(row.docNo || '').toUpperCase() !== 'EFT' + m[1]) { row.docNo = 'EFT' + m[1]; out.eft++; }
  };
  for (const beat of data.beats) {
    for (const blk of beat.blocks || []) {
      if (!blk) continue;
      switch (blk.type) {
        case 'journal': {
          const j = blk.journal || {};
          const payments = /betaling|payment|kbj|cpj|kontantbetalings/i.test(`${j.name || ''} ${j.abbrev || ''}`);
          for (const r of j.rows || []) {
            clearFol(r);
            fixDate(r);
            if (payments || EFT_NO.test(String(r.details || ''))) eftDoc(r);
          }
          break;
        }
        case 'ledger_columnar': {
          const a = blk.account || {};
          fixDate(a, 'openingDate');
          for (const r of a.rows || []) { clearFol(r); fixDate(r); if (EFT_NO.test(String(r.details || ''))) eftDoc(r); }
          break;
        }
        case 't_accounts':
          for (const a of blk.accounts || []) {
            for (const e of [...(a.debit || []), ...(a.credit || [])]) { clearFol(e); fixDate(e); }
            fixDate(a, 'balDate'); fixDate(a, 'balDateNext');
          }
          break;
        case 'equation':
          for (const r of blk.rows || []) fixDate(r);
          break;
        case 'trial_balance':
          for (const a of blk.accounts || []) clearFol(a);
          break;
        case 'source_document': {
          const d = blk.doc || {};
          if (/\bEFT\b/i.test(String(d.docType || '')) && !/^EFT/i.test(String(d.docNo || ''))) {
            const n = String(d.docNo || '').match(/\d+/);
            if (n) { d.docNo = 'EFT' + n[0]; out.eft++; }
          }
          break;
        }
        default: break;
      }
    }
  }
  return out;
}
