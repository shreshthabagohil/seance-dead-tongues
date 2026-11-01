/**
 * run-one-spell.mjs
 * Runs exactly one spell (by id) to completion and prints its result as a
 * single JSON line on stdout. Meant to be spawned as a child process with a
 * hard wall-clock timeout by verify-spells.ts (see BUG-014/TESTING.md: a
 * spell with no END busy-loops forever in snoflake; empirically, WAForth
 * also leaks WASM memory across many instances in one process — isolating
 * each spell in its own process fixes both).
 */
import { readFileSync } from 'fs';
import { createSession } from 'snoflake';
import WAForthPkg from 'waforth';

const WAForth = WAForthPkg.default ?? WAForthPkg;
const { withCharacterBuffer } = WAForthPkg;

const SPELLS_PATH = new URL('../public/data/spells.json', import.meta.url).pathname;
const id = process.argv[2];

const SNOBOL_FORBIDDEN = ['CODE', 'EVAL', 'APPLY', 'OPSYN', 'LOAD', 'UNLOAD', 'HOST', 'EXIT', 'SETEXIT'];
const FORTH_FORBIDDEN = ['EVALUATE', 'INCLUDE', 'INCLUDED', 'REQUIRE', 'ALLOT', 'ALLOCATE', 'RESIZE', 'BIND'];

function lintSnobol(src) {
  const errs = [];
  if (!/^END(\s|$)/m.test(src)) errs.push('Missing END statement — will hang');
  for (const b of SNOBOL_FORBIDDEN) {
    if (new RegExp(`\\b${b}\\s*\\(`, 'i').test(src)) errs.push(`Forbidden builtin: ${b}`);
  }
  if (/INPUT\s*\(/i.test(src)) errs.push('Forbidden: INPUT(');
  if (/OUTPUT\s*\([^)]+\)/i.test(src)) errs.push('Forbidden: OUTPUT(');
  if (/\$/.test(src)) errs.push('Forbidden: $ (indirect reference)');
  for (const m of src.matchAll(/DUPL\s*\([^)]*\)/gi)) {
    const n = m[0].match(/,\s*(\d+)\s*\)/);
    if (!n) errs.push('DUPL repetition count must be a literal integer');
    else if (parseInt(n[1], 10) > 1000) errs.push(`DUPL repetition count ${n[1]} exceeds 1000`);
  }
  return errs;
}

function lintForth(src) {
  const errs = [];
  for (const w of FORTH_FORBIDDEN) {
    if (new RegExp(`\\b${w}\\b`, 'i').test(src)) errs.push(`Forbidden word: ${w}`);
  }
  return errs;
}

function classifySnobol(out) {
  if (/^LIMIT ON STATEMENT EXECUTION EXCEEDED$/m.test(out)) return 'limit';
  if (/^(ERROR\s+\d+ IN STATEMENT|ERRORS DETECTED IN SOURCE PROGRAM)/m.test(out)) return 'error';
  return 'ok';
}

function classifyForth(out, rc) {
  if (typeof rc === 'number' && rc !== 0) return 'error';
  if (/undefined word|stack empty|division by 0|word not supported|out of range/i.test(out)) return 'error';
  return 'ok';
}

async function runSnobol(src) {
  return new Promise((resolve) => {
    let output = '';
    try {
      const s = createSession({
        source: src,
        stlimit: 1_000_000,
        onOutput: (line) => { output += line + '\n'; },
        onError: (line) => { output += line + '\n'; },
        onDone: () => resolve({ status: classifySnobol(output), output: output.trim() }),
      });
      s.start();
    } catch (err) {
      resolve({ status: 'error', output, err: String(err) });
    }
  });
}

async function runForth(src) {
  let output = '';
  const f = new WAForth();
  f.onEmit = withCharacterBuffer((c) => { output += c; });
  await f.load();
  let rc;
  try {
    rc = f.interpret(src, true);
  } catch (err) {
    return { status: 'error', output, err: String(err) };
  }
  return { status: classifyForth(output, rc), output: output.trim() };
}

async function main() {
  const spells = JSON.parse(readFileSync(SPELLS_PATH, 'utf-8'));
  const spell = spells.find((s) => s.id === id);
  if (!spell) {
    console.log(JSON.stringify({ status: 'error', output: '', err: `No such spell: ${id}` }));
    process.exit(1);
  }

  const lintErrs = spell.source.trim()
    ? (spell.lang === 'forth' ? lintForth(spell.source) : lintSnobol(spell.source))
    : ['Empty source'];
  if (lintErrs.length > 0) {
    console.log(JSON.stringify({ status: 'error', output: '', err: `Lint: ${lintErrs.join('; ')}` }));
    process.exit(1);
  }

  const result = spell.lang === 'forth' ? await runForth(spell.source) : await runSnobol(spell.source);
  console.log(JSON.stringify(result));
  process.exit(result.status === 'ok' ? 0 : 1);
}

main().catch((e) => {
  console.log(JSON.stringify({ status: 'error', output: '', err: String(e) }));
  process.exit(1);
});
