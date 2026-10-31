/**
 * verify-spells.ts
 * CI script: lint all spells and run them through snoflake to verify output.
 * Run: npx tsx scripts/verify-spells.ts
 */

import { readFileSync } from 'fs';
import { createSession } from 'snoflake';
import type { Spell } from '../src/types';

const SPELLS_PATH = new URL('../public/data/spells.json', import.meta.url).pathname;

// Linting rules
const FORBIDDEN_BUILTINS = ['CODE', 'EVAL', 'APPLY', 'OPSYN', 'LOAD', 'UNLOAD', 'HOST', 'EXIT', 'SETEXIT'];

function lintSpell(spell: Spell): string[] {
  const errors: string[] = [];
  const src = spell.source;

  // Must have END statement
  if (!/^END(\s|$)/m.test(src)) {
    errors.push('Missing END statement — snoflake will hang without it');
  }

  // Forbidden builtins
  for (const b of FORBIDDEN_BUILTINS) {
    if (new RegExp(`\\b${b}\\s*\\(`, 'i').test(src)) {
      errors.push(`Forbidden builtin: ${b}`);
    }
  }

  // INPUT( and OUTPUT( with parens (parametrised form)
  if (/INPUT\s*\(/i.test(src)) errors.push('Forbidden: INPUT( (parametrised form)');
  // OUTPUT( is allowed as assignment target but not as a function call with argument
  // Simple heuristic: OUTPUT(...) where there's content inside
  if (/OUTPUT\s*\([^)]+\)/i.test(src)) errors.push('Forbidden: OUTPUT( (function-call form)');

  // Dollar-sign indirection — unsafe
  if (/\$/.test(src)) errors.push('Forbidden: $ (indirect reference)');

  // DUPL argument must be literal <= 1000
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

async function runSpell(spell: Spell): Promise<{ output: string; status: 'ok' | 'error' | 'limit' | 'timeout' }> {
  return new Promise((resolve) => {
    let output = '';
    const timer = setTimeout(() => {
      resolve({ output, status: 'timeout' });
    }, 8000);

    try {
      const s = createSession({
        source: spell.source,
        stlimit: 1_000_000,
        onOutput: (line: string) => { output += line + '\n'; },
        onError: (line: string) => { output += line + '\n'; },
        onDone: () => {
          clearTimeout(timer);
          if (/^LIMIT ON STATEMENT EXECUTION EXCEEDED$/m.test(output)) {
            resolve({ output, status: 'limit' });
          } else if (/^(ERROR\s+\d+ IN STATEMENT|ERRORS DETECTED IN SOURCE PROGRAM)/m.test(output)) {
            resolve({ output, status: 'error' });
          } else {
            resolve({ output, status: 'ok' });
          }
        },
      });
      s.start();
    } catch (err) {
      clearTimeout(timer);
      resolve({ output: String(err), status: 'error' });
    }
  });
}

async function main() {
  const spells: Spell[] = JSON.parse(readFileSync(SPELLS_PATH, 'utf-8'));
  let anyFail = false;

  console.log(`\nVerifying ${spells.length} spells...\n`);

  for (const spell of spells) {
    process.stdout.write(`  [${spell.id}] ${spell.name} ... `);

    // Lint
    const lintErrors = lintSpell(spell);
    if (lintErrors.length > 0) {
      console.log('LINT FAIL');
      for (const e of lintErrors) console.log(`    ✗ ${e}`);
      anyFail = true;
      continue;
    }

    // Run
    const result = await runSpell(spell);
    if (result.status === 'ok') {
      console.log(`OK  →  ${result.output.trim().split('\n').join(' | ')}`);
    } else {
      console.log(`FAIL (${result.status})`);
      console.log(`    Output: ${result.output.trim().slice(0, 200)}`);
      anyFail = true;
    }
  }

  console.log('\n' + (anyFail ? '✗ VERIFICATION FAILED' : '✓ All spells verified'));
  process.exit(anyFail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
