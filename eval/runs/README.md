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

## Results, rules applied on 2026-11-21

The model run `models-2026-11-21` ran on 2026-11-21 from 00:58 to 01:23 UTC on an Apple M5 Pro laptop (48 GB,
macOS 27.0) in Chrome 157.0.8103.80, with Chrome's built-in model on the device. Its cloud reads used
gemini-3.5-flash-lite (fallback gemini-3.8-flash) on a separate eval Firebase project, as the live app is set. It
used rule edition byt-3b5f5508968f, read 40 items for 2 destinations (80 rows), and timed each item and path three
times.

Verdict labels: drafted in a build session (author not verified), adopted by the developer 2026-11-20 without a
row-by-row review; no blind second-person check. So the agreement below is agreement with our draft labels, not
accuracy.

| | Agreement with our draft labels | Hazards called OK | "Check this" |
| --- | --- | --- | --- |
| Always "Check this" (no model) | 5 of 80 | 0 of 28 | 80 of 80 |
| Rules only (no model) | 71 of 80 | 0 of 28 | 14 of 80 |
| On the device only | 60 of 80 | | |
| In the cloud only | 64 of 80 | | |
| The shipped route | 69 of 80 | 0 of 28 | 14 of 80 |

- **Safety.** The shipped route called no hazard item "OK to pack" (0 of 28; the exact one-sided 95% upper bound is
  10.1%). Each of its 11 rows that differ from our draft labels is on the careful side: 7 rows labelled "OK to
  pack" got "Check this", 3 rows labelled "Take it out" got "Check this", and 1 row labelled "Check this" got "Take
  it out".
- **Against the baselines.** By the protocol's rule, the shipped route beats always "Check this" but not rules only:
  its agreement (69) is lower than rules only (71). Rules only is given each item's category from a fixed table, so
  it starts from the answer a model has to read from the photo.
- **Without the two items that prompted rule changes** (38 items, 76 rows): the shipped route agrees on 67 of 76,
  calls 0 of 26 hazard items OK, and says "Check this" on 12 of 76.
- **Printed battery numbers**, on the 5 items that print them: read exactly on the device 1 of 5, in the cloud 5 of
  5, and on the shipped route 4 of 5. The device misread the numbers on 4 items; for all 4, no destination got "OK
  to pack".
- **Second looks.** The shipped route read every item on the device and asked the cloud for a second look on 13 of
  the 40 items.
- **Time to a verdict** (median of three warm runs per item, then across items): on the device 4.6 s (p90 7.5 s),
  in the cloud 1.3 s (p90 1.5 s), and the shipped route 4.9 s (p90 7.7 s), second look included. The device is 3.2
  s slower than the cloud (95% bootstrap interval 2.8 to 3.7 s). The first, cold call took 26.7 s on the device and
  1.5 s in the cloud; it is not in those times. Other work (unit tests) ran on the same laptop during part of the
  run, so the device times may be a little slow.
- **Cloud calls.** The run made 134 calls to Firebase AI Logic, and all 134 answered with HTTP 200.

Run a baseline with `npm run eval:baseline -- --baseline <always_check|rules_only> --date <YYYY-MM-DD> --out <file>`.
A model run (`npm run eval:run`) needs a separate eval Firebase project and refuses the live one.
