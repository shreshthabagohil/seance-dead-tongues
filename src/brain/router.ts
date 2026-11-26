// ============================================================
// Séance: Dead Tongues — router.ts
// Routes a query to BM25_PASS / BM25_AMBIG / OVERVIEW / FADE
// ============================================================

import { tokens, SELFREF, EX_STOP } from './stem';
import { buildIndex, query, gate, R1_SYN } from './bm25';
import type { Note, Route } from '../types';
import type { BM25Index } from './bm25';

// ── needsOverview ─────────────────────────────────────────────────────────
/**
 * Returns true when content tokens (post-stop, post-EX_STOP) are empty
 * AND the raw query contains a SELFREF word.
 *
 * This catches: "what is snobol?", "tell me about snobol4",
 * "what language is this?" etc. → routes to N7 intro note.
 */
export function needsOverview(
  rawLower: string,
  contentTokens: string[],
  selfRef = ['snobol', 'snobol4', 'language', 'programming']
): boolean {
  return (
    contentTokens.length === 0 &&
    selfRef.some((t) => new RegExp('\\b' + t + '\\b').test(rawLower))
  );
}

// ── route() ───────────────────────────────────────────────────────────────
/**
 * Route a user query given the BM25 index.
 *
 * @param rawQuery  raw (sanitized) user question
 * @param index     pre-built BM25 index
 * @param n7        the N7 "about snobol4" note (used for OVERVIEW route)
 */
// Smalltalk detection (PRD FR-6) — greetings/thanks/help bypass BM25
const SMALLTALK_RE = /^\s*(hi+|hello+|hey+|thanks?|thank you|bye|goodbye|help|howdy|what can you do|who are you)\W*$/i;

function isSmalltalk(raw: string): boolean {
  return SMALLTALK_RE.test(raw.trim());
}

export function route(
    if (isSmalltalk(rawQuery)) {
    return { type: 'SMALLTALK', notes: [] };
  }
  rawQuery: string,
  index: BM25Index,
  n7: Note
): Route {
  const rawLower = rawQuery.toLowerCase();

  // Content tokens: remove EX_STOP too so "show me the language" → empty
  const contentToks = tokens(rawLower, EX_STOP);

  // Check OVERVIEW first
  if (needsOverview(rawLower, contentToks, [...SELFREF])) {
    return { type: 'OVERVIEW', notes: [n7] };
  }

  // BM25 query with R1 config (syn + numVeto + tau=1.5)
  const r = query(rawQuery, index, 1.5, true);
  const g = gate(r, 1.5, true);

  if (g.verdict === 'PASS') {
    // Look up Note objects by id from index.docs
    const topNote = index.docs.find((d) => d.id === r.top.id)!;
    const second = r.scored[1];
    const notes: Note[] = [topNote];
    if (second && second.score >= 0.6 * r.top.score) {
      const secondNote = index.docs.find((d) => d.id === second.id);
      if (
        secondNote &&
        (topNote.text.split(/\s+/).length + secondNote.text.split(/\s+/).length) <= 60
      ) {
        notes.push(secondNote);
      }
    }
    return { type: 'BM25_PASS', notes, queryResult: r };
  }

  if (g.verdict === 'AMBIG') {
    const topNote = index.docs.find((d) => d.id === r.top.id)!;
    return { type: 'BM25_AMBIG', notes: [topNote], queryResult: r };
  }

  return { type: 'FADE', notes: [] };
}

// ── buildR1Index ──────────────────────────────────────────────────────────
/**
 * Build the R1-configured BM25 index (production config).
 * R1 = synonym map + EX_STOP extraStop set.
 */
export function buildR1Index(notes: Note[]): BM25Index {
  return buildIndex(notes, { syn: R1_SYN, extraStop: EX_STOP });
}
