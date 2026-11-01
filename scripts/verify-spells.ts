/**
 * verify-spells.ts
 * CI script: lint all spells and run them through the real interpreter,
 * each in its OWN child process with a hard wall-clock timeout.
 *
 * Why a child process per spell (BUG-014, TESTING.md): snoflake's session
 * busy-loops forever on a source with no END, which blocks the Node event
 * loop — an in-process JS setTimeout can never fire against that, so it is
 * not a real guard. A spawned child process can be killed from outside its
 * own event loop. The same isolation also protects against a WAForth
 * memory leak observed empirically: creating many WAForth instances in one
 * JS process accumulates WASM memory until the process OOMs; one spell per
 * process means that memory is reclaimed by the OS when each one exits.
 *
 * Run: npx tsx scripts/verify-spells.ts
 */
import { readFileSync } from 'fs';
import { spawnSync } from 'child_process';
import type { Spell } from '../src/types';

const SPELLS_PATH = new URL('../public/data/spells.json', import.meta.url).pathname;
const RUNNER_PATH = new URL('./run-one-spell.mjs', import.meta.url).pathname;
const TIMEOUT_MS = 8000;

function runOne(id: string): { status: string; output: string; err?: string } {
  const res = spawnSync(process.execPath, [RUNNER_PATH, id], {
    timeout: TIMEOUT_MS,
    encoding: 'utf-8',
  });

  if (res.error && (res.error as NodeJS.ErrnoException).code === 'ETIMEDOUT') {
    return { status: 'timeout', output: '', err: `Timed out after ${TIMEOUT_MS}ms` };
  }
  if (res.signal) {
    return { status: 'timeout', output: '', err: `Killed by signal ${res.signal} (likely hung)` };
  }

  const line = (res.stdout ?? '').trim().split('\n').pop() ?? '';
  try {
    return JSON.parse(line);
  } catch {
    return { status: 'error', output: '', err: `Child process produced no parseable result: ${res.stderr || line}` };
  }
}

async function main() {
  const spells: Spell[] = JSON.parse(readFileSync(SPELLS_PATH, 'utf-8'));
  let anyFail = false;

  console.log(`\nVerifying ${spells.length} spells...\n`);

  for (const spell of spells) {
    process.stdout.write(`  [${spell.id}:${spell.lang}] ${spell.name} ... `);
    const result = runOne(spell.id);

    if (result.status === 'ok') {
      console.log(`OK  →  ${result.output.trim().split('\n').join(' | ')}`);
    } else {
      console.log(`FAIL (${result.status})`);
      if (result.err) console.log(`    ${result.err}`);
      if (result.output) console.log(`    Output: ${result.output.trim().slice(0, 200)}`);
      anyFail = true;
    }
  }

  console.log('\n' + (anyFail ? '✗ VERIFICATION FAILED' : '✓ All spells verified'));
  process.exit(anyFail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
