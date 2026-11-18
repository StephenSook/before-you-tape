# Extension changelog

## 0.0.1

### Task 1 - Lane setup (2026-11-18 16:05:21 EST)

- Added the extension build entry and wired extension files into tests, types, lint, tone and the model guard.
- Added a test for engine copies in tracked and untracked extension source.
- The pinned Chrome types are absent in the offline install. No dependency was added.
- Git cannot create `.git/index.lock` in this sandbox. Changes are in the working tree.
- Layout tests: red 1 (4 failed), green 0 (4 passed). See `tests/extension/layout.test.ts`.
- `edition:check`, `tone`, and `guard` hit a sandbox socket error. Running each script with `node --import tsx` returned 0. `ext:build` and `ext:check` await Tasks 3 and 8.

- npm exit codes: edition:check 1, lint 0, typecheck 0, test 0, build 0, tone 1, guard 1, ext:build 1, ext:check 1.
### Task 3 - Manifest and panel shell (2026-11-18 16:09:36 EST)

- Built the Manifest V3 shell, toolbar worker, and session-only tab handoff.
- Shell tests: red 1 (missing manifest), green 0 (4 passed). See `extension/src/shell.test.ts`.
- Built and checked a local draft zip. Unpacked Chrome, screenshots, and store upload were outside the local verification. Package checks await Task 8.

- npm exit codes: edition:check 1, lint 0, typecheck 0, test 0, build 0, tone 1, guard 1, ext:build 0, ext:check 1.

### Task 4 - Typed verdicts (2026-11-18 16:11:55 EST)

- Added the typed form, shared-engine check, verdict icons, reason, and follow-up answer.
- Typed and verdict tests: red 1 (two missing modules), green 0 (6 passed). See `extension/src/check.test.ts` and `extension/src/panel/Verdict.test.tsx`.
- Verified the loose power bank rule separately from the installed battery limit. A real browser layout check remains open.

- npm exit codes: edition:check 1, lint 0, typecheck 0, test 0, build 0, tone 1, guard 1, ext:build 0, ext:check 1.

### Task 5 - Rule edition updates (2026-11-18 16:14:14 EST)

- Added a credential-free edition fetch after agreement, plus cached and bundled fallbacks. The engine still decides freshness.
- Web builds emit the exact edition bytes. Hosting headers are configured for that file. Deployment, live CORS, and the hosted monitor were outside local verification.
- Edition tests: red 1 (missing module and build asset), green 0 (7 passed). See `extension/src/edition.test.ts` and `tests/extension/edition-build.test.ts`. The emitted file also passed a direct byte comparison.

- npm exit codes: edition:check 1, lint 0, typecheck 0, test 0, build 0, tone 1, guard 1, ext:build 0, ext:check 1.

### Task 7 - Consent and privacy (2026-11-18 16:16:34 EST)

- Added the first-run agreement, separate cloud preference, Clear action, and packaged privacy page. Cloud checks are off in this draft.
- Notice and privacy tests: red 1 (5 failed), green 0 (13 passed across the focused suites). See `extension/src/panel/Notice.test.tsx` and `tests/extension/privacy.test.ts`.
- The privacy contact email still needs to be supplied.

- npm exit codes: edition:check 1, lint 0, typecheck 0, test 0, build 0, tone 1, guard 1, ext:build 0, ext:check 1.

### Task 8 - Package checks and typed draft zip (2026-11-18 16:22:21 EST)

- Added package checks, sorted zip output, CI steps, and a local release record. Store versions require the two on-device controls. The 0.0.1 typed draft uses the verdict control.
- Package tests: red 1 (missing checker), green 0 (8 passed). See `scripts/ext-check.test.ts`.
- Final integration regressions: red 1 (2 failed), green 0 (19 passed across the focused suites). Added window-scoped tab storage and the cloud-off link.
- Full suite: 483 tests passed. `ext:zip` and archive verification returned 0. The forbidden URL control and the untracked engine-copy control each returned 1.
- The Node loader fallback returned 0 for each of `edition:check`, `tone`, and `guard`. The npm wrapper exit codes below are the original results.

- npm exit codes: edition:check 1, lint 0, typecheck 0, test 0, build 0, tone 1, guard 1, ext:build 0, ext:check 0.

- 2026-11-18 17:06 EST: all nine checks re-run bare outside the sandbox on this tree: edition:check 0, lint 0, typecheck 0, test 0, build 0, tone 0, guard 0, ext:build 0, ext:check 0. The earlier 1s for edition:check, tone and guard were a sandbox socket error in the tsx launcher, not failures. Source: review.
