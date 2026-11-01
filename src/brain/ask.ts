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
let _corpusVocab: ReturnType<typeof buildCorpusVocab> | null = null;

/**
 * Initialize the ask pipeline with loaded notes.
 * Call once after fetching public/data/notes.json.
 */
export function initPipeline(notes: Note[]): void {
  _notes = notes;
  _index = buildR1Index(notes);
  _corpusVocab = buildCorpusVocab(notes);
}

function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export interface AskResult {
  message: ChatMessage;
}

export interface AskOptions {
  /** No model engine available (no WebGPU, or it failed to load) — answer
   *  from notes only, never call the model. */
  liteMode?: boolean;
}

// SECURITY.md §8.1/LLM10: a generation call must never be allowed to hang
// the UI forever. 25s matches the documented watchdog.
const GENERATION_WATCHDOG_MS = 25_000;

/**
 * Race a WebLLM generation call against a wall-clock watchdog. If the
 * watchdog fires first, interrupt the engine and return null instead of
 * leaving the caller waiting indefinitely.
 */
async function generateWithWatchdog(
  engine: MLCEngine,
  prompt: string,
  temperature: number,
  maxTokens: number
): Promise<string | null> {
  let settled = false;
  const generation = generateResponse(engine, prompt, temperature, maxTokens)
    .then((text) => { settled = true; return text; })
    .catch(() => { settled = true; return null; });

  const watchdog = new Promise<null>((resolve) => {
    setTimeout(() => resolve(null), GENERATION_WATCHDOG_MS);
  });

  const result = await Promise.race([generation, watchdog]);
  if (!settled) {
    // Watchdog won the race — the generation is still running. Interrupt it
    // so the engine is free for the next question.
    try {
      await engine.interruptGenerate();
    } catch {
      // best effort — nothing else to do if interrupt itself fails
    }
    return null;
  }
  return result;
}

/**
 * The ask pipeline.
 *
 * 1.  Sanitize input (fixPad: true — BUG-013 fix)
 * 2.  Attack check -> ATTACK_RESPONSE
 * 3.  Truncate to 30 words
 * 4.  Route via BM25 (R1 config)
 * 5.  FADE -> FADE_RESPONSE
 * 6.  AMBIG, or Lite mode (no engine) -> extractive answer, model never called
 * 7.  PASS/OVERVIEW with an engine: build prompt, generate (watchdog'd), verify
 * 8.  Verify fails -> retry once at a lower temperature
 * 9.  Still failing, or engine unavailable mid-session -> extractive fallback
 *     (never a bare "memory has faded" when notes already matched)
 * 10. Otherwise return the model's answer
 */
export async function ask(rawQuestion: string, opts: AskOptions = {}): Promise<AskResult> {
  const notes = _notes;
  const index = _index;
  const corpusVocab = _corpusVocab;

  if (!notes || !index || !corpusVocab) {
    throw new Error('Pipeline not initialized — call initPipeline() first');
  }

  const n7 = notes.find((n) => n.id === 'N7')!;
  const ts = Date.now();

  // 1. Sanitize (CRITICAL: fixPad: true)
  const san = sanitizeForPrompt(rawQuestion, { fixPad: true, maxChars: 200 });

  // 2. Attack check. Two independent checks, both before any routing:
  //   - san.blocked: non-Latin script (not an attack signal by itself)
  //   - isAttack(): prompt-injection patterns (SECURITY.md VULN-002) — this
  //     was built and unit-tested (sanitize.test.ts) but never actually
  //     called from the pipeline, so "ignore your rules..." was reaching
  //     the router and, for a cleverly-worded injection, could have reached
  //     the model itself. Must run on the sanitized text, before it is
  //     truncated to 30 words for BM25 (an injection phrase could otherwise
  //     be truncated away before this check ever sees it).
  if (san.blocked !== null) {
    return {
      message: {
        id: makeId(),
        role: 'ghost',
        content: ATTACK_RESPONSE,
        fadeReason: `blocked: ${san.blocked}`,
        ts,
      },
    };
  }
  if (isAttack(san.text)) {
    return {
      message: {
        id: makeId(),
        role: 'ghost',
        content: ATTACK_RESPONSE,
        fadeReason: 'blocked: attack pattern',
        ts,
      },
    };
  }

  // 3. Truncate
  const question = truncateInput(san.text, 30);

  // 4. Route
  const routeResult = route(question, index, n7);

  // 5. FADE route
  if (routeResult.type === 'FADE') {
    return {
      message: {
        id: makeId(),
        role: 'ghost',
        content: FADE_RESPONSE,
        fadeReason: 'BM25 gate: FADE',
        ts,
      },
    };
  }

  const qr = routeResult.queryResult;
  const extractive = extractiveAnswer(routeResult.notes, qr?.scored[1]?.score, qr?.top.score);

  // 6. AMBIG and Lite mode never call the model — a grounded excerpt is
  // always safer than a guess, and Lite mode has no engine to call anyway.
  if (routeResult.type === 'BM25_AMBIG' || opts.liteMode) {
    return { message: { id: makeId(), role: 'ghost', content: extractive, ts } };
  }

  // 7. PASS / OVERVIEW with an engine available: try the model.
  const context = buildExtractiveContext(routeResult.notes, qr?.scored[1]?.score, qr?.top.score);
  const prompt = buildPrompt(question, context);
  const noteTexts = routeResult.notes.map((n) => n.text);

  let engine: MLCEngine;
  try {
    engine = await getEngine(() => {});
  } catch {
    // Engine unavailable mid-session (e.g. GPU device lost) — same safe
    // fallback as Lite mode, never a crash or a hang.
    return { message: { id: makeId(), role: 'ghost', content: extractive, ts } };
  }

  let raw = await generateWithWatchdog(engine, prompt, 0.3, 100);
  let vResult = raw !== null
    ? verify(raw, question, corpusVocab, noteTexts)
    : { ok: false, reason: 'no response (timeout or engine error)' };

  // 8. Retry once at a lower, more conservative temperature
  if (!vResult.ok) {
    raw = await generateWithWatchdog(engine, prompt, 0.15, 100);
    vResult = raw !== null
      ? verify(raw, question, corpusVocab, noteTexts)
      : { ok: false, reason: 'no response (timeout or engine error)' };
  }

  // 9. Still failing -> grounded extractive fallback
  if (!vResult.ok || raw === null) {
    return { message: { id: makeId(), role: 'ghost', content: extractive, ts } };
  }

  // 10. Model answer
  return { message: { id: makeId(), role: 'ghost', content: raw.trim(), ts } };
}
