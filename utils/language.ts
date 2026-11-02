// The ENG/AFR toggle can be left on the wrong language. If the slide text is clearly Afrikaans, voice it as Afrikaans anyway:
// a voice told "English" reads Afrikaans with the wrong accent, and one left to guess drifts to Dutch.
const MARKERS = new Set([
  'die', 'nie', 'ons', 'vir', 'wat', 'het', 'maar', 'sal', 'jy', 'jou', 'dit', 'van', 'met', 'ook', 'kom', 'moet',
  'hierdie', 'daar', 'word', 'is', 'en', 'om', 'te', 'by', 'sy', 'hy', 'ek', 'my', 'omdat', 'wees',
]);
const STRONG = new Set(['die', 'nie', 'ons', 'vir', 'wat', 'maar', 'sal', 'jy', 'jou', 'hierdie', 'omdat', 'moet', 'word', 'ek']);

export function looksAfrikaans(text: string): boolean {
  const tokens = text.toLowerCase().replace(/[’']n\b/g, ' ŉ ').split(/[^a-zëïöüéèêôûîŉ]+/).filter(Boolean);
  if (tokens.length < 6) return false;
  let marked = 0;
  let strong = 0;
  for (const t of tokens) {
    if (MARKERS.has(t) || t === 'ŉ') marked++;
    if (STRONG.has(t) || t === 'ŉ') strong++;
  }
  return strong >= 3 && marked / tokens.length >= 0.2;
}

/** True when the text should be voiced as Afrikaans: the toggle says so, or the text is clearly Afrikaans. */
export function isAfrikaansText(text: string, toggle: 'en' | 'af'): boolean {
  return toggle === 'af' || looksAfrikaans(text);
}
