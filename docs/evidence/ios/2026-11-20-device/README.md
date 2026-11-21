# iPhone airplane-mode check, 2026-11-20

**Result: pass.** With airplane mode on, Apple's on-device model on the iPhone read 22 label
photos. All 22 reads have the route `phone_on_device`, none went to the cloud, and the rules gave
each verdict.

## What was tested

- Phone: iPhone 17 Pro (iPhone18,1), iOS 27.2.1 (24B156) (`device.txt`).
- App: Release build of main at d008a3e (`commit.txt`), engine bundle sha256 350bddbda726, installed
  over USB with `ios/scripts/device-session.sh`. This build has no cloud second look.
- Steps: `docs/evidence/ios/DEVICE-CHECKLIST.md`.

## What was seen

1. Before the network went off, Ready check said "Signed in", "This iPhone can check items with no
   network." and "Label photos are read on this iPhone, with no network." (read aloud by the tester).
2. The screen recording runs 11 min 10 s, from 10:54:53 PM. In the status bar of every minute,
   10:55 to 11:05, the airplane icon is on and there is no Wi-Fi or cellular signal
   (`airplane-mode-status-bar.png`, one strip per minute). Do Not Disturb is on.
3. The only prompt was iOS's camera permission, at 0:06. No cloud question appeared. Text read from a
   frame every 2 seconds found no "Read in the cloud" and no "could not be read".
4. The first read line appears at 1:26 and the last, item 22, at 10:44 ("Carbohydrate Booster:
   Check this. Read on this iPhone."). The box's own counters agree: 22 read on the device, 0 in the
   cloud, 0 cloud fallbacks, 0 second looks.
5. Read times: median 4.5 s, shortest 2.8 s, longest 13.9 s.

## Each read

From the box file copied off the phone. The verdict is what the phone's engine gives for that box
today (`swift ios/scripts/box_verdicts.swift` with bundle 350bddbda726, `rules/edition.json`, Canada,
2026-11-20). Item names are left out because they name the tester's own products; `summary.json` has
the same rows.

| # | Category | Evidence | Route | Read time (s) | Verdict | First rule |
|---|---|---|---|---|---|---|
| 1 | lotion_cream | label_read | phone_on_device | 5.6 | Check this | DATA-NEEDS-ANSWER |
| 2 | laptop | item_seen | phone_on_device | 3.2 | Check this | DATA-IDENTITY |
| 3 | other | item_seen | phone_on_device | 3.3 | Check this | DATA-IDENTITY |
| 4 | perfume_fragrance | item_seen | phone_on_device | 3.4 | Take it out | USPS-INTL-AEROSOL |
| 5 | other | item_seen | phone_on_device | 3.0 | Check this | DATA-IDENTITY |
| 6 | aerosol_spray | label_read | phone_on_device | 3.7 | Take it out | USPS-INTL-AEROSOL |
| 7 | other | item_seen | phone_on_device | 6.8 | Take it out | USPS-INTL-FLAMMABLE-OTHER |
| 8 | food_packaged | label_read | phone_on_device | 3.1 | Check this | DATA-NEEDS-ANSWER |
| 9 | alcohol_drink | label_read | phone_on_device | 3.0 | Take it out | USPS-INTL-FLAMMABLE-LIQUID |
| 10 | medicine | item_seen | phone_on_device | 13.3 | Take it out | USPS-INTL-FLAMMABLE-LIQUID |
| 11 | medicine | item_seen | phone_on_device | 7.8 | Check this | DATA-IDENTITY |
| 12 | hand_sanitizer | item_seen | phone_on_device | 13.9 | Take it out | USPS-INTL-FLAMMABLE-LIQUID |
| 13 | other | item_seen | phone_on_device | 3.2 | Take it out | USPS-INTL-AEROSOL |
| 14 | lotion_cream | item_seen | phone_on_device | 4.6 | Take it out | USPS-INTL-FLAMMABLE-LIQUID |
| 15 | lotion_cream | label_read | phone_on_device | 3.8 | Check this | DATA-NEEDS-ANSWER |
| 16 | lotion_cream | label_read | phone_on_device | 11.4 | Check this | DATA-NEEDS-ANSWER |
| 17 | other | item_seen | phone_on_device | 11.0 | Take it out | USPS-INTL-FLAMMABLE-OTHER |
| 18 | other | item_seen | phone_on_device | 2.8 | Take it out | USPS-INTL-FLAMMABLE-OTHER |
| 19 | other | item_seen | phone_on_device | 10.5 | Take it out | USPS-INTL-FLAMMABLE-LIQUID |
| 20 | liquid_toiletry | item_seen | phone_on_device | 4.4 | Check this | DATA-IDENTITY |
| 21 | lotion_cream | label_read | phone_on_device | 4.6 | OK to pack | DEST-SUSPENSION-AHEAD |
| 22 | other | item_seen | phone_on_device | 9.9 | Check this | DATA-IDENTITY |

Totals: 1 OK to pack, 10 Check this, 11 Take it out.

## What this does not show

- The plan named five kinds of item. Lotions and creams, a perfume and sprays, and harmless items
  were read. No item was read as a power bank or a boxed device with a battery (one was read as a
  laptop, item 2), so the battery-numbers path was not tried on the phone in this session.
- Whether each read was right is not checked here. In 15 of 22 reads the model said it only saw
  the item (`item_seen`), not its label (`label_read`), so 6 items wait at "Check this" for the
  sender to confirm what they are. The verdicts are what the rules gave from each read.

## Kept outside the repository

- The raw box file names the tester's own products, so it stays on this Mac in
  `raw.local/boxes/` (ignored by git), sha256
  `bd63a5707f5edebde2478bcfce30cb27ba9134fa41df0449053e1c07e506f4b9`.
- The screen recording (`ScreenRecording_11-20-2026 22-54-53_1.MP4`, 1.26 GB) shows personal
  items and stays with the tester, sha256
  `244e6be6b2d2f35488f7835dca5c5ca5d37ec66b56b8b20f669f79ea737b6c7a`.
