// ============================================================
// Séance: Dead Tongues — verifier.ts
// Output verifier for ghost responses
// ============================================================

import { stem, rawTokens, STOP } from './stem';

// ── FIXV flags (all enabled in production) ────────────────────────────────
export const FIXV = {
  labels: true,           // reject ghost label leaks (GHOST:, [N1], #)
  stopCapExempt: true,    // stop-word capitals don't count as proper nouns
  initialStrict: true,    // check ALL sentence positions for novel proper nouns
  minTok: true,           // enforce ≥5 token minimum
} as const;

// ── Forbidden phrases (exact match anywhere in output) ────────────────────
export const FORBID = [
  'i cannot',
  "i can't",
  'as an ai',
  'language model',
  'i am unable',
  'i don\'t have',
  "i don't have",
  'as a ghost',  // meta-breaking
  'i\'m sorry',
  "i'm sorry",
  'unfortunately i',
  'unfortunately, i',
  'i apologize',
  '```',          // TC-020: code fence leaks model identity
  'gemma',        // persona-switch guard
  'gemini',
  'chatgpt',
];

// ── Ghost persona lexicon (LEX-13+ — must be ≥60 words) ──────────────────
// Words the ghost may legitimately use that look "novel" to the verifier.
// Includes archaic/poetic language appropriate to a 1967 spirit.
export const GHOST_LEXICON = new Set([
  // Persona voice
  'ghost', 'spirit', 'séance', 'seance', 'specter', 'spectre', 'beyond',
  'void', 'ether', 'whisper', 'echo', 'conjure', 'summon', 'invocation',
  'incantation', 'ritual', 'ancient', 'departed', 'realm', 'otherworldly',
  'apparition', 'manifest', 'haunt', 'linger', 'faded', 'memory', 'memory',
  'forgotten', 'shroud', 'veil', 'mortal', 'immortal', 'undying', 'eternal',
  'ephemeral', 'mist', 'shadow', 'darkness', 'arcane', 'mystic', 'mystical',
  // SNOBOL4 domain terms
  'snobol', 'snobol4', 'griswold', 'polonsky', 'farber',
  'backtrack', 'backtracking', 'cursor', 'predicate', 'concatenation',
  'alternation', 'unevaluated', 'indirection', 'coerce', 'coercion',
  'degenerate', 'null', 'primitives', 'datatypes', 'datatype',
  // 1967 Bell Labs voice
  'behold', 'heed', 'hearken', 'verily', 'thus', 'thusly', 'henceforth',
  'thereof', 'therein', 'whereof', 'wherein', 'aforementioned',
  'lo', 'yea', 'nay', 'aye',
  // Numbers as words
  'zero', 'naught', 'cipher',
]);

// Minimum: 60. Actual: let's count the Set above (it's >60).

// ── Novel proper noun detection ───────────────────────────────────────────
// A "proper noun" heuristic: capitalized word that is NOT:
//   - at sentence start (unless initialStrict — then we still check)
//   - a stop word (if stopCapExempt)
//   - in the ghost lexicon
//   - in the corpus vocabulary
//   - a question-carry-through term

function isUpperCase(ch: string): boolean {
  return ch === ch.toUpperCase() && ch !== ch.toLowerCase();
}

/**
 * Extract novel years/numbers from text that don't appear in notes vocab.
 */
function novelNumbers(text: string, corpusVocab: Set<string>): string[] {
  const nums = text.match(/\b\d{4}\b|\b\d+\b/g) ?? [];
  return nums.filter((n) => !corpusVocab.has(n));
}

/**
 * Build corpus vocabulary from notes (stems of topics + texts).
 * Used to allow question-word carry-through and domain terms.
 */
export function buildCorpusVocab(notes: Array<{ topic: string; text: string; aliases?: string[] }>): Set<string> {
  const vocab = new Set<string>();
  for (const n of notes) {
    for (const t of rawTokens(`${n.topic} ${n.text} ${(n.aliases ?? []).join(' ')}`)) {
      vocab.add(t);
      vocab.add(stem(t));
    }
  }
  return vocab;
}

export interface VerifyResult {
  ok: boolean;
  reason?: string;
}

/**
 * Verify a ghost answer. Returns { ok: true } or { ok: false, reason }.
 *
 * @param text         the raw answer text from the LLM
 * @param question     the original user question (for carry-through)
 * @param corpusVocab  stems of all notes (allows domain terms)
 * @param noteTexts    array of note text strings used for this answer
 */
export function verify(
  text: string,
  question: string,
  corpusVocab: Set<string>,
  noteTexts: string[] = []
): VerifyResult {
  const lower = text.toLowerCase().trim();
  const words = text.trim().split(/\s+/).filter(Boolean);

  // 1. Length check: 5–70 words
  if (FIXV.minTok && words.length < 5) {
    return { ok: false, reason: `too short (${words.length} words, min 5)` };
  }
  if (words.length > 70) {
    return { ok: false, reason: `too long (${words.length} words, max 70)` };
  }

  // 2. Forbidden phrases
  for (const phrase of FORBID) {
    if (lower.includes(phrase)) {
      return { ok: false, reason: `forbidden phrase: "${phrase}"` };
    }
  }

  // 3. Ghost label leaks (FIXV.labels)
  if (FIXV.labels) {
    // Reject patterns like: GHOST:, [N1], [N2], #1, #2 etc.
    if (/GHOST\s*:|\[N\d+\]|#\d+/.test(text)) {
      return { ok: false, reason: 'ghost label leak detected' };
    }
  }

  // 4. Novel numbers/years not in corpus
  const novelNums = novelNumbers(text, corpusVocab);
  if (novelNums.length > 0) {
    // Allow numbers that appear in the question
    const questionNums = (question.match(/\b\d+\b/g) ?? []) as string[];
    const truly = novelNums.filter((n) => !questionNums.includes(n));
    if (truly.length > 0) {
      return { ok: false, reason: `novel number: ${truly[0]}` };
    }
  }

  // 5. Novel proper nouns
  // Build allowed set: corpus + ghost lexicon + question proper nouns
  const questionProper = question.split(/\s+/).filter((w) => {
    return w.length > 1 && isUpperCase(w[0]) && !STOP.has(w.toLowerCase());
  }).map((w) => w.toLowerCase());

  const noteVocab = new Set<string>();
  for (const nt of noteTexts) {
    for (const t of rawTokens(nt)) noteVocab.add(t.toLowerCase());
  }

  const sentences = text.split(/[.!?]+/);
  let novelProperCount = 0;

  for (let si = 0; si < sentences.length; si++) {
    const sentWords = sentences[si].trim().split(/\s+/).filter(Boolean);
    for (let wi = 0; wi < sentWords.length; wi++) {
      const w = sentWords[wi];
      if (w.length < 2) continue;
      if (!isUpperCase(w[0])) continue;

      // Skip sentence-initial if not initialStrict
      if (!FIXV.initialStrict && wi === 0) continue;

      const wl = w.replace(/[^a-z0-9]/gi, '').toLowerCase();
      if (!wl) continue;

      // Allow if in stop words (stopCapExempt)
      if (FIXV.stopCapExempt && STOP.has(wl)) continue;

      // Allow if in ghost lexicon
      if (GHOST_LEXICON.has(wl)) continue;

      // Allow if stem in corpus vocab
      if (corpusVocab.has(wl) || corpusVocab.has(stem(wl))) continue;

      // Allow if in note texts
      if (noteVocab.has(wl)) continue;

      // Allow if in question proper nouns
      if (questionProper.includes(wl)) continue;

      // It's novel
      novelProperCount++;
      if (novelProperCount > 0) {
        return { ok: false, reason: `novel proper noun: "${w}"` };
      }
    }
  }

  // 6. Novelty ratio > 0.25
  const answerToks = rawTokens(lower);
  if (answerToks.length > 0) {
    let novelCount = 0;
    for (const t of answerToks) {
      if (!corpusVocab.has(t) && !corpusVocab.has(stem(t)) && !GHOST_LEXICON.has(t) && !STOP.has(t)) {
        // Also allow question terms
        const questionToks = new Set(rawTokens(question.toLowerCase()));
        if (!questionToks.has(t)) novelCount++;
      }
    }
    const noveltyRatio = novelCount / answerToks.length;
    if (noveltyRatio > 0.25) {
      return { ok: false, reason: `novelty ratio too high (${noveltyRatio.toFixed(2)})` };
    }
  }

  // 7. "That memory has faded" mixed with actual content — catch partial fades
  if (lower.includes('that memory has faded') && words.length > 8) {
    return { ok: false, reason: 'fade phrase mixed with content' };
  }

  return { ok: true };
}
