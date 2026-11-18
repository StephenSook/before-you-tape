# Changelog

All notable changes to this project are listed here.

## Unreleased

### Added

- Web app shell: Vite, React and strict TypeScript, with the routes `/`, `/judge`, `/measured`, `/rules`, `/ran`, `/about`, `/worksheet` and `/blind/:token`. The `/desk/listing` and `/desk/eval` routes exist in development builds only. Verified by `src/App.test.tsx`.
- `dist/version.json` with the commit SHA and build time, written at build.
- `scripts/tone-check.ts`: fails on long dashes and curly quotes in user-facing text, and fails when it walks fewer files than its floor. Verified by `scripts/tone-check.test.ts`.
- `scripts/model-guard.ts`: fails on banned browser AI APIs and model libraries, on `availability(` outside `src/ai/gate.ts`, and on `getGenerativeModel` outside `src/ai/firebaseModels.ts`, with a floor on files walked. Verified by `scripts/model-guard.test.ts`.
- CI on GitHub Actions (`ubuntu-24.04`): lint, type check, tests, build, tone check, model guard, gitleaks over full history, and a check that no commit message carries a co-author trailer.
- Apache-2.0 `LICENSE` and `NOTICE`.
- `src/shared/itemRead.ts`: the item-read contract, 16 required fields and 37 categories from one field table, which also builds the strict JSON Schema and the parser. The parser rejects non-JSON, missing or extra fields, wrong types, unknown enum values and negative numbers, names the bad field, and clips label text to 160 characters. Verified by `src/shared/itemRead.test.ts`.
- `src/engine/types.ts` and `src/engine/edition.ts`: rules engine types and a strict, hashed rule edition loader. Unknown fields on rules and destination lines are refused, so no field holding USPS wording can enter. The Wh tolerance must stay below the measured 3.8% misread. The hash ignores key order. `scripts/build-edition.ts` assembles `rules/edition.json` from the part files with an id taken from its content; `--check` runs in CI and fails on a stale edition. Limits re-read at Pub 52 622.5 on 2026-11-17: 4 cells or 2 batteries, not both; cell 20 Wh and 1 g; battery 100 Wh and 2 g. Suspended destinations (12) read from the USPS service alerts page, updated 2026-11-06. Verified by `src/engine/edition.test.ts`.
- `src/engine/battery.ts`: battery facts from the printed numbers. Our code computes Wh = V x mAh / 1000 and compares it with the printed Wh; a difference above the edition tolerance is a mismatch, and the printed Wh is then not used. The measured misread (2500 mAh read beside 9.62 Wh, 3.8% off) is a mismatch at 3%. Volts outside 1 to 60, mAh outside 10 to 100,000 or Wh outside 0.05 to 400 mark the read implausible. A battery counts as a cell only when the sender says one cell; above 5 V or above 20 Wh it counts as a battery; otherwise it stays unknown. Verified by `src/engine/battery.test.ts`.
