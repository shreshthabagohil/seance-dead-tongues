# Séance: Dead Tongues 🔮

> *Hold a séance with the ghost of SNOBOL4 — in your browser, offline.*

**DEV Week 4 "Ghost in the Machine" submission · #devchallenge #hf26challenge**

[![CI](https://github.com/shreshthabagohil/seance-dead-tongues/actions/workflows/deploy.yml/badge.svg)](https://github.com/shreshthabagohil/seance-dead-tongues/actions)

---

## What it is

SNOBOL4 was a text-processing programming language built at Bell Labs in 1962. It died quietly in the 1980s. This app lets you ask it questions.

Ask about its history, creators (Griswold, Farber, Polonsky), its pattern-matching model, its influence on Perl and Python. **Cast spells** — verified SNOBOL4 programs that run live in your browser via WebAssembly.

Everything runs in your browser. Nothing is sent to a server. After one ~0.7 GB model download, it works on an airplane.

---

## Quick start

```
npm install
npm run dev
```

Chrome or Edge desktop (WebGPU + shader-f16). Any modern browser gets **Lite mode** — same answers, no model download.

---

## How it works

```
user question
    ↓
Sanitizer (200-char cap, attack patterns)
    ↓
Router (empty / attack / smalltalk / spell intent / grounded path)
    ↓
BM25 Retriever (custom stemmer + synonym groups)
    ↓
Gate (coverage ≥ 0.5, score ≥ 1.5 → PASS / AMBIG / FADE)
    ↓
PromptBuilder (notes + question in one user message)
    ↓
Gemma 3 1B via WebLLM (temperature 0.3, max 100 tokens)
    ↓
Verifier (length, forbidden phrases, novelty ratio ≤ 0.25)
    ↓
ghost answer (or extractive fallback)
```

**The gate is the real defense.** The model is never called unless the query matches the notes. Out-of-scope questions fail before the model sees them.

---

## Results (Node eval, 30 questions)

| Metric | Result |
|---|---|
| Retrieval hit@3 | **18 / 18** ✅ |
| False-reject (in-scope → FADE) | **0 / 18** ✅ |
| False-accept (out-of-scope → answer) | **0 / 6** ✅ |
| Unit tests | **107 / 107** ✅ |
| Verified SNOBOL4 spells | **7** ✅ |

---

## Stack

- TypeScript + Vite + React 18
- [WebLLM 0.2.86](https://github.com/mlc-ai/web-llm) — Gemma 3 1B in-browser via WebGPU
- In-house BM25 retrieval + custom stemmer (107 unit tests)
- [snoflake](https://github.com/rumblesan/snoflake) (BSD-2) — SNOBOL4 → WASM
- `vite-plugin-pwa` (Workbox) — offline app shell
- GitHub Actions → GitHub Pages

---

## Browsers

| Browser | Mode |
|---|---|
| Chrome / Edge desktop (WebGPU + shader-f16) | Full (Gemma 3 1B) |
| All modern browsers | Lite (notes only, instant) |

---

## License

MIT. Spell content: snoflake (BSD-2), Rosetta Code (GFDL, linked not copied). Model: Gemma Terms of Use. WebLLM: Apache 2.0.
