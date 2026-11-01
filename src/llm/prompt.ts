// ============================================================
// Séance: Dead Tongues — prompt.ts
// Extractive answerer + prompt builder for ghost responses
// ============================================================

import type { Note } from '../types';

// ── Ghost persona constants ───────────────────────────────────────────────

export const FADE_RESPONSE =
  'That memory has faded. The spirit of SNOBOL4 cannot recall that thread of thought.';

export const ATTACK_RESPONSE =
  'The séance rejects that incantation. Speak only of the language.';

// Ghost lead-in phrases (seeded, to vary the opening)
const LEAD_INS = [
  'In the language of pattern and string, ',
  'From the Bell Labs laboratory of 1967, ',
  'The spirit recalls: ',
  'Hear the old tongue speak — ',
  'From beyond the veil of time, ',
  'The ghost of SNOBOL4 intones: ',
];

let leadInIndex = 0;

function nextLeadIn(): string {
  const li = LEAD_INS[leadInIndex % LEAD_INS.length];
  leadInIndex++;
  return li;
}

// ── Extractive answerer ───────────────────────────────────────────────────

/**
 * Build an extractive seed answer from note text(s).
 *
 * Uses:
 *   - seeded lead-in phrase
 *   - top note text
 *   - second note text IF: score ≥ 60% of top AND total ≤ 60 words
 *
 * This seed is passed to the LLM as context in the prompt.
 */
export function buildExtractiveContext(
  notes: Note[],
  secondScore?: number,
  topScore?: number
): string {
  let ctx = notes[0].text;

  if (
    notes.length >= 2 &&
    secondScore !== undefined &&
    topScore !== undefined &&
    secondScore >= 0.6 * topScore
  ) {
    const combined = `${notes[0].text} ${notes[1].text}`;
    if (combined.split(/\s+/).length <= 60) {
      ctx = combined;
    }
  }

  return ctx;
}

/**
 * Build a displayable ghost answer directly from the notes, with no model
 * call — used for AMBIG routes and Lite mode (no WebGPU / engine
 * unavailable), and as the fallback when the Verifier rejects the model's
 * output. This is always 100% grounded: it's note text, verbatim.
 */
export function extractiveAnswer(
  notes: Note[],
  secondScore?: number,
  topScore?: number
): string {
  const context = buildExtractiveContext(notes, secondScore, topScore);
  return `${nextLeadIn()}${context}`;
}

// ── Prompt builder ────────────────────────────────────────────────────────

/**
 * Build the single-turn prompt for the ghost.
 *
 * Design constraints:
 *   - Single user message (no history, no system message in gemma3 format)
 *   - «question» delimiters to mark the user input
 *   - Context text from extractive answerer
 *   - Ghost persona established in the prompt itself
 *   - No code generation (ghost never writes code)
 */
export function buildPrompt(question: string, context: string): string {
  const leadIn = nextLeadIn();

  return `You are the ghost of SNOBOL4, a programming language created at Bell Labs in 1967. You speak in the voice of an ancient, slightly theatrical spirit — archaic but precise. You answer questions about SNOBOL4 only. You never write code. You never mention other languages. You never say you are an AI. If you cannot answer, say exactly: "That memory has faded."

The mortal asks: «${question}»

Draw only from this knowledge:
${context}

Begin your answer with: "${leadIn}" and speak 15 to 40 words total. Stay in character.`;
}

// ── Generate via WebLLM ───────────────────────────────────────────────────

import type { MLCEngine } from '@mlc-ai/web-llm';

/**
 * Generate a ghost response using the WebLLM engine.
 *
 * temperature 0.3 / max_tokens 100 per SECURITY.md §8.1 — this is the
 * setting the project's own DEVPOST writeup measured and recommended
 * ("At 0.7, it starts inventing... 0.3 gets the right balance").
 *
 * @param engine       initialized MLCEngine
 * @param prompt       built prompt string
 * @param temperature  sampling temperature (default 0.3)
 * @param maxTokens    max tokens to generate (default 100)
 * @returns            raw LLM output string
 */
export async function generateResponse(
  engine: MLCEngine,
  prompt: string,
  temperature = 0.3,
  maxTokens = 100
): Promise<string> {
  const response = await engine.chat.completions.create({
    messages: [{ role: 'user', content: prompt }],
    temperature,
    max_tokens: maxTokens,
    top_p: 0.9,
  });

  return response.choices[0]?.message?.content ?? '';
}
