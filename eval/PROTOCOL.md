# Eval protocol

Written and frozen before any model run on the set. Its SHA-256 is pinned in `eval/set/manifest.json`; a
change to this file after the freeze fails the manifest test.

## The set

- 40 items, about half hazard-relevant, each checked for two destinations: Canada (CA) and the
  Philippines (PH). Unit of analysis: the item, and the row (one item for one destination).
- The photos are real photographs of real items. 13 were taken by the project owner, of the owner's own
  items held in hand, with every camera metadata field removed and anything private blurred. The other 27 are public
  product photos under CC0, public domain, CC BY or CC BY-SA, credited on the About page and the blind
  check page. None was taken by a family mailing a box, and none is generated.
- What that means for the measurement: these are reads of still photos. They are not live camera holds
  at a packing table, so they say nothing about how steady a hand is, the light in a real room, or how
  often a sender re-takes a photo.

## Labels

- `eval/set/labels.json` gives, for each item and destination, the expected verdict (`ok`, `check` or
  `take_out`) and the section it rests on: USPS Pub 52, the USPS international shipping restrictions page,
  or the destination's IMM page as captured in the rule edition.
- A label is the right answer for the real item in the photo, written by a person from those sources
  before any model run, and frozen by hash. A label mistake found before the freeze is fixed with the
  section as its reason; after the freeze, labels do not change.
- A hazard item is an item whose label is not "OK to pack" for at least one destination; a lotion that
  is fine for Canada but barred by the Philippines is one. The manifest check rejects any hazard flag
  that disagrees with the labels.

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

## Runs

- Each run records the machine, the Chrome version, the model shown, the rule edition and the date.
- Paths: on-device only, cloud only, and the shipped route.
- The full run is kept private. The public copy replaces every read with only whether its numbers
  matched, so no label text or item name is published; the metrics are the same from either copy.
