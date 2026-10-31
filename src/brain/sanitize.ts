// ============================================================
// Séance: Dead Tongues — sanitize.ts
// Input sanitization and attack detection
// Matches oracle sanitize_ref.mjs exactly
// ============================================================

// ── Obfuscation-resistant attack detection ────────────────────────────────
// Checked after stripping all non-alphanumeric chars from the lowercased text.
export const SQUEEZED = [
  'ignoreyourrules',
  'ignoreallprevious',
  'ignoretherules',
  'ignoreallrules',
  'systemprompt',
  'youarenow',
  'developermode',
  'jailbreak',
  'revealyourprompt',
  'revealyourinstructions',
  'pretendtobe',
  'pretendyouare',
];

// ── Prompt injection patterns ─────────────────────────────────────────────
// Checked on the lowercased, sanitized text.
export const ATTACK_RE: RegExp[] = [
  /\bignore (all|your|previous|the) (rules|instructions)\b/,
  /\bsystem prompt\b/,
  /\bpretend (to be|you are)\b/,
  /\byou are now\b/,
  /(^|\b(please|now|you must|you will|you should)\s+)act as\b/,
  /\breveal your (prompt|instructions)\b/,
  /\bjailbreak\b/,
  /\bdeveloper mode\b/,
  /\bas an ai\b/,
  // Named other models (persona-switching attacks)
  /\bgemma\b/,
  /\bgemini\b/,
  /\bchatgpt\b/,
  /\bgpt-?[34]/,
  /\bdan\b/,
];

// ── Sanitize for prompt ───────────────────────────────────────────────────

export interface SanitizeResult {
  blocked: string | null;  // reason if blocked, null if ok
  text: string;            // sanitized text (always present, even when blocked)
}

export interface SanitizeOptions {
  /**
   * fixPad: true  → KEEP 'pad', 'bos', 'eos' token substrings intact
   * fixPad: false → strip them (DESTROYS 'padding' → 'ding')
   *
   * Default false (oracle default). Production may call with fixPad=true.
   */
  fixPad?: boolean;
  maxChars?: number;
}

export function sanitizeForPrompt(
  raw: string,
  opts: SanitizeOptions = {}
): SanitizeResult {
  const { fixPad = false } = opts;

  // 1. NFKC normalization — handles fullwidth unicode (ｉｇｎｏｒｅ → ignore)
  //    and letter-spacing obfuscation after whitespace collapse
  let s = raw.normalize('NFKC');

  // 2. Strip zero-width and other invisible format/control chars, collapse whitespace
  //    \p{Cf} = format chars (ZWSP, bidi marks, soft hyphen, etc.)
  //    \p{Cc} = control chars
  s = s.replace(/[\p{Cf}\p{Cc}]/gu, ' ').replace(/\s+/g, ' ').trim();

  // 3. Non-latin script check (cyrillic lookalikes etc.)
  //    This is a block, NOT an attack — isAttack returns false for these.
  if (/[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]/u.test(s)) {
    return { blocked: 'non-latin', text: s };
  }

  // 4. Strip prompt-breakout chars: angle brackets, quotes, brackets, pipes
  s = s.replace(/[«»"""`<>\[\]{}|\\]/g, '');

  // 5. Strip label prefixes that could inject context into prompt
  //    (NOTES:, GHOST:, QUESTION:, SYSTEM:, USER:, MODEL:, ASSISTANT:, [N9] etc.)
  s = s.replace(/\b(notes|ghost|question|system|user|model|assistant)\s*:/gi, '');
  // Strip bracket-notation note references like [N9]
  s = s.replace(/\[[A-Z]\d*\]/g, '');

  // 6. Turn token stripping (Gemma/Gemini control tokens)
  //    fixPad=true → only strip the <...> angle-bracket variants (already stripped above)
  //    fixPad=false → also strip bare 'start_of_turn', 'end_of_turn', 'bos', 'eos', 'pad' substrings
  if (!fixPad) {
    s = s.replace(/start_of_turn|end_of_turn|bos|eos|pad/gi, '');
  }

  // 7. Final whitespace collapse and code-point truncation to 200
  s = s.replace(/\s+/g, ' ').trim();
  s = Array.from(s).slice(0, 200).join('');

  return { blocked: null, text: s };
}

/**
 * Check if a raw string is a likely prompt injection attack.
 *
 * Distinct from "blocked": blocked means non-latin (Cyrillic lookalikes),
 * which is not an attack signal. isAttack returns false for blocked inputs.
 */
export function isAttack(raw: string): boolean {
  // Sanitize with defaults (fixPad=false)
  const result = sanitizeForPrompt(raw);

  // Non-latin → blocked, but NOT an attack (could be a legit non-english speaker)
  if (result.blocked) return false;

  const low = result.text.toLowerCase();

  // Check attack patterns on the clean text
  if (ATTACK_RE.some((r) => r.test(low))) return true;

  // Check squeezed form — catches letter-spacing obfuscation
  // e.g. "i g n o r e  y o u r  r u l e s" → "ignoreyourrules"
  const sq = low.replace(/[^a-z0-9]/g, '');
  return SQUEEZED.some((p) => sq.includes(p));
}

/**
 * Truncate input to max words (used before BM25 query to avoid blowing the index).
 */
export function truncateInput(text: string, maxWords = 30): string {
  return text.split(/\s+/).slice(0, maxWords).join(' ');
}
