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
