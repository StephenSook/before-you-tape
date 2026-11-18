# The iPhone's box documents against the Firestore rules

Run on 2026-11-18 against `firestore.rules` (blob f661270c2602, the same as main at the time),
in the Firestore emulator on its own port (8180), with `@firebase/rules-unit-testing`.

The documents were made by the iPhone app's own code: a box created by `BoxSync` and an item
from `BoxItem.itemDoc` (a body lotion read in the cloud after a 503, quantity 2, label text
emptied). Each check wrote one document:

| Check | Result |
|-------|--------|
| The owner creates the iPhone's box | accepted, as expected |
| A member writes the iPhone's item | accepted, as expected |
| An item whose read keeps its label text | refused, as expected |
| A stranger writes an item into the box | refused, as expected |
| An item with a fractional quantity | refused, as expected |
