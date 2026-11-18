# Before You Tape

Hold each gift up to your laptop and see what the post office won't take, before you tape the box.

Status: in development. This page lists only what is built today.

## What is built

- A Vite, React and TypeScript web app shell with its routes.
- Checks that run on every push: lint, type check, unit tests, build, a punctuation check, a model-call guard and a secret scan.

## Run it

Requirements: Node.js 22 and npm.

```bash
npm ci
npm run dev        # local dev server
npm run test       # unit tests
npm run lint
npm run typecheck
npm run build      # writes dist/, including dist/version.json with the commit SHA
npm run tone       # fails on long dashes and curly quotes in user-facing text
npm run guard      # fails on any model call outside Firebase AI Logic
npm run edition:check   # fails when rules/edition.json is out of date with its part files
npm run release:gate    # run before a release: fails while a country listing has not been checked by a person
```

Copy `.env.example` to `.env.local` and fill in your own Firebase web config. Never commit `.env.local`.

## Security you can check

- **App Check is enforced for Firebase AI Logic.** A model call with the site's public web key but no App Check token is refused with HTTP 401 "Firebase App Check token is invalid." The exact `curl` is in [`docs/SECURITY.md`](docs/SECURITY.md#check-it-yourself), and the daily probe makes the same call.
- **Limited-use App Check tokens.** The web app asks for them when it creates its AI Logic instance (`getAi(true)`, in `src/pages/PackRoute.tsx` and `src/firebase/app.ts`). The iPhone and Android clients will list theirs when they ship. Enforcing them in the console is pending.
- **Per-user rate limit.** AI Logic generate-content requests are limited to 20 a minute per user (the default is 100), read back on 2026-11-18. One sender checks items one at a time.
- Every row of Firebase's AI Logic security checklist, with its state, date and how to check it, is in [`docs/SECURITY.md`](docs/SECURITY.md).

## License

Apache License 2.0. See `LICENSE` and `NOTICE`.

Third-party tools with a different licence, used only in development and tests and never shipped in the app:

- `@axe-core/playwright` and `axe-core` (accessibility checks in the Playwright tests): Mozilla Public License 2.0.

Not affiliated with or approved by the US Postal Service.
