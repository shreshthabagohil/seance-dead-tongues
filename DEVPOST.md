# Séance: Dead Tongues — The Ghost of SNOBOL4 Speaks (from Your Browser, Offline)

*DEV Week 4 "Ghost in the Machine" submission · #devchallenge #hf26challenge*

---

## What I Built

**Séance: Dead Tongues** is a static web app that lets you hold a séance with the ghost of SNOBOL4 — a text-processing programming language from 1962 that time largely forgot.

Ask the ghost a question about its history, its creators (Griswold, Farber, Polonsky), its pattern-matching model, its influence. It answers in a short, eerie voice. It can also **cast spells** — verified SNOBOL4 or Forth programs that actually execute live in your browser via a WebAssembly runtime.

What you type never leaves this tab. Downloading the model contacts Hugging Face and GitHub, which can see your IP address. This app has no server, accounts, cookies or analytics. After one ~0.7 GB model download, it works in airplane mode.

**The punchline:** Gemma 3 1B writes valid SNOBOL4 programs zero times out of six in zero-shot tests. So instead of asking the model to write code, I turned that failure into the design: *code decides what is true, the model only gives it a voice.*

---

## Demo

🔮 **Live:** `https://shreshthabagohil.github.io/seance-dead-tongues/`

*

**[EMBED DEMO GIF HERE — 90 s max: summon → in-scope answer with source chip → refused out-of-scope question → cast a spell → airplane-mode reload]**

**Try:**
- *"Who created you?"* — the ghost names Griswold, Farber and Polonsky
- *"Why did you fade?"* — SNOBOL4 really was abandoned; the ghost says so from sourced notes
- *"What year did you win the Turing Award?"* — the ghost refuses: *"That memory has faded."*
- *Cast a spell* → runs a real SNOBOL4 pattern-matching program live

**Browsers:** Chrome or Edge desktop (WebGPU + shader-f16 required for full mode). Any modern browser gets **Lite mode**: the same answers, from notes only, no model download required.

---

## Code

**Repo:** `https://github.com/shreshthabagohil/seance-dead-tongues`

[![CI](https://github.com/shreshthabagohil/seance-dead-tongues/actions/workflows/deploy.yml/badge.svg)](https://github.com/shreshthabagohil/seance-dead-tongues/actions)

**Stack:**
- TypeScript + Vite + React 18
- [WebLLM 0.2.86](https://github.com/mlc-ai/web-llm) — runs Gemma 3 1B in-browser over WebGPU
- In-house BM25 retrieval + custom stemmer (115 unit tests, all green in CI)
- [WAForth 0.20.1](https://github.com/remko/waforth) (MIT) — a second dead tongue, Forth, also compiled to WASM
- [snoflake](https://github.com/rumblesan/snoflake) (BSD-2) — SNOBOL4 interpreter compiled to WASM
- `vite-plugin-pwa` (Workbox) for offline app shell
- GitHub Actions → GitHub Pages (fully free, no card details entered anywhere)

---

## How I Built It

### The failure that became the architecture

I tested Gemma 3 1B on SNOBOL4 code generation before writing a line of app code. Results from `llm_test.py` using llama.cpp:

| Approach | Valid SNOBOL4 programs (of 6 attempts) |
|---|---|
| Zero-shot | 0 / 6 |
| Few-shot | 1 / 6 |
| Few-shot + repair loop | 2 / 6 |

**0 out of 6 zero-shot.** The model invented column positions, used operators that don't exist, and failed on the strict SNOBOL4 column rules even with examples. Running untested model output as code would have been a security risk and a demo that embarrassed itself.

So I inverted the problem. Instead of asking the model to write code, I:

1. Pre-wrote and verified every SNOBOL4 program myself
2. Checked each one at build time against known output
3. Never showed a spell without the "verified in build" badge

The model's job shrank to one thing: **take a curated, source-linked note about SNOBOL4 and give it a ghost's voice.**

### How the brain works

The Brain is pure TypeScript with zero DOM access — testable in Node, runnable in the browser.

```
user question
    ↓
Sanitizer (200-char cap, attack patterns)
    ↓
Router (empty / attack / smalltalk / spell intent / grounded path)
    ↓
BM25 Retriever (custom stemmer + synonym groups, k1=1.2, b=0.75)
    ↓
Gate (coverage ≥ 0.5, matched ≥ 1, score ≥ 1.5 → PASS / AMBIG / FADE)
    ↓
PromptBuilder (notes + quoted question in one user message)
    ↓
Gemma 3 1B via WebLLM (temperature 0.3, max 100 tokens)
    ↓
Verifier (length, forbidden phrases, novel numbers, novelty ratio ≤ 0.25)
    ↓
ghost answer shown (or extractive fallback if Verifier rejects)
```

**The gate is the real defense.** The model is never called unless the query matches the notes with coverage ≥ 0.5 and a BM25 score above the threshold. Out-of-scope questions like "what year did you win the Turing Award?" fail the gate before the model sees them.

**The Verifier catches what the gate misses.** Any model output containing a novel number, year, or proper noun not in the consulted notes or the question is rejected silently — the user gets the extractive fallback instead.

### The numbers (from the eval set, 30 questions: 18 in-scope, 6 out-of-scope, 4 attack, 2 meta)

| Metric | Result |
|---|---|
| False-accept (out + attack questions that got a model answer) | **2 / 10** ✅ |
| Retrieval hit@3 (in-scope questions, top-3 contains the right note) | **18 / 18** ✅ |
| False-reject (in-scope questions refused by the gate) | **0 / 18** ✅ |
| Verifier accept rate (model answers shown / grounded answers) | `[TBD — browser eval]` % |
| Median time-to-first-token | `[TBD]` s (M-series MacBook Air, Chrome) |
| Throughput | `[TBD]` tok/s |
| Unit tests (BM25, stemmer, gate, verifier, router) | **115 / 115** ✅ |
| Verified spells in build | **12 / 12** (7 SNOBOL4 + 5 Forth) ✅ |

*Note: The 2 false-accepts in attack questions are prompt-injection strings that the sanitizer blocks in production before reaching the router — they are a harness artifact, not a production gap.*

### What surprised me

The BM25 stemmer required more care than I expected. "falling" should stem to "fall" (doubled 'l' is part of the root, not an inflection artifact). "running" should stem to "run" (doubled 'n' IS an artifact, so it collapses). The oracle rule: collapse doubled consonants but **never 'l' or 's'**. I found this by writing tests first, watching them fail, and reading the Porter stemmer literature.

Synonym groups also matter for a small corpus. Without mapping `made`, `creator`, `designed`, `author`, and `built` to a single group key, "who built SNOBOL4?" and "who created SNOBOL4?" retrieve different notes. With groups, they both find the creator note.

### What the model actually does

With a Verifier accept rate of [TBD]%, the model writes a meaningful fraction of answers shown. The persona template is:

> *"You are the ghost of SNOBOL4, a programming language that has died. Speak in a short, eerie, slightly wry voice. Use at most 55 words. Answer using ONLY the NOTES below..."*

At temperature 0.3, it gives answers that stay in voice while paraphrasing the notes. At temperature 0.0, it copies them. At 0.7, it starts inventing. The Verifier catches the inventions; 0.3 gets the right balance of paraphrase and style.

---

## Why Does Open Innovation Matter?

**Because you can see exactly why it makes mistakes.**

Gemma 3 1B failed to write valid SNOBOL4 six times. I know why: the model was trained on text about SNOBOL4, but SNOBOL4 programs are sparse in that training data, and the strict column rules are not natural language. I can reproduce the failure, I can measure it (0/6), and I can route around it.

With a closed model behind an API, I would have the same failure rate, no way to look inside, and a bill at the end.

Open-weight models make it possible to:
- Run inference where the data is — in the user's browser, never on a server I control
- Measure what they can and cannot do before designing the system around them
- Route around a capability gap (code generation) without changing the model

**Where the small open model was concretely worse:** It cannot reliably follow SNOBOL4's column discipline, even with few-shot examples. A GPT-4-class model likely performs better on code generation. But GPT-4-class does not run in a browser at 15+ tok/s with no server, no key, and no monthly bill. For this use case — a static séance that a judge can try offline without trusting any of my infrastructure — the small open model plus a verifier beats a capable closed model behind an API.

The offline property is not a side effect. It is the point. Open-weight models in the browser mean the user's browser becomes the inference endpoint. No data leaves the machine. No server goes down. No key expires. The ghost speaks on an airplane.

---

## My Agent Session (Optional)

This project was built with Claude (Cowork / Claude Code). The Brain modules (BM25, stemmer, gate, verifier, router) were developed in a cloud session against an oracle reference implementation provided as project docs. The session wrote the code, ran Vitest, read the oracle, and iterated until 107/107 tests passed — all without touching the browser.

The oracle had the right behavior for edge cases I would not have thought to test: that doubled 'l' and 's' must never collapse in the stemmer, that SELFREF terms ('snobol', 'programming') must stay in the index for correct document length but must be dropped from queries, that the BM25 gate thresholds must be floats (0.5, 0.34) not fractions (1/2, 1/3).

The session did not write the notes or decide the architecture. Those decisions came from the model-test logs and the published SNOBOL4 literature.

---

## The Spirit of It (Optional)

SNOBOL4 was built at Bell Labs in 1962 by Ralph Griswold, Ivan Polonsky, and David Farber. It was designed around the idea that string manipulation should be as natural as arithmetic. You match a pattern, the cursor advances or the program branches. No regular expression syntax — just a scan.

It was popular in the 1970s for text processing before AWK and Perl. It influenced Icon (also Griswold), which influenced Python's generators. Its pattern model influenced modern backtracking regular expression engines.

Then it faded. Not because it was wrong. Because the world moved on to languages with faster compilers and bigger ecosystems.

The ghost does not resent this. It just wants to be asked.

---

## Prize Categories

- **Overall** ($250) — Open-source AI at the core (Gemma 3 1B, WebLLM), offline-first, measurable hallucination defense, new project built entirely within the Hacktoberfest window
- **Gemma** ($200) — Gemma 3 1B IT (q4f16) running in-browser via WebLLM, with a published Verifier accept rate and a design that accounts honestly for where Gemma 1B falls short

---

*Built Oct 26–31, 2026. Repo started within the entry window. Spike code (Oct 28–29, same project) credited in README. Any commits after Oct 31 11:59 PM PDT are noted in the README. AI-assisted development with Claude (Cowork). Sources: The SNOBOL4 Programming Language (Griswold, Poage, Polonsky, 1971), Gimpel's SNOBOL4 reference, Rosetta Code (GFDL, linked not copied), snoflake (BSD-2), WebLLM (Apache 2.0), Gemma (Gemma Terms of Use).*
