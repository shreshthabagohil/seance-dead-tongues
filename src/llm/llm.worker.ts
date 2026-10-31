// ============================================================
// Séance: Dead Tongues — llm.worker.ts
// WebLLM Web Worker entry point
// This file is referenced by engine.ts via new URL(...)
// ============================================================

import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm';

// Capability stripping — LLM worker doesn't need these
(self as unknown as Record<string, unknown>).XMLHttpRequest = undefined;
(self as unknown as Record<string, unknown>).WebSocket = undefined;
(self as unknown as Record<string, unknown>).indexedDB = undefined;
// NOTE: fetch and caches MUST remain — WebLLM uses them to download/cache model weights

const handler = new WebWorkerMLCEngineHandler();

self.onmessage = (msg: MessageEvent) => {
  handler.onmessage(msg);
};
