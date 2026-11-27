// ============================================================
// Séance: Dead Tongues — ask.ts
// Full ask pipeline
// ============================================================

import { sanitizeForPrompt, truncateInput, isAttack } from './sanitize';
import { route, buildR1Index } from './router';
import { verify, buildCorpusVocab } from './verifier';
import { buildExtractiveContext, extractiveAnswer, buildPrompt, generateResponse, FADE_RESPONSE, ATTACK_RESPONSE } from '../llm/prompt';
import { getEngine } from '../llm/engine';
import type { Note, ChatMessage } from '../types';
import type { BM25Index } from './bm25';
import type { MLCEngine } from '@mlc-ai/web-llm';

let _index: BM25Index | null = null;
let _notes: Note[] | null = null;

export function initPipeline(notes: Note[]): void {
  if (!notes.find((n) => n.id === 'N7')) {
    throw new Error('Corpus missing note N7 — check public/data/notes.json');
  }
  _notes = notes;
  _index = buildR1Index(notes);
}

function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function smalltalkReply(q: string): string {
  const lower = q.toLowerCase();
  if (/thank/.test(lower)) return 'Your gratitude is noted. The spirit of SNOBOL4 awaits your next question.';
  if (/help/.test(lower))  return 'Ask me of SNOBOL4 — its patterns, strings, and built-in functions. I answer from memory.';
  if (/bye|goodbye/.test(lower)) return 'The séance dims. Return when you seek the old ways of pattern and string.';
  return 'The spirit stirs. I am SNOBOL4 — ask of pattern, string, and symbol.';
}

export interface AskResult { message: ChatMessage; }
export interface AskOptions { liteMode?: boolean; }

const GENERATION_WATCHDOG_MS = 25_000;

async function generateWithWatchdog(engine: MLCEngine, prompt: string, temperature: number, maxTokens: number): Promise<string | null> {
  let settled = false;
  const generation = generateResponse(engine, prompt, temperature, maxTokens)
    .then((text) => { settled = true; return text; })
    .catch(() => { settled = true; return null; });
  const watchdog = new Promise<null>((resolve) => { setTimeout(() => resolve(null), GENERATION_WATCHDOG_MS); });
  const result = await Promise.race([generation, watchdog]);
  if (!settled) {
    try { await engine.interruptGenerate(); } catch {}
    return null;
  }
  return result;
}

export async function ask(rawQuestion: string, opts: AskOptions = {}): Promise<AskResult> {
  const notes = _notes;
  const index = _index;

  if (!notes || !index) {
    throw new Error('Pipeline not initialized — call initPipeline() first');
  }

  // N7 presence validated in initPipeline(); find() will not return undefined here
  const n7 = notes.find((n) => n.id === 'N7') as Note;
  const ts = Date.now();

  const san = sanitizeForPrompt(rawQuestion, { fixPad: true, maxChars: 200 });

  if (san.blocked !== null) {
    return { message: { id: makeId(), role: 'ghost', content: ATTACK_RESPONSE, fadeReason: `blocked: ${san.blocked}`, ts } };
  }
  if (isAttack(san.text)) {
    return { message: { id: makeId(), role: 'ghost', content: ATTACK_RESPONSE, fadeReason: 'blocked: attack pattern', ts } };
  }

  const question = truncateInput(san.text, 30);
  const routeResult = route(question, index, n7);

  // Step 4.5: Smalltalk — in-character reply, no BM25, no model (PRD FR-6)
  if (routeResult.type === 'SMALLTALK') {
    return { message: { id: makeId(), role: 'ghost', content: smalltalkReply(question), ts } };
  }

  if (routeResult.type === 'FADE') {
    return { message: { id: makeId(), role: 'ghost', content: FADE_RESPONSE, fadeReason: 'BM25 gate: FADE', ts } };
  }

  const qr = routeResult.queryResult;
  const extractive = extractiveAnswer(routeResult.notes, qr?.scored[1]?.score, qr?.top.score);

  if (routeResult.type === 'BM25_AMBIG' || opts.liteMode) {
    return { message: { id: makeId(), role: 'ghost', content: extractive, ts } };
  }

  const context = buildExtractiveContext(routeResult.notes, qr?.scored[1]?.score, qr?.top.score);
  const prompt = buildPrompt(question, context);
  const noteTexts = routeResult.notes.map((n) => n.text);

  let engine: MLCEngine;
  try {
    engine = await getEngine(() => {});
  } catch {
    return { message: { id: makeId(), role: 'ghost', content: extractive, ts } };
  }

  const retrievedVocab = buildCorpusVocab(routeResult.notes);
  let raw = await generateWithWatchdog(engine, prompt, 0.3, 100);
  let vResult = raw !== null
    ? verify(raw, question, retrievedVocab, noteTexts)
    : { ok: false, reason: 'no response (timeout or engine error)' };

  if (!vResult.ok) {
    raw = await generateWithWatchdog(engine, prompt, 0.15, 100);
    vResult = raw !== null
      ? verify(raw, question, retrievedVocab, noteTexts)
      : { ok: false, reason: 'no response (timeout or engine error)' };
  }

  if (!vResult.ok || raw === null) {
    return { message: { id: makeId(), role: 'ghost', content: extractive, ts } };
  }

  return { message: { id: makeId(), role: 'ghost', content: raw.trim(), ts } };
}
