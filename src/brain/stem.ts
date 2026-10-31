// ============================================================
// Séance: Dead Tongues — stem.ts
// Custom 8-rule cascade stemmer + token helpers
// ============================================================

/**
 * Stop words. These are removed from query tokens before BM25 and
 * before needsOverview content-token counting.
 */
export const STOP = new Set(
  'the a an of to in is are was were do did does you your me my i what who why how when which and or for on at it its be by with as that this from have has tell about can could would please'
    .split(' ')
);

/**
 * Self-reference terms. Used by needsOverview to detect queries about
 * the language itself (not content topics).
 */
export const SELFREF = new Set(['snobol', 'snobol4', 'language', 'programming']);

/**
 * Extra stop words added in R1 config via buildIndex extraStop.
 * These supplement STOP during query processing.
 */
export const EX_STOP = new Set('name look like yours mine many much show'.split(' '));

/** Has the string at least one vowel? */
function hasVowel(s: string): boolean {
  return /[aeiou]/.test(s);
}

/**
 * Collapse trailing consonant cluster after removing a suffix.
 * Implements the "consonant doubling" rule: if the word ends in
 * consonant-vowel-consonant, the last consonant was doubled when the
 * suffix was added (e.g. "running" → "runn" → collapse → "run").
 */
function collapseFinal(s: string): string {
  // CVC double-consonant: e.g. "stopp" → "stop", "runn" → "run"
  // BUT: never collapse 'l' or 's' doubles (fall→fall, miss→miss)
  if (s.length >= 3) {
    const a = s[s.length - 1];
    const b = s[s.length - 2];
    if (a === b && !/[aeiou]/.test(a) && !'ls'.includes(a)) {
      return s.slice(0, -1);
    }
  }
  return s;
}

/**
 * Stem a single lowercase word using an 8-rule cascade.
 * All 8 rules are tried in order; each that matches transforms the word
 * and the result is passed to the next rule (cascade=true means ALL
 * applicable rules run, not just the first).
 */
export function stem(word: string): string {
  let s = word.toLowerCase();

  // Rule 1: possessive — remove 's
  if (s.endsWith("'s")) s = s.slice(0, -2);

  // Rule 2: ies → y (e.g. "cries" → "cry")
  if (s.endsWith('ies') && s.length > 4) s = s.slice(0, -3) + 'y';
  // Rule 3: ied → y (e.g. "cried" → "cry")
  else if (s.endsWith('ied') && s.length > 4) s = s.slice(0, -3) + 'y';

  // Rule 4: ing → '' (len>5, must have vowel before suffix, collapse)
  if (s.endsWith('ing') && s.length > 5) {
    const base = s.slice(0, -3);
    if (hasVowel(base)) s = collapseFinal(base);
  }

  // Rule 5: ed → '' (len>4, must have vowel before suffix, collapse)
  if (s.endsWith('ed') && s.length > 4) {
    const base = s.slice(0, -2);
    if (hasVowel(base)) s = collapseFinal(base);
  }

  // Rule 6: es → '' (len>4, not ending in ss after removal)
  if (s.endsWith('es') && s.length > 4) {
    const base = s.slice(0, -2);
    if (!base.endsWith('ss')) s = base;
  }

  // Rule 7: s → '' (len>3, not ending in ss)
  if (s.endsWith('s') && s.length > 3 && !s.endsWith('ss')) {
    s = s.slice(0, -1);
  }

  // Rule 8: ly → '' (len>5)
  if (s.endsWith('ly') && s.length > 5) s = s.slice(0, -2);

  // Rule 8b: trailing e → '' (len>3)
  if (s.endsWith('e') && s.length > 3) s = s.slice(0, -1);

  return s;
}

/**
 * Tokenize and stem text. Returns stems with stop words removed.
 * Optionally supply extra stop words (EX_STOP for R1 queries).
 */
export function tokens(
  text: string,
  extraStop: Set<string> = new Set(),
  dropSelf = true
): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => t.length > 1 && !STOP.has(t) && !(dropSelf && SELFREF.has(t)) && !extraStop.has(t));
}

/**
 * Tokenize WITHOUT stemming (for corpus vocabulary building).
 * Used by verifier to build corpusVocab.
 */
export function rawTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}
