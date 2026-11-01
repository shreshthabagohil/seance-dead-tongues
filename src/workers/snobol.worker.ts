// ============================================================
// Séance: Dead Tongues — snobol.worker.ts
// Runs SNOBOL4 programs via snoflake inside a Web Worker.
// Capability stripping applied at module load.
// ============================================================

// ── Capability stripping ──────────────────────────────────────────────────
// Remove all network and storage capabilities from this worker.
// This prevents any SNOBOL program from exfiltrating data or
// making network requests, even via snoflake extensions.
(self as unknown as Record<string, unknown>).fetch = undefined;
(self as unknown as Record<string, unknown>).XMLHttpRequest = undefined;
(self as unknown as Record<string, unknown>).WebSocket = undefined;
(self as unknown as Record<string, unknown>).importScripts = undefined;
(self as unknown as Record<string, unknown>).indexedDB = undefined;
(self as unknown as Record<string, unknown>).caches = undefined;

import { createSession } from 'snoflake';
import type { SpellRunResult } from '../types';
import { makeCappedAppender } from './outputCap';

// ── Message protocol ──────────────────────────────────────────────────────
// Incoming: { id: string; spellId: string; source: string }
// Outgoing: SpellRunResult

interface WorkerRequest {
  id: string;
  spellId: string;
  source: string;
}

function classifyOutput(out: string): 'ok' | 'error' | 'limit' {
  // CRITICAL priority order: limit BEFORE error (BUG-015 fix)
  // Also: ERROR\s+\d+ (not single space) to match "ERROR  1" with double space
  if (/^LIMIT ON STATEMENT EXECUTION EXCEEDED$/m.test(out)) return 'limit';
  if (/^(ERROR\s+\d+ IN STATEMENT|ERRORS DETECTED IN SOURCE PROGRAM)/m.test(out)) return 'error';
  return 'ok';
}

self.onmessage = (evt: MessageEvent<WorkerRequest>) => {
  const { id, spellId, source } = evt.data;

  // Guard: empty source or no END → do NOT run (would hang on s.end())
  // The caller (runner.ts) should have linted this first, but belt+suspenders.
  if (!source.trim() || !/^END(\s|$)/m.test(source)) {
    const result: SpellRunResult = {
      spellId,
      status: 'error',
      output: '',
      err: 'Source is empty or missing END — refusing to run (would hang)',
    };
    self.postMessage({ id, result });
    return;
  }

  const appender = makeCappedAppender(4000); // VULN-007 output cap

  try {
    const s = createSession({
      source,
      stlimit: 1_000_000, // browser limit (NOT 3_000_000 from Node spike)
      onOutput: (line: string) => { appender.append(line + '\n'); },
      onError: (line: string) => { appender.append(line + '\n'); },
      onDone: () => {
        const status = appender.truncated ? 'limit' : classifyOutput(appender.value);
        const result: SpellRunResult = {
          spellId,
          status,
          output: appender.value.trim(),
          truncated: appender.truncated,
        };
        self.postMessage({ id, result });
        // NOTE: We intentionally do NOT call s.end() here.
        // The outer caller (runner.ts) sets a wall-clock timer and calls
        // Worker.terminate() if we don't respond in time. Calling s.end()
        // on an already-done session is safe but unnecessary.
      },
    });
    s.start();
  } catch (err) {
    const result: SpellRunResult = {
      spellId,
      status: 'error',
      output: appender.value,
      err: String(err),
    };
    self.postMessage({ id, result });
  }
};
