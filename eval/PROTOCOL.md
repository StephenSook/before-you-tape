# Eval protocol

Written and frozen by hash before the first full model run on the set; the reads that came earlier are listed
under "Before the freeze". Its SHA-256 is pinned in `eval/set/manifest.json`; a change to this file after the
freeze fails the manifest test.

## The set

- 40 items, about half hazard-relevant, each checked for two destinations: Canada (CA) and the
  Philippines (PH). Unit of analysis: the item, and the row (one item for one destination).
- The photos are real photographs of real items. 13 were taken by the project owner, of the owner's own
  items held in hand, with every camera metadata field removed and anything private blurred. The other 27 are public
  product photos under CC0, public domain, CC BY or CC BY-SA, credited on the About page and the blind
  check page. None was taken by a family mailing a box, and none is generated.
- The published copies, which every run reads, are made by `scripts/eval-set-photos.py`: turned upright,
  shrunk to 1600 px on the long side, and saved again with no Exif, XMP, IPTC or comment block. The
  originals stay private; `eval/set/manifest.json` records both SHA-256 hashes and what changed for each
  photo. The app crops to 768 px before any model call, so the shrink removes nothing a model sees.
- What that means for the measurement: these are reads of still photos. They are not live camera holds
  at a packing table, so they say nothing about how steady a hand is, the light in a real room, or how
  often a sender re-takes a photo.

## Labels

- `eval/set/labels.json` gives, for each item and destination, the expected verdict (`ok`, `check` or
  `take_out`) and the section it rests on: USPS Pub 52, the USPS international shipping restrictions page,
  or the destination's IMM page as captured in the rule edition.
- A label is the expected answer for the real item in the photo, from those sources, and is frozen by hash.
  A label mistake found before the freeze is fixed with the section as its reason; after the freeze, labels
  do not change.
- Verdict labels: drafted in a build session (author not verified), adopted by the developer 2026-11-20
  without a row-by-row review; no blind second-person check.
- So the labels are our draft labels, not a measured truth. Every agreement number in a report is
  agreement with our draft labels, never accuracy, and it is shown with the sentence above.
- A hazard item is an item whose label is not "OK to pack" for at least one destination; a lotion that
  is fine for Canada but barred by the Philippines is one. The manifest check rejects any hazard flag
  that disagrees with the labels.
- No second person's calls were collected, so no report can say how often two people agree on these rows.

## Before the freeze

- The verdict labels were last changed on 2026-11-18, before any model read a set photo.
- Before the freeze, the app's on-device model read three set photos (own-01, own-18 and own-25) for the
  on-device check recorded in `evidence/device-e2e/`, and wiring checks of the eval runner read own-01
  and own-18 on the device. Their cloud calls were refused before they reached a model. No verdict label
  changed after any of those reads.
- The typed categories were derived after those reads, by the fixed table below, which reads only the
  item descriptions.

## Rule changes after labelling

- Two engine rule changes were made after the set was labelled, prompted by items i25 and i20; the labels
  themselves were not changed. Commit dda2875: chocolate and margarine count as easily liquefiable, so the
  Philippines line PH-P-01 gives "Check this" (prompted by i25, a chocolate bar). Commit 877f673: a ceramic
  category, "Check this" for the Philippines under PH-P-01 (prompted by i20, a ceramic mug).
  `src/eval/ruleChanges.ts` lists them.
- Every eval report gives two numbers side by side, for every metric, with the same denominator rule: all
  40 items, and the 38 items that did not prompt any rule change.
- From the freeze on, no engine change may be prompted by an item in this set. A gap found later is
  recorded as a miss, and its fix waits for a new set.

## Metrics

- **Agreement**: rows where the shipped verdict equals the label, over all rows.
- **Hazard called OK**: hazard items for which some destination shipped "OK to pack" where that
  destination's label is not "OK to pack". The bound is the exact one-sided 95% Clopper-Pearson upper
  limit over hazard items. Pass line: 0.
- **Check rate**: rows where the shipped verdict is "Check this", over all rows.
- How "Check this" is scored: it is safe but it is not agreement. If the label is "Take it out" and the app
  says "Check this", the row counts against agreement and adds to the check rate, but it is not a hazard
  miss. Only "OK to pack" where the label is not "OK to pack" is a hazard miss. Example: a power bank
  photographed from the front, with no specs visible, is "Take it out" (no standalone lithium battery
  may go by international mail at any size), so "Check this" there is safe and not agreement.
- **Exact numbers**: for items with printed battery numbers, reads whose volts, mAh and Wh all equal the
  printed values, per path.
- **Misreads caught**: on-device reads with wrong numbers, of which no destination shipped "OK to pack".
- **Latency**: three warm runs per crop and path, the median taken; then p50 and p90 across crops, and the
  median paired difference between the on-device and cloud paths with a 2,000-sample bootstrap interval
  resampled by item under a fixed seed. The cold first call is reported apart.

## Baselines

- Every report shows two baselines beside each path, on the same rows, with the same metrics and the same two
  denominators, so a model's numbers have something to beat.
- **Always "Check this"**: every row is "Check this". Its agreement is the share of rows labelled "Check this",
  it never calls a hazard OK, and its check rate is 100%. A path that is safe but asks the sender as often as
  this does is no more useful than not reading at all.
- **Rules only, no model**: each item entered through the app's add-by-hand path, with its category and the
  printed battery numbers (the set's `printed` field) and nothing read from the label, then judged by the same
  rule edition. It shows what the rules give with no model.
- Typed categories for rules_only: derived by a fixed table from the item descriptions, not typed by a person.
  The table is `src/eval/typedFromAlt.ts`; its output is recorded with the labels, before the freeze.
- A path beats a baseline only with no hazard called OK and higher agreement than that baseline.

## Runs

- Each run records the machine, the Chrome version, the model shown, the rule edition and the date.
- Paths: on-device only, cloud only, and the shipped route.
- The full run is kept private. The public copy replaces every read with only whether its numbers
  matched, so no label text or item name is published; the metrics are the same from either copy.
