// Edits to a finished lesson, proposed by Claude in the chat as a small JSON Patch (RFC 6902: add, replace, remove).
// Shared by the server (to check a proposal before it is shown) and the browser (to apply it once the user confirms).
// Nothing here changes a lesson unless the result is still a valid lesson.

const ROOTS = new Set(['icon', 'title', 'subtitle', 'currency', 'labels', 'scenario', 'beats', 'pronunciations']);
const BLOCK_TYPES = new Set(['source_document', 'calculation', 'journal', 't_accounts', 'ledger_columnar', 'equation', 'trial_balance', 'text', 'flow', 'formula', 'cards', 'change']);
const MAX_OPS = 60;
const MAX_BEATS = 12;

const clone = (v) => JSON.parse(JSON.stringify(v));
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

function parsePointer(path) {
  if (typeof path !== 'string' || path[0] !== '/') throw new Error(`Bad path "${path}"`);
  return path.slice(1).split('/').map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'));
}

function walk(root, keys, forAdd) {
  let cur = root;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (Array.isArray(cur)) {
      if (!/^\d+$/.test(k) || Number(k) >= cur.length) throw new Error(`Nothing at /${keys.slice(0, i + 1).join('/')}`);
      cur = cur[Number(k)];
    } else if (isObj(cur) && Object.prototype.hasOwnProperty.call(cur, k)) cur = cur[k];
    else throw new Error(`Nothing at /${keys.slice(0, i + 1).join('/')}`);
  }
  if (cur === null || typeof cur !== 'object') throw new Error(`Cannot change inside a value at /${keys.slice(0, -1).join('/')}`);
  return cur;
}

/** Applies the operations to a copy of the lesson. Throws an Error that says what went wrong. */
export function applyPatch(lesson, ops) {
  if (!Array.isArray(ops) || !ops.length) throw new Error('The change list is empty.');
  if (ops.length > MAX_OPS) throw new Error(`Too many changes at once (${ops.length}).`);
  const out = clone(lesson);
  for (const [n, op] of ops.entries()) {
    const label = `change ${n + 1}`;
    if (!isObj(op) || !['add', 'replace', 'remove'].includes(op.op)) throw new Error(`${label}: only add, replace and remove are allowed.`);
    const keys = parsePointer(op.path);
    if (!ROOTS.has(keys[0])) throw new Error(`${label}: "${keys[0]}" cannot be changed.`);
    try {
      // the pronunciation list is a plain word map that may not exist yet: create it, and let "replace" set a new word
      if (keys[0] === 'pronunciations' && keys.length === 2 && op.op !== 'remove') {
        if (!isObj(out.pronunciations)) out.pronunciations = {};
        out.pronunciations[keys[1]] = clone(op.value);
        continue;
      }
      const parent = walk(out, keys, op.op === 'add');
      const last = keys[keys.length - 1];
      if (Array.isArray(parent)) {
        if (op.op === 'add') {
          const at = last === '-' ? parent.length : Number(last);
          if (!Number.isInteger(at) || at < 0 || at > parent.length) throw new Error(`position ${last} is outside the list`);
          parent.splice(at, 0, clone(op.value));
        } else {
          const at = Number(last);
          if (!/^\d+$/.test(last) || at >= parent.length) throw new Error(`position ${last} is outside the list`);
          if (op.op === 'replace') parent[at] = clone(op.value);
          else parent.splice(at, 1);
        }
      } else if (op.op === 'remove') {
        if (!Object.prototype.hasOwnProperty.call(parent, last)) throw new Error(`"${last}" is not there`);
        delete parent[last];
      } else if (op.op === 'replace') {
        if (!Object.prototype.hasOwnProperty.call(parent, last)) throw new Error(`"${last}" is not there to replace (use add)`);
        parent[last] = clone(op.value);
      } else parent[last] = clone(op.value);
    } catch (e) {
      throw new Error(`${label} (${op.op} ${op.path}): ${e.message}`);
    }
  }
  const problems = validateLesson(out);
  if (problems.length) throw new Error(`The result would not be a valid lesson: ${problems.slice(0, 4).join('; ')}`);
  return out;
}

/** A list of problems; empty when the lesson is usable by the player. */
export function validateLesson(l) {
  const bad = [];
  if (!isObj(l)) return ['the lesson is not an object'];
  if (!Array.isArray(l.beats) || !l.beats.length) return ['there are no beats'];
  if (l.beats.length > MAX_BEATS) bad.push(`more than ${MAX_BEATS} beats`);
  if (l.pronunciations !== undefined) {
    if (!isObj(l.pronunciations) || Object.keys(l.pronunciations).length > 50) bad.push('pronunciations must be an object of at most 50 words');
    else for (const [k, v] of Object.entries(l.pronunciations)) if (typeof v !== 'string' || !k.trim() || k.length > 40 || v.length > 60) bad.push(`pronunciation "${k}" is not valid`);
  }
  l.beats.forEach((b, i) => {
    const at = `beat ${i + 1}`;
    if (!isObj(b)) return bad.push(`${at} is not an object`);
    if (typeof b.title !== 'string' || !b.title.trim()) bad.push(`${at} has no title`);
    if (b.caption !== undefined && typeof b.caption !== 'string') bad.push(`${at}: caption must be text`);
    if (b.narration !== undefined && (!Array.isArray(b.narration) || b.narration.some((n) => typeof n !== 'string'))) bad.push(`${at}: narration must be a list of text`);
    if (!Array.isArray(b.blocks)) return bad.push(`${at} has no blocks list`);
    b.blocks.forEach((k, j) => {
      const bt = `${at}, block ${j + 1}`;
      if (!isObj(k) || !BLOCK_TYPES.has(k.type)) return bad.push(`${bt}: unknown block type "${k && k.type}"`);
      const list = (v, what) => { if (!Array.isArray(v) || !v.length) bad.push(`${bt} (${k.type}): ${what} must be a non-empty list`); };
      switch (k.type) {
        case 'cards': list(k.cards, 'cards'); break;
        case 'flow': list(k.steps, 'steps'); break;
        case 'formula': list(k.parts, 'parts'); break;
        case 'change': list(k.items, 'items'); if (Array.isArray(k.items) && k.items.some((x) => !['up', 'down'].includes(x && x.dir))) bad.push(`${bt}: every change item needs dir "up" or "down"`); break;
        case 'calculation': list(k.lines, 'lines'); break;
        case 'equation': list(k.rows, 'rows'); break;
        case 't_accounts': list(k.accounts, 'accounts'); break;
        case 'trial_balance': list(k.accounts, 'accounts'); break;
        case 'journal': if (!isObj(k.journal) || !Array.isArray(k.journal.columns) || !Array.isArray(k.journal.rows)) bad.push(`${bt}: a journal needs columns and rows`); break;
        case 'ledger_columnar': if (!isObj(k.account)) bad.push(`${bt}: a ledger needs an account`); break;
        case 'source_document': if (!isObj(k.doc)) bad.push(`${bt}: a source document needs a doc`); break;
        case 'text': if (typeof k.body !== 'string' || !k.body.trim()) bad.push(`${bt}: a text block needs a body`); break;
        default: break;
      }
    });
  });
  return bad;
}

/** Every spoken line in playing order, with the beat it belongs to (0-based). */
export function spokenOf(lesson) {
  const out = [];
  (lesson.beats || []).forEach((b, i) => {
    for (const t of [b.caption, ...(b.narration || [])]) if (typeof t === 'string' && t.trim()) out.push({ beat: i, text: t.trim() });
  });
  return out;
}

/** What a proposal changes, in plain terms, for the confirmation card. */
export function describeChanges(before, after) {
  const a = spokenOf(before).map((x) => x.text);
  const b = spokenOf(after);
  const bTexts = b.map((x) => x.text);
  const removed = a.filter((t) => !bTexts.includes(t));
  const added = b.filter((x) => !a.includes(x.text));
  // pair them up in order: the nth removed line is most likely what the nth added line replaces
  const spoken = [];
  const pairs = Math.min(removed.length, added.length);
  for (let i = 0; i < pairs; i++) spoken.push({ kind: 'changed', beat: added[i].beat, from: removed[i], to: added[i].text });
  for (let i = pairs; i < added.length; i++) spoken.push({ kind: 'added', beat: added[i].beat, to: added[i].text });
  for (let i = pairs; i < removed.length; i++) spoken.push({ kind: 'removed', from: removed[i] });
  const sig = (bt) => JSON.stringify(bt.blocks || []);
  const titlesBefore = (before.beats || []).map((x) => x.title);
  const titlesAfter = (after.beats || []).map((x) => x.title);
  let blocksChanged = 0;
  for (let i = 0; i < Math.min(before.beats.length, after.beats.length); i++) if (sig(before.beats[i]) !== sig(after.beats[i])) blocksChanged++;
  return {
    spoken,
    newLines: added.map((x) => x.text),
    beatsAdded: titlesAfter.filter((t) => !titlesBefore.includes(t)),
    beatsRemoved: titlesBefore.filter((t) => !titlesAfter.includes(t)),
    blocksChanged,
    pronunciationsChanged: JSON.stringify(before.pronunciations || {}) !== JSON.stringify(after.pronunciations || {}),
  };
}
