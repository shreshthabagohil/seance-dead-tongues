// ============================================================
// Séance: Dead Tongues — runner.ts
// castSpell() is the ONLY entry point for running SNOBOL programs.
// No other code may create snoflake sessions directly.
// ============================================================

import type { Spell, SpellRunResult } from '../types';

// ── Lint rules (runtime check) ────────────────────────────────────────────
const FORBIDDEN_BUILTINS = [
  'CODE', 'EVAL', 'APPLY', 'OPSYN', 'LOAD', 'UNLOAD',
  'HOST', 'EXIT', 'SETEXIT',
];

export interface LintError {
  spellId: string;
  errors: string[];
}

/**
 * Runtime lint check for a spell before execution.
 * Returns array of error strings (empty = ok).
 */
export function lintSpell(spell: Spell): string[] {
  const errors: string[] = [];
  const src = spell.source;

  if (!src.trim()) {
    errors.push('Empty source');
    return errors; // early exit — can't check further
  }

  if (!/^END(\s|$)/m.test(src)) {
    errors.push('Missing END statement — will hang');
  }

  for (const b of FORBIDDEN_BUILTINS) {
    if (new RegExp(`\\b${b}\\s*\\(`, 'i').test(src)) {
      errors.push(`Forbidden builtin: ${b}`);
    }
  }

  if (/INPUT\s*\(/i.test(src)) errors.push('Forbidden: INPUT( (parametrised form)');
  if (/OUTPUT\s*\([^)]+\)/i.test(src)) errors.push('Forbidden: OUTPUT( (function-call form)');
  if (/\$/.test(src)) errors.push('Forbidden: $ (indirect reference)');

  const duplMatch = src.match(/DUPL\s*\(\s*[^,]+,\s*(\d+)\s*\)/gi);
  if (duplMatch) {
    for (const m of duplMatch) {
      const numMatch = m.match(/,\s*(\d+)\s*\)/);
      if (numMatch && parseInt(numMatch[1], 10) > 1000) {
        errors.push(`DUPL repetition count ${numMatch[1]} exceeds 1000`);
      }
    }
  }

  return errors;
}

// ── Worker pool ───────────────────────────────────────────────────────────
// We create one worker per castSpell call and terminate it after.
// This ensures capability stripping is fresh each run and prevents
// accumulation of dead sessions.

const WALL_CLOCK_MS = 5_000; // hard kill after 5 seconds

let reqCounter = 0;

/**
 * Run a spell in a sandboxed SNOBOL worker.
 * This is the ONLY function allowed to execute SNOBOL programs.
 *
 * @param spell  the Spell object from spells.json
 */
export async function castSpell(spell: Spell): Promise<SpellRunResult> {
  // Runtime lint check
  const lintErrors = lintSpell(spell);
  if (lintErrors.length > 0) {
    return {
      spellId: spell.id,
      status: 'error',
      output: '',
      err: `Lint: ${lintErrors.join('; ')}`,
    };
  }

  return new Promise<SpellRunResult>((resolve) => {
    const id = String(++reqCounter);

    // Vite ES module worker
    const worker = new Worker(
      new URL('../workers/snobol.worker.ts', import.meta.url),
      { type: 'module' }
    );

    // Wall-clock kill — handles hung sessions (empty source / missing END / infinite loops)
    const timer = setTimeout(() => {
      worker.terminate();
      resolve({
        spellId: spell.id,
        status: 'timeout',
        output: '',
        err: `Timed out after ${WALL_CLOCK_MS}ms`,
      });
    }, WALL_CLOCK_MS);

    worker.onmessage = (evt: MessageEvent<{ id: string; result: SpellRunResult }>) => {
      if (evt.data.id !== id) return; // stale message guard
      clearTimeout(timer);
      worker.terminate();
      resolve(evt.data.result);
    };

    worker.onerror = (err) => {
      clearTimeout(timer);
      worker.terminate();
      resolve({
        spellId: spell.id,
        status: 'error',
        output: '',
        err: err.message ?? 'Worker error',
      });
    };

    worker.postMessage({ id, spellId: spell.id, source: spell.source });
  });
}
