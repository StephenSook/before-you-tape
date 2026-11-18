# iPhone client changelog

Each entry: what changed, its source, and how it was verified (with the exit code of
`bash ios/scripts/ci-local-ios.sh`).

## 2026-11-18

### chore(ios): add the iPhone client's files, its model guard and its local gate
- What: `ios/.gitignore` (build output, the Firebase app config, App Check debug tokens and the
  XcodeGen output stay out of git); `ios/scripts/ios_guard.py`, which fails on any import of
  Apple's other machine-learning frameworks or their recognizers under `ios/`, keeps the session
  API to `ios/BYT/AI/ModelSessionFactory.swift` and `FirebaseAI.firebaseAI` to
  `ios/BYT/AI/AIClient.swift`, reads untracked files too, and fails below a file-count floor;
  `ios/scripts/ci-local-ios.sh`, which runs the repository's CI steps in order and then the iOS
  checks, each bare.
- Source: iPhone client plan, task I-0.
- Verified: six guard tests (banned import with file and line, every banned name, the two owner
  files, look-alike names pass, zero files fails, untracked files are seen) failed with no guard,
  then passed; `bash ios/scripts/ci-local-ios.sh` exit 0.
