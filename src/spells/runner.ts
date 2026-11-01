// ============================================================
// Séance: Dead Tongues — runner.ts
// castSpell() is the ONLY entry point for running interpreter programs
// (SNOBOL4 via snoflake, Forth via WAForth). No other code may create a
// snoflake session or a WAForth instance directly.
// ============================================================

import type { Spell, SpellRunResult } from '../types';

// ── SNOBOL4 lint rules (runtime check) ────────────────────────────────────
const SNOBOL_FORBIDDEN_BUILTINS = [
  'CODE', 'EVAL', 'APPLY', 'OPSYN', 'LOAD', 'UNLOAD',
  'HOST', 'EXIT', 'SETEXIT',
];

// ── Forth lint rules (SECURITY.md §9.3) ───────────────────────────────────
// EVALUATE/INCLUDE*/REQUIRE read or execute source from outside the curated
// program; ALLOT/ALLOCATE/RESIZE grow memory arbitrarily; BIND reaches host
// JS callbacks (WAForth's SCALL mechanism) — none of that belongs in a spell.
const FORTH_FORBIDDEN_WORDS = [
  'EVALUATE', 'INCLUDE', 'INCLUDED', 'REQUIRE',
  'ALLOT', 'ALLOCATE', 'RESIZE', 'BIND',
];

export interface LintError {
  spellId: string;
  errors: string[];
}

function lintSnobolSpell(src: string): string[] {
  const errors: string[] = [];

  if (!/^END(\s|$)/m.test(src)) {
    errors.push('Missing END statement — will hang');
  }

  for (const b of SNOBOL_FORBIDDEN_BUILTINS) {
    if (new RegExp(`\\b${b}\\s*\\(`, 'i').test(src)) {
      errors.push(`Forbidden builtin: ${b}`);
    }
  }

  if (/INPUT\s*\(/i.test(src)) errors.push('Forbidden: INPUT( (parametrised form)');
  if (/OUTPUT\s*\([^)]+\)/i.test(src)) errors.push('Forbidden: OUTPUT( (function-call form)');
  if (/\$/.test(src)) errors.push('Forbidden: $ (indirect reference)');

  // Every DUPL( call must have a literal count <= 1000 (SECURITY.md VULN-003 §9.3).
  // A call whose second argument is not a bare integer (e.g. a variable) must
  // also be rejected — not silently skipped, which the old digit-only regex did.
  for (const m of src.matchAll(/DUPL\s*\([^)]*\)/gi)) {
    const numMatch = m[0].match(/,\s*(\d+)\s*\)/);
    if (!numMatch) {
      errors.push('DUPL repetition count must be a literal integer');
    } else if (parseInt(numMatch[1], 10) > 1000) {
      errors.push(`DUPL repetition count ${numMatch[1]} exceeds 1000`);
    }
  }

  return errors;
}

function lintForthSpell(src: string): string[] {
  const errors: string[] = [];
  for (const w of FORTH_FORBIDDEN_WORDS) {
    if (new RegExp(`\\b${w}\\b`, 'i').test(src)) {
      errors.push(`Forbidden word: ${w}`);
    }
  }
  return errors;
}

/**
 * Runtime lint check for a spell before execution.
 * Returns array of error strings (empty = ok).
 */
export function lintSpell(spell: Spell): string[] {
  const src = spell.source;

  if (!src.trim()) {
    return ['Empty source'];
  }

  return spell.lang === 'forth' ? lintForthSpell(src) : lintSnobolSpell(src);
}

// ── Worker pool ───────────────────────────────────────────────────────────
// We create one worker per castSpell call and terminate it after.
// This ensures capability stripping is fresh each run and prevents
// accumulation of dead sessions.

const WALL_CLOCK_MS = 5_000; // hard kill after 5 seconds

let reqCounter = 0;

// Vite's `new Worker(new URL(...))` static analysis only recognizes that
// exact call shape — a `new URL(...)` chosen by a ternary or variable is NOT
// detected, and silently falls back to inlining the raw, un-transpiled
// source as a data: URL (which fails at runtime). Each worker therefore
// needs its own fully-literal constructor, picked by a plain if/else below.
function makeSnobolWorker(): Worker {
  return new Worker(new URL('../workers/snobol.worker.ts', import.meta.url), { type: 'module' });
}
function makeForthWorker(): Worker {
  return new Worker(new URL('../workers/forth.worker.ts', import.meta.url), { type: 'module' });
}

/**
 * Run a spell in a sandboxed interpreter worker (SNOBOL4 or Forth,
 * by spell.lang). This is the ONLY function allowed to execute spell code.
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
    const worker = spell.lang === 'forth' ? makeForthWorker() : makeSnobolWorker();

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
