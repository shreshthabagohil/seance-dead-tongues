// ============================================================
// Séance: Dead Tongues — bm25.ts
// BM25 retrieval with synonym expansion and gate logic
// ============================================================

import { stem, tokens } from './stem';
import type { Note, QueryResult, ScoredDoc, GateVerdict } from '../types';

// BM25 parameters
const K1 = 1.2;
const B = 0.75;

// Gate thresholds — CRITICAL: floats, NOT fractions
const PASS_COVERAGE = 0.5;   // >= 0.5
const AMBIG_COVERAGE = 0.34; // >= 0.34 (NOT 1/3 = 0.333...)
const DEFAULT_TAU = 1.5;

export interface IndexOptions {
  syn?: Map<string, string>;      // stem → canonical synonym key
  extraStop?: Set<string>;        // additional stop words for queries
  symmetric?: boolean;            // default true; false = asymmetric (index literal, query resolves)
  idf?: 'lucene' | 'classic';    // default 'lucene'
}

export interface BM25Index {
  docs: Note[];
  N: number;
  df: Map<string, number>;
  tf: Map<string, Map<string, number>>; // term → noteId → raw freq
  avgLen: number;
  docLens: Map<string, number>;
  o: IndexOptions;
}

export interface GateResult {
  verdict: GateVerdict;
  why?: string;
}

// ── Synonym groups (oracle brain_ref.mjs GROUPS_SPEC) ────────────────────
// Keys ARE the canonical; values are space-separated word forms.
export const GROUPS_SPEC: Record<string, string> = {
  G_CREATE:  'made maker creator author inventor design build',
  G_DECLINE: 'died dead fade decline end obsolete forgot',
  G_USE:     'use used user popular adoption',
};

/**
 * Build a synonym map: each form's stem → group key (canonical).
 * Oracle: for (const [g, ws] of Object.entries(groups)) for (const w of ws.split(' ')) m.set(stem(w), g)
 */
export function mkSyn(groups: Record<string, string>): Map<string, string> {
  const m = new Map<string, string>();
  for (const [groupKey, forms] of Object.entries(groups)) {
    for (const w of forms.split(' ')) {
      m.set(stem(w), groupKey);
    }
  }
  return m;
}

/** R1 synonym map (production config) */
export const R1_SYN = mkSyn(GROUPS_SPEC);

/**
 * Compute IDF for a term from a built index.
 * Lucene: ln(1 + (N-n+0.5)/(n+0.5))
 * Classic: ln((N-n+0.5)/(n+0.5))  — can go negative
 */
export function idf(ix: BM25Index, term: string): number {
  const n = ix.df.get(term) ?? 0;
  if (ix.o.idf === 'classic') {
    return Math.log((ix.N - n + 0.5) / (n + 0.5));
  }
  // default: lucene
  return Math.log(1 + (ix.N - n + 0.5) / (n + 0.5));
}

/**
 * Build a BM25 index over the given notes.
 *
 * symmetric (default true):  index terms ARE resolved through syn
 * symmetric false:            index terms are stored literal; only query resolves
 */
export function buildIndex(notes: Note[], opts: IndexOptions = {}): BM25Index {
  const syn = opts.syn ?? mkSyn(GROUPS_SPEC);
  const symmetric = opts.symmetric !== false; // default true

  const docLens = new Map<string, number>();
  const df = new Map<string, number>();
  const tf = new Map<string, Map<string, number>>();

  for (const note of notes) {
    // Index topic twice (double-weight) + text + aliases
    const docText = `${note.topic} ${note.topic} ${note.text} ${(note.aliases ?? []).join(' ')}`;
    // dropSelf=false: keep SELFREF terms in index (oracle: {dropSelf:false})
    const toks = tokens(docText, opts.extraStop, false);
    const stemmed = toks.map(stem);

    // For asymmetric: store literal stems. For symmetric: resolve through syn.
    const indexTerms = symmetric
      ? stemmed.map((t) => syn.get(t) ?? t)
      : stemmed; // raw stems, unresolved

    docLens.set(note.id, indexTerms.length);

    const freq = new Map<string, number>();
    for (const t of indexTerms) freq.set(t, (freq.get(t) ?? 0) + 1);

    for (const [t, cnt] of freq) {
      df.set(t, (df.get(t) ?? 0) + 1);
      let noteMap = tf.get(t);
      if (!noteMap) { noteMap = new Map(); tf.set(t, noteMap); }
      noteMap.set(note.id, cnt);
    }
  }

  const N = notes.length;
  const avgLen = N > 0
    ? [...docLens.values()].reduce((a, b) => a + b, 0) / N
    : 0;

  return { docs: notes, N, df, tf, avgLen, docLens, o: opts };
}

/**
 * Query the index. Returns a QueryResult with scored array and coverage.
 *
 * Query ALWAYS resolves stems through the syn map (regardless of symmetric).
 * qs are the unique resolved query stems.
 * coverage = top.matched / qs.length   (NaN when qs is empty)
 */
export function query(
  rawQuery: string,
  index: BM25Index,
  _tau = DEFAULT_TAU,
  _numVeto = false
): QueryResult {
  const syn = index.o.syn ?? mkSyn(GROUPS_SPEC);

  // Query side: ALWAYS resolve through syn; SELFREF already dropped by tokens()
  const qToks = tokens(rawQuery, index.o.extraStop)
    .map(stem)
    .map((t) => syn.get(t) ?? t);
  const qs = [...new Set(qToks)];

  const scored: ScoredDoc[] = index.docs.map((doc) => {
    const dl = index.docLens.get(doc.id) ?? 0;
    const norm = 1 - B + B * (dl / index.avgLen);

    let score = 0;
    let matched = 0;
    const matchedTerms: string[] = [];

    for (const t of qs) {
      const idfVal = idf(index, t);
      const f = index.tf.get(t)?.get(doc.id) ?? 0;
      if (f > 0) {
        score += idfVal * ((f * (K1 + 1)) / (f + K1 * norm));
        matched++;
        matchedTerms.push(t);
      }
    }

    return { id: doc.id, score, matched, matchedTerms };
  });

  // Sort: score desc, then id asc (stable tie-break)
  scored.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));

  const top = scored[0];
  const coverage = qs.length > 0 ? top.matched / qs.length : NaN;

  return { qs, scored, top, coverage };
}

/**
 * Gate the query result into PASS / AMBIG / FADE.
 *
 * CRITICAL FLOAT THRESHOLDS (NOT integer arithmetic):
 *   PASS  = matched≥1 AND coverage≥0.5   AND score≥tau
 *   AMBIG = matched≥1 AND coverage≥0.34  AND coverage<0.5
 *   else FADE
 */
export function gate(
  r: QueryResult,
  tau = DEFAULT_TAU,
  numVeto = false
): GateResult {
  if (!r.qs.length || isNaN(r.coverage)) {
    return { verdict: 'FADE', why: 'empty query' };
  }

  // Unmatched number veto
  if (numVeto && r.qs.some((t) => /^\d+$/.test(t) && !r.top.matchedTerms.includes(t))) {
    return { verdict: 'FADE', why: 'unmatched number' };
  }

  if (r.top.matched >= 1 && r.coverage >= PASS_COVERAGE && r.top.score >= tau) {
    return { verdict: 'PASS' };
  }

  if (r.top.matched >= 1 && r.coverage >= AMBIG_COVERAGE && r.coverage < PASS_COVERAGE) {
    return { verdict: 'AMBIG' };
  }

  return { verdict: 'FADE' };
}
