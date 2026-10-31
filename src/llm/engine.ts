// ============================================================
// Séance: Dead Tongues — engine.ts
// WebLLM engine initialization and capability probe
// Model: gemma3-1b-it-q4f16_1-MLC (~711MB)
// ============================================================

import { CreateWebWorkerMLCEngine, type MLCEngine } from '@mlc-ai/web-llm';
import type { CapabilityResult } from '../types';

export const MODEL_ID = 'gemma3-1b-it-q4f16_1-MLC';

// ── Capability probe ──────────────────────────────────────────────────────

/**
 * Probe browser capabilities needed for WebLLM.
 * Returns a CapabilityResult with details on what is/isn't available.
 *
 * Probes:
 *   hasGpu        — navigator.gpu exists (WebGPU available)
 *   hasShaderF16  — adapter has 'shader-f16' feature (required for gemma3)
 *   hasStorage    — Cache API available (for model weight caching)
 *   hasModelInCache — model is already cached (skip download)
 */
export async function probeCapabilities(): Promise<CapabilityResult> {
  let hasGpu = false;
  let hasShaderF16 = false;
  let hasStorage = false;
  let hasModelInCache = false;

  // GPU check
  if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
    hasGpu = true;
    try {
      const adapter = await (navigator as Navigator & { gpu: GPU }).gpu.requestAdapter();
      if (adapter) {
        hasShaderF16 = adapter.features.has('shader-f16');
      }
    } catch {
      hasShaderF16 = false;
    }
  }

  // Storage check (Cache API)
  if (typeof caches !== 'undefined') {
    hasStorage = true;
    // Check if model weights are cached
    try {
      const cacheNames = await caches.keys();
      // WebLLM caches under 'webllm/model' or similar
      for (const name of cacheNames) {
        if (name.includes('webllm') || name.includes('mlc') || name.includes(MODEL_ID)) {
          const cache = await caches.open(name);
          const keys = await cache.keys();
          if (keys.length > 0) {
            hasModelInCache = true;
            break;
          }
        }
      }
    } catch {
      // Cache API exists but couldn't check — leave hasModelInCache false
    }
  }

  let blocked: string | null = null;
  if (!hasGpu) blocked = 'WebGPU not available in this browser';
  else if (!hasShaderF16) blocked = 'GPU adapter lacks shader-f16 feature (required for Gemma 3)';

  return { hasGpu, hasShaderF16, hasStorage, hasModelInCache, blocked };
}

// ── Engine singleton ──────────────────────────────────────────────────────

let _engine: MLCEngine | null = null;

/**
 * Initialize (or return cached) WebLLM engine.
 *
 * @param onProgress  callback for download progress 0–100
 */
export async function getEngine(
  onProgress: (pct: number) => void
): Promise<MLCEngine> {
  if (_engine) return _engine;

  _engine = await CreateWebWorkerMLCEngine(
    new Worker(new URL('./llm.worker.ts', import.meta.url), { type: 'module' }),
    MODEL_ID,
    {
      initProgressCallback: (info) => {
        // info.progress is 0–1
        onProgress(Math.round(info.progress * 100));
      },
    }
  ) as unknown as MLCEngine;

  return _engine!;
}

/**
 * Reset the engine (e.g. on unrecoverable error).
 */
export function resetEngine(): void {
  _engine = null;
}
