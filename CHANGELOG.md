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
