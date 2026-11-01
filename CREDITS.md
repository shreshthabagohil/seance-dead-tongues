# Credits & Dependency Licenses

Every direct runtime/build dependency, its exact pinned version, and its license
(see NOTICE for the Gemma model terms, which are separate from software licenses).

## Runtime

| Package | Version | License | Why |
|---|---|---|---|
| `@mlc-ai/web-llm` | 0.2.86 | Apache-2.0 | Runs Gemma 3 1B in-browser over WebGPU |
| `react` | 19.3.1 | MIT | UI |
| `react-dom` | 19.3.1 | MIT | UI |
| `snoflake` | 1.1.9 | BSD-2-Clause | SNOBOL4 interpreter → WASM, runs verified spells |
| `waforth` | 0.20.1 | MIT | Forth interpreter → WASM, runs verified spells |

## Build / dev

| Package | Version | License |
|---|---|---|
| `@playwright/test` | 1.64.1 | Apache-2.0 |
| `@vitejs/plugin-react` | 6.1.2 | MIT |
| `@vitest/coverage-v8` | 5.0.5 | MIT |
| `eslint-plugin-no-unsanitized` | 4.1.5 | MPL-2.0 |
| `oxlint` | 1.90.0 | MIT |
| `tsx` | 4.23.15 | MIT |
| `typescript` | 7.0.2 | Apache-2.0 |
| `vite` | 8.3.5 | MIT |
| `vite-plugin-pwa` | 2.0.0 | MIT |
| `vitest` | 5.0.5 | MIT |
| `workbox-window` | 7.4.1 | MIT |

## Model

Gemma 3 1B IT (`gemma3-1b-it-q4f16_1-MLC`) — Gemma Terms of Use, not a software
license. See [NOTICE](./NOTICE).

## Content

Spell descriptions and persona notes reference Rosetta Code (GFDL) — linked,
not copied verbatim.

Dependency count: 5 direct runtime packages (target in SECURITY.md: ≤ 12).
