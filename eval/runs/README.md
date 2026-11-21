# Eval runs

Runs of the eval set in `eval/set/`, under the protocol in `eval/PROTOCOL.md`.

## Where the labels come from

- Verdict labels: drafted in a build session (author not verified), adopted by the developer 2026-11-20 without a
  row-by-row review; no blind second-person check.
- Typed categories for rules_only: derived by a fixed table from the item descriptions, not typed by a person.
- So every agreement number here is agreement with our draft labels, not accuracy.

## Files

- `always_check-<date>.json` and `rules_only-<date>.json`: the two baselines, with no model call. They hold no
  model reads, so the full run is public.
- `models-<date>.public.json`: a model run on the on-device, cloud and shipped paths, with its metrics. Each read
  is replaced by whether its numbers matched the printed ones, so no label text or item name is published. The
  full run stays private.
- `<date>` is the day the rules are applied, the same for every run that is compared.

Run a baseline with `npm run eval:baseline -- --baseline <always_check|rules_only> --date <YYYY-MM-DD> --out <file>`.
A model run (`npm run eval:run`) needs a separate eval Firebase project and refuses the live one.
