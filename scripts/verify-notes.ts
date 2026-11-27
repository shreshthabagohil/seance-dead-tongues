// scripts/verify-notes.ts
// Validates public/data/notes.json against schema and URL allowlist
// Run: npx tsx scripts/verify-notes.ts
// CI fails (exit 1) on any error

import { readFileSync } from 'fs';
import { resolve } from 'path';

const NOTES_PATH = resolve('public/data/notes.json');

const URL_ALLOWLIST = [
  'https://archive.org/details/snobol4programmi00gris',
  'https://en.wikipedia.org/wiki/SNOBOL',
  'https://en.wikipedia.org/wiki/SPITBOL',
  'https://en.wikipedia.org/wiki/Icon_(programming_language)',
  'https://archive.org/details/macroimplementat0000gris',
  'https://rosettacode.org/wiki/SNOBOL4',
];

const EXPECTED_IDS = Array.from({ length: 30 }, (_, i) => `N${i + 1}`);

interface NoteSource {
  url: string;
  title: string;
}

interface Note {
  id: string;
  title: string;
  text: string;
  source: NoteSource;
  reviewed_by_shane: boolean;
}

function isAllowedUrl(url: string): boolean {
  return URL_ALLOWLIST.some((allowed) => url === allowed || url.startsWith(allowed + '#') || url.startsWith(allowed + '/'));
}

let notes: Note[];
try {
  const raw = readFileSync(NOTES_PATH, 'utf-8');
  notes = JSON.parse(raw) as Note[];
} catch (e) {
  console.error(`FAIL: Cannot read ${NOTES_PATH}:`, e);
  process.exit(1);
}

let errors = 0;
let warnings = 0;

// 1. Must be an array of exactly 30 notes
if (!Array.isArray(notes)) {
  console.error('FAIL: notes.json root must be an array');
  process.exit(1);
}

if (notes.length !== 30) {
  console.error(`FAIL: Expected 30 notes, got ${notes.length}`);
  errors++;
}

// 2. Check all expected IDs are present
const foundIds = new Set(notes.map((n) => n.id));
for (const id of EXPECTED_IDS) {
  if (!foundIds.has(id)) {
    console.error(`FAIL: Missing note ${id}`);
    errors++;
  }
}

// 3. Check for duplicate IDs
const seen = new Set<string>();
for (const note of notes) {
  if (seen.has(note.id)) {
    console.error(`FAIL: Duplicate note ID: ${note.id}`);
    errors++;
  }
  seen.add(note.id);
}

// 4. Per-note field validation
for (const note of notes) {
  const id = note.id ?? '(unknown)';

  if (!note.id || typeof note.id !== 'string') {
    console.error(`FAIL [${id}]: Missing or invalid 'id'`);
    errors++;
  }
  if (!note.title || typeof note.title !== 'string') {
    console.error(`FAIL [${id}]: Missing or invalid 'title'`);
    errors++;
  }
  if (!note.text || typeof note.text !== 'string' || note.text.trim().length < 20) {
    console.error(`FAIL [${id}]: Missing or too-short 'text' (min 20 chars)`);
    errors++;
  }
  if (!note.source || typeof note.source !== 'object') {
    console.error(`FAIL [${id}]: Missing 'source' object`);
    errors++;
  } else {
    if (!note.source.url || typeof note.source.url !== 'string') {
      console.error(`FAIL [${id}]: Missing 'source.url'`);
      errors++;
    } else if (!isAllowedUrl(note.source.url)) {
      console.error(`FAIL [${id}]: source.url not in allowlist: ${note.source.url}`);
      errors++;
    }
    if (!note.source.title || typeof note.source.title !== 'string') {
      console.error(`FAIL [${id}]: Missing 'source.title'`);
      errors++;
    }
  }
  if (typeof note.reviewed_by_shane !== 'boolean') {
    console.error(`FAIL [${id}]: 'reviewed_by_shane' must be a boolean`);
    errors++;
  } else if (note.reviewed_by_shane === false) {
    console.warn(`WARN [${id}]: reviewed_by_shane is false — review and set to true`);
    warnings++;
  }
}

// Summary
if (errors > 0) {
  console.error(`\n✗ verify-notes: ${errors} error(s), ${warnings} warning(s). Fix before merging.`);
  process.exit(1);
} else {
  console.log(`✓ verify-notes: all 30 notes valid. ${warnings} warning(s) (reviewed_by_shane: false).`);
  process.exit(0);
}
