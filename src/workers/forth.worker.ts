// ============================================================
// Séance: Dead Tongues — forth.worker.ts
// Runs Forth programs via WAForth inside a Web Worker.
// Capability stripping applied at module load (mirrors snobol.worker.ts).
// ============================================================

// ── Capability stripping ──────────────────────────────────────────────────
// Same rationale as snobol.worker.ts: no network or storage capabilities
// for a Forth program to exfiltrate data or make network requests.
(self as unknown as Record<string, unknown>).fetch = undefined;
(self as unknown as Record<string, unknown>).XMLHttpRequest = undefined;
(self as unknown as Record<string, unknown>).WebSocket = undefined;
(self as unknown as Record<string, unknown>).importScripts = undefined;
(self as unknown as Record<string, unknown>).indexedDB = undefined;
(self as unknown as Record<string, unknown>).caches = undefined;

import WAForth, { withCharacterBuffer } from 'waforth';
import type { SpellRunResult } from '../types';
import { makeCappedAppender } from './outputCap';

// ── Message protocol ──────────────────────────────────────────────────────
// Incoming: { id: string; spellId: string; source: string }
// Outgoing: { id: string; result: SpellRunResult }
// (identical shape to snobol.worker.ts — runner.ts picks the worker file by
// spell.lang but speaks the same protocol to both)

interface WorkerRequest {
  id: string;
  spellId: string;
  source: string;
}

// WAForth reports errors as plain text on the output stream (there is no
// separate error channel), same shape of problem as BUG-015 for snoflake.
function classifyOutput(out: string, rc: unknown): 'ok' | 'error' {
  if (typeof rc === 'number' && rc !== 0) return 'error';
  if (/undefined word|stack empty|division by 0|word not supported|out of range/i.test(out)) {
    return 'error';
  }
  return 'ok';
}

self.onmessage = async (evt: MessageEvent<WorkerRequest>) => {
  const { id, spellId, source } = evt.data;
  const appender = makeCappedAppender(4000); // VULN-007 output cap

  // One fresh WAForth instance per message, discarded with the worker.
  // Empirically, creating many WAForth instances in one JS context leaks
  // WASM memory until the process OOMs — the one-worker-per-cast,
  // terminate()-after architecture in runner.ts is load-bearing here, not
  // just a security nicety.
  try {
    const f = new WAForth();
    f.onEmit = withCharacterBuffer((c) => appender.append(c));
    await f.load();

    let rc: unknown;
    try {
      rc = f.interpret(source, true);
    } catch (err) {
      const result: SpellRunResult = {
        spellId,
        status: 'error',
        output: appender.value,
        err: String(err),
      };
      self.postMessage({ id, result });
      return;
    }

    const status = appender.truncated ? 'limit' : classifyOutput(appender.value, rc);
    const result: SpellRunResult = {
      spellId,
      status,
      output: appender.value.trim(),
      truncated: appender.truncated,
    };
    self.postMessage({ id, result });
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
