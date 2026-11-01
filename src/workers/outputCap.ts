// ============================================================
// Séance: Dead Tongues — outputCap.ts
// Shared 4,000-character output cap for interpreter workers (VULN-007).
// A runaway spell (infinite output loop) fills this and stops growing;
// the wall-clock Worker.terminate() in runner.ts still kills the worker.
// ============================================================

export interface CappedAppender {
  append(chunk: string): void;
  readonly value: string;
  readonly truncated: boolean;
}

export function makeCappedAppender(max = 4000): CappedAppender {
  let value = '';
  let truncated = false;
  return {
    append(chunk: string) {
      if (truncated) return;
      value += chunk;
      if (value.length > max) {
        value = value.slice(0, max);
        truncated = true;
      }
    },
    get value() {
      return value;
    },
    get truncated() {
      return truncated;
    },
  };
}
