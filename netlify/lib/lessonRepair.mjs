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
