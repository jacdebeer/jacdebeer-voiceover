// Text that is sent to a voice is rewritten here first. The screen, the subtitles and the audio lookup keep the original text;
// only what the voice is asked to say changes.
//
// 1. Dutch spellings are replaced by the Afrikaans form, so a Dutch word never reaches the voice.
// 2. Words a voice reads wrongly get a respelling (Bates is read like English "bates"/"bytes": it must be "Baates").
// 3. Abbreviations are spelled out letter by letter (BEL is B.E.L., not the word "bel").
// 4. Whole numbers are written out in Afrikaans words, so the voice cannot read them as Dutch or English numbers.

// Only forms that are unambiguously Dutch and have an exact Afrikaans equivalent. [Dutch, Afrikaans]
const DUTCH_TO_AFRIKAANS = [
  ['uitgave', 'uitgawe'], ['uitgaven', 'uitgawes'], ['kosten', 'koste'], ['winst', 'wins'], ['inkomsten', 'inkomste'],
  ['betrokken', 'betrokke'], ['factuur', 'faktuur'], ['facturen', 'fakture'], ['bedrijf', 'besigheid'],
  ['boekhouding', 'rekeningkunde'], ['afschrijving', 'waardevermindering'], ['rekeningen', 'rekeninge'],
  ['omzet', 'omset'], ['schuld', 'skuld'], ['niet', 'nie'], ['wij', 'ons'], ['hebben', 'het'],
];

// Abbreviations that are said letter by letter. Anything not listed is left alone, so an all-caps word is never mangled.
const SPELLED = ['BEL', 'KBA', 'BTW', 'IFRS', 'GRAP', 'AERP', 'SAIGR', 'SARS', 'EFT', 'CAPS', 'GAAP', 'KOJ', 'KBJ', 'DJ', 'KJ', 'AJ'];

const keepCase = (from, to) => (from[0] === from[0].toUpperCase() ? to[0].toUpperCase() + to.slice(1) : to);

const ONES = ['', 'een', 'twee', 'drie', 'vier', 'vyf', 'ses', 'sewe', 'agt', 'nege', 'tien', 'elf', 'twaalf', 'dertien', 'veertien',
  'vyftien', 'sestien', 'sewentien', 'agtien', 'negentien'];
const TENS = ['', '', 'twintig', 'dertig', 'veertig', 'vyftig', 'sestig', 'sewentig', 'tagtig', 'negentig'];

function below100(n) {
  if (n < 20) return ONES[n];
  const t = TENS[Math.floor(n / 10)], o = n % 10;
  return o ? `${ONES[o]} en ${t}` : t;
}

// Spoken Afrikaans for a whole number, for example 4600 -> "vier duisend ses honderd".
export function afrikaansNumber(n) {
  if (n === 0) return 'nul';
  const parts = [];
  const units = [[1e9, 'miljard'], [1e6, 'miljoen'], [1e3, 'duisend']];
  let rest = n;
  for (const [size, name] of units) {
    const q = Math.floor(rest / size);
    if (q) {
      // "duisend", not "een duisend", when it is the leading part; millions and billions keep "een"
      parts.push(q === 1 && name === 'duisend' && !parts.length ? name : `${afrikaansNumber(q)} ${name}`);
      rest -= q * size;
    }
  }
  const h = Math.floor(rest / 100), r = rest % 100;
  if (h) parts.push(h === 1 && !parts.length ? 'honderd' : `${ONES[h]} honderd`);
  if (r) {
    // "honderd en vyf", "duisend en twintig", but "honderd vyf en veertig"
    const needsEn = parts.length && (r < 20 || r % 10 === 0);
    parts.push(needsEn ? `en ${below100(r)}` : below100(r));
  }
  return parts.join(' ');
}

function numbersToWords(text) {
  // "R4 600", "R 4 600", "4 600" and "4600" (grouped with spaces or plain). Years and numbers with a decimal part are left alone.
  return text.replace(/(R\s?)?(\d{1,3}(?:[  ]\d{3})+|\d+)(?![\d,.]*\d)(?!\s?%)/g, (m, rand, digits, offset, all) => {
    const after = all[offset + m.length];
    if (after === ',' || after === '.') {
      // a decimal ("4 600,50") or a sentence-ending full stop: only skip if more digits follow
      if (/^[.,]\d/.test(all.slice(offset + m.length))) return m;
    }
    const n = Number(digits.replace(/[  ]/g, ''));
    if (!Number.isFinite(n) || n > 999999999999) return m;
    if (!rand && n >= 1900 && n <= 2100 && !/[  ]/.test(digits)) return m; // a year
    return afrikaansNumber(n) + (rand ? ' rand' : '');
  });
}

/** Text for the voice. lang is 'af' or 'en'. */
export function forSpeech(text, lang = 'af', extra = {}) {
  let t = text;
  // Per-lesson spellings the user asked for in the chat ({ word: howToSay }). Applied first, whole words only.
  if (extra && typeof extra === 'object') {
    for (const [word, say] of Object.entries(extra).slice(0, 50)) {
      if (typeof say !== 'string' || typeof word !== 'string' || !word.trim() || word.length > 40 || say.length > 60) continue;
      const esc = word.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      t = t.replace(new RegExp(`(?<![\\p{L}\\p{N}])${esc}(?![\\p{L}\\p{N}])`, 'giu'), () => say);
    }
  }
  if (lang === 'af') {
    for (const [nl, af] of DUTCH_TO_AFRIKAANS) {
      t = t.replace(new RegExp(`\\b${nl}\\b`, 'gi'), (m) => keepCase(m, af));
    }
    // Bate / Bates are read like the English words. The long a is written out.
    t = t.replace(/\b([Bb])ate(s?)\b/g, (_, b, s) => `${b}aate${s}`);
  }
  for (const a of SPELLED) {
    t = t.replace(new RegExp(`\\b${a}\\b`, 'g'), a.split('').join('.') + '.');
  }
  if (lang === 'af') t = numbersToWords(t);
  return t;
}

/** Which Dutch forms are in a text. Used on transcripts to catch a Dutch-sounding take. */
export const DUTCH_MARKERS = ['niet', 'zijn', 'hebben', 'ik', 'wij', 'de', 'geen', 'uitgave', 'kosten', 'winst', 'factuur', 'bedrijf'];
export function dutchWordsIn(text) {
  const words = text.toLowerCase().split(/[^a-zëïöüéèêôûî]+/).filter(Boolean);
  return DUTCH_MARKERS.filter((m) => words.includes(m));
}
