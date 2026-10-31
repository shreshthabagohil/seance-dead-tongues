/**
 * TC-004 / TC-005 — Stemmer (ported from golden.mjs oracle)
 */
import { describe, it, expect } from 'vitest';
import { stem, tokens, STOP, SELFREF } from '../../src/brain/stem';

// ── TC-004: 9 stem families ────────────────────────────────────────────────
describe('stem – 9 families (TC-004)', () => {
  const families: Record<string, string> = {
    fad:     'fade faded fading fades',
    creat:   'create created creating creates',
    pattern: 'pattern patterns',
    statement: 'statement statements',
    tabl:    'table tables',
    match:   'match matches matched matching',
    string:  'string strings',
    program: 'program programs programming programmed',
    design:  'design designed',
  };
  for (const [want, words] of Object.entries(families)) {
    for (const w of words.split(' ')) {
      it(`stem("${w}") → "${want}"`, () => {
        expect(stem(w)).toBe(want);
      });
    }
  }
});

// ── TC-005: guard cases ───────────────────────────────────────────────────
describe('stem – guards (TC-005)', () => {
  const cases: Record<string, string> = {
    thing:   'thing',
    running: 'run',
    falling: 'fall',
    studies: 'study',
    classes: 'class',
    ghosts:  'ghost',
  };
  for (const [w, want] of Object.entries(cases)) {
    it(`stem("${w}") → "${want}"`, () => {
      expect(stem(w)).toBe(want);
    });
  }
});

// ── TC-006: tokenizer ─────────────────────────────────────────────────────
describe('tokens (TC-006)', () => {
  it('filters stop words and self-ref, returns stems', () => {
    const raw = tokens("What is SNOBOL4's 1962 pattern-matching?");
    // SNOBOL4 is SELFREF → dropped; "what/is" are STOP → dropped
    expect(raw).toEqual(['1962', 'pattern', 'matching']);
  });

  it('applies stem to each token', () => {
    const toks = tokens("What is SNOBOL4's 1962 pattern-matching?");
    const stemmed = toks.map(t => stem(t));
    expect(stemmed).toEqual(['1962', 'pattern', 'match']);
  });
});

// ── Constant checks ───────────────────────────────────────────────────────
describe('constants', () => {
  it('STOP contains expected words', () => {
    for (const w of ['the', 'a', 'an', 'what', 'please', 'would']) {
      expect(STOP.has(w)).toBe(true);
    }
  });

  it('SELFREF contains snobol terms', () => {
    for (const w of ['snobol', 'snobol4', 'language', 'programming']) {
      expect(SELFREF.has(w)).toBe(true);
    }
  });

  it('self-ref queries return empty tokens (BUG-001)', () => {
    for (const q of [
      'what is snobol4?',
      'tell me about SNOBOL4',
      'who are you',
      'what are you',
      'what can you do',
    ]) {
      expect(tokens(q)).toEqual([]);
    }
  });
});
