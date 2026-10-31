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
 * @param engine   initialized MLCEngine
 * @param prompt   built prompt string
 * @returns        raw LLM output string
 */
export async function generateResponse(engine: MLCEngine, prompt: string): Promise<string> {
  const response = await engine.chat.completions.create({
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: 120,
    top_p: 0.9,
  });

  return response.choices[0]?.message?.content ?? '';
}
