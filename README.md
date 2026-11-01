# Séance: Dead Tongues 🔮

> *Hold a séance with the ghost of SNOBOL4 — in your browser, offline.*

**DEV Week 4 "Ghost in the Machine" submission · #devchallenge #hf26challenge**

[![CI](https://github.com/shreshthabagohil/seance-dead-tongues/actions/workflows/deploy.yml/badge.svg)](https://github.com/shreshthabagohil/seance-dead-tongues/actions)

---

## What it is

SNOBOL4 was a text-processing programming language built at Bell Labs in 1962. It died quietly in the 1980s. This app lets you ask it questions.

Ask about its history, creators (Griswold, Farber, Polonsky), its pattern-matching model, its influence on Perl and Python. **Cast spells** — verified SNOBOL4 *or* Forth programs, your choice, that run live in your browser via WebAssembly.

What you type never leaves this tab. Downloading the model contacts Hugging Face and GitHub, which can see your IP address. This app has no server, accounts, cookies or analytics. After one ~0.7 GB model download, it works on an airplane.

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
| Unit tests | **115 / 115** ✅ |
| Verified spells | **12** (7 SNOBOL4 + 5 Forth) ✅ |

---

## Stack

- TypeScript + Vite + React 18
- [WebLLM 0.2.86](https://github.com/mlc-ai/web-llm) — Gemma 3 1B in-browser via WebGPU
- In-house BM25 retrieval + custom stemmer (115 unit tests)
- [snoflake](https://github.com/rumblesan/snoflake) (BSD-2) — SNOBOL4 → WASM
- [WAForth](https://github.com/remko/waforth) (MIT) — Forth → WASM
- `vite-plugin-pwa` (Workbox) — offline app shell
- GitHub Actions → GitHub Pages

---

## Browsers

| Browser | Mode |
|---|---|
| Chrome / Edge desktop (WebGPU + shader-f16) | Full (Gemma 3 1B) |
| All modern browsers | Lite (notes only, instant) |

---

## Security model

No server, no accounts, no cookies, no analytics — see the privacy paragraph above.
The real defense is the **Gate**: the model is only ever called on a query that
already matched the curated notes, and its output then has to pass the
**Verifier** (closed vocabulary, no forbidden phrases, no novel numbers or
names) before it's shown. Code execution is limited to `castSpell(id)` running
a pre-verified SNOBOL4 or Forth program in a sandboxed, capability-stripped,
fresh-per-cast Web Worker — no user-typed or model-generated code is ever
executed. Full threat model,
vulnerability register and checklists: see the project's internal `SECURITY.md`
(not shipped in this repo; private reporting via [security.txt](./public/.well-known/security.txt)).

## License

MIT, see [LICENSE](./LICENSE). Model usage is separately subject to the
[Gemma Terms of Use](https://ai.google.dev/gemma/terms) — see [NOTICE](./NOTICE).
Third-party dependency licenses: [CREDITS.md](./CREDITS.md). Spell content:
snoflake (BSD-2), Rosetta Code (GFDL, linked not copied).
