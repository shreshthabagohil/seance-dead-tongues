// ============================================================
// Séance: Dead Tongues — ask.ts
// Full 12-step ask pipeline
// ============================================================

import { sanitizeForPrompt, truncateInput } from './sanitize';
import { route, buildR1Index } from './router';
import { verify, buildCorpusVocab } from './verifier';
import { buildExtractiveContext, buildPrompt, generateResponse, FADE_RESPONSE, ATTACK_RESPONSE } from '../llm/prompt';
import { getEngine } from '../llm/engine';
import type { Note, ChatMessage } from '../types';
import type { BM25Index } from './bm25';

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

/**
 * The 12-step ask pipeline.
 *
 * Step 1:  Sanitize input (fixPad: true — BUG-013 fix)
 * Step 2:  Attack check
 * Step 3:  Truncate to 30 words
 * Step 4:  Route via BM25 (R1 config)
 * Step 5:  FADE → return FADE_RESPONSE
 * Step 6:  Build extractive context from notes
 * Step 7:  Build prompt
 * Step 8:  Generate via WebLLM
 * Step 9:  Verify output
 * Step 10: If verify fails → retry once with temperature 0.5
 * Step 11: If still fails → FADE
 * Step 12: Return ghost message
 */
export async function ask(
  rawQuestion: string,
  onProgress?: (step: number) => void
): Promise<AskResult> {
  const notes = _notes;
  const index = _index;
  const corpusVocab = _corpusVocab;

  if (!notes || !index || !corpusVocab) {
    throw new Error('Pipeline not initialized — call initPipeline() first');
  }

  const n7 = notes.find((n) => n.id === 'N7')!;
  const ts = Date.now();

  // Step 1: Sanitize (CRITICAL: fixPad: true)
  onProgress?.(1);
  const san = sanitizeForPrompt(rawQuestion, { fixPad: true, maxChars: 200 });

  // Step 2: Attack check
  onProgress?.(2);
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

  // Step 3: Truncate
  onProgress?.(3);
  const question = truncateInput(san.text, 30);

  // Step 4: Route
  onProgress?.(4);
  const routeResult = route(question, index, n7);

  // Step 5: FADE route
  onProgress?.(5);
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

  // Step 6: Extractive context
  onProgress?.(6);
  const qr = routeResult.queryResult;
  const context = buildExtractiveContext(
    routeResult.notes,
    qr?.scored[1]?.score,
    qr?.top.score
  );

  // Step 7: Build prompt
  onProgress?.(7);
  const prompt = buildPrompt(question, context);

  // Step 8: Generate
  onProgress?.(8);
  const engine = await getEngine(() => {});
  let raw = await generateResponse(engine, prompt);

  // Step 9: Verify
  onProgress?.(9);
  const noteTexts = routeResult.notes.map((n) => n.text);
  let vResult = verify(raw, question, corpusVocab, noteTexts);

  // Step 10: Retry once on verification failure
  onProgress?.(10);
  if (!vResult.ok) {
    const prompt2 = buildPrompt(question, context);
    const retryEngine = await getEngine(() => {});
    const rawRetry = await retryEngine.chat.completions.create({
      messages: [{ role: 'user', content: prompt2 }],
      temperature: 0.5,
      max_tokens: 100,
      top_p: 0.9,
    });
    raw = rawRetry.choices[0]?.message?.content ?? '';
    vResult = verify(raw, question, corpusVocab, noteTexts);
  }

  // Step 11: Still failing → FADE
  onProgress?.(11);
  if (!vResult.ok) {
    return {
      message: {
        id: makeId(),
        role: 'ghost',
        content: FADE_RESPONSE,
        fadeReason: `verify: ${vResult.reason}`,
        ts,
      },
    };
  }

  // Step 12: Return ghost answer
  onProgress?.(12);
  return {
    message: {
      id: makeId(),
      role: 'ghost',
      content: raw.trim(),
      ts,
    },
  };
}
