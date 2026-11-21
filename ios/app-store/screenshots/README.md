# App Store screenshots (6.9-inch iPhone, 1320 x 2868)

Captured on 2026-11-20 from the Release build of commit 5f47e05 on an iPhone 17 Pro Max simulator
(iOS 27.2), with `xcrun simctl io <device> screenshot`. The status bar was set to 9:41 with
`xcrun simctl status_bar`. Every read is a real read by Apple's on-device model on that simulator
(the Mac's model), through the app's own screens: Add a photo, then the photo picker.

| File | What it shows |
|---|---|
| 01-ready-check.png | Ready check: signed in, this iPhone checks items with no network, and label photos are read on it. |
| 02-check-a-photo.png | A power bank label read on the iPhone: "Power bank: Take it out. Read on this iPhone." |
| 03-your-box.png | The box for Canada: 1 to take out, 1 to check, 2 OK to pack, with the lotion's note that mail to Canada stops on November 29, 2026. |
| 04-why-and-when.png | A perfume that waits for one answer ("Does the label list alcohol?"), each rule layer with the date it was checked, and the power bank's reason. |
| 05-another-country.png | The same box sent to the Philippines: "Re-checked 4 items for Philippines in 1 ms. 0 model calls." |

What was done by hand, as a sender would: the lotion, the T-shirt and the perfume were confirmed
with their "Yes, this is ..." buttons. The perfume's alcohol question was left unanswered,
because the photo's record does not say what its label lists.

Photos used: `own-01` (power bank), `own-18` (lotion) and `own-25` (perfume), all the project
owner's own photos, and `i13` (T-shirt, CC BY-SA 4.0), whose image does not appear in any
screenshot. No CC-licensed image appears in these files.

## Known limits

- The simulator has no camera, so 02 shows "No camera found. Add a photo instead." above the read.
  A real iPhone shows the camera there. Replace 02 with a 6.9-inch device capture if one is made.
- 03 and 04 carry the Canada suspension note and dates of the Nov 20 rule edition. After
  November 29, 2026, the Canada box reads differently, so capture again for a later version.
