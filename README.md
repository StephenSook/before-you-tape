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

## License

Apache License 2.0. See `LICENSE` and `NOTICE`.

Third-party tools with a different licence, used only in development and tests and never shipped in the app:

- `@axe-core/playwright` and `axe-core` (accessibility checks in the Playwright tests): Mozilla Public License 2.0.

Not affiliated with or approved by the US Postal Service.
