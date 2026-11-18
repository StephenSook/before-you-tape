# Android client changelog

The native Android app (`android/`). One entry per commit, newest first: what changed, its
source (plan task or finding) and how it was verified.

- **Android build output and local config are ignored.** `android/.gitignore` keeps Gradle
  output, `local.properties`, `google-services.json` and keystores out of git, before any of
  them exists. The root `.gitignore` already covers `CLAUDE.local.md`, `.env*`, `*.local` and
  App Check debug token files. Source: Android plan Task 1. Verified: `git check-ignore` names
  `android/.gitignore` for `android/local.properties`, `android/app/google-services.json`,
  `android/build/x` and `android/release.jks`; the root CI mirror (edition check, lint,
  typecheck, 227 unit tests, build, tone, model guard, gitleaks, no co-author trailers) exit 0.
