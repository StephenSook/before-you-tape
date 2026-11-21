# App Store screenshots (6.9-inch iPhone, 1320 x 2868)

Captured on 2026-11-21 from the Release build of commit ba1e88a (the commit uploaded as 1.0.0
build 1, rule edition revision 3) on an iPhone 17 Pro Max simulator (iOS 27.2), with
`xcrun simctl io <device> screenshot`. The status bar was set to 9:41 with
`xcrun simctl status_bar`. Every read is a real read by Apple's on-device model on that simulator
(the Mac's model), through the app's own screens: Add a photo, then the photo picker. The files
are saved as RGB PNGs with no alpha channel, as App Store Connect asks; the simulator's alpha was
fully opaque, so no pixel changed.

| File | What it shows |
|---|---|
| 01-ready-check.png | Ready check: signed in, this iPhone checks items with no network, label photos are read on it, and Delete everything on this iPhone. |
| 02-check-a-photo.png | A power bank label read on the iPhone: "Power bank: Take it out. Read on this iPhone." |
| 03-your-box.png | The box for Canada: 1 to take out, 1 to check, 2 OK to pack. The power bank shows Check it in the cloud (cloud checks were never answered, so it asks first), and the lotion's note says the post office stops taking mail to Canada on November 29, 2026. |
| 04-why-and-when.png | A perfume whose question ("Does the label list alcohol?") was answered "Can't tell", so it stays "Check this"; the chosen answer is filled. Below it, each rule layer with the date it was checked, then the T-shirt, OK to pack. |
| 05-another-country.png | The same box sent to the Philippines: "Re-checked 4 items for Philippines in 133 ms. 0 model calls." |

What was done by hand, as a sender would:
- The on-device read of the lotion set "It is a spray or under pressure", so the rules said Take it
  out. That switch was turned off in Fix this reading (the read's category, Lotion or cream, was
  right), and the lotion then needed only its confirmation.
- The lotion, the T-shirt and the perfume were confirmed with their "Yes, this is ..." buttons.
- The perfume's alcohol question was answered "Can't tell", because the photo's record does not say
  what its label lists.

Photos used: `own-01` (power bank), `own-18` (lotion) and `own-25` (perfume), all the project
owner's own photos, and `i13` (T-shirt, CC BY-SA 4.0), whose image does not appear in any
screenshot. No CC-licensed image appears in these files.

## Known limits

- The simulator has no camera, so 02 shows "No camera found. Add a photo instead." above the read.
  A real iPhone shows the camera there. Replace 02 with a 6.9-inch device capture if one is made.
- 03 and 04 carry the Canada suspension note and the layer dates of rule edition revision 3. From
  November 29, 2026, the Canada box reads differently, so capture again for a later version.
- The re-check time in 05 is what this run measured; another run can show a different time (the
  earlier capture showed 1 ms).
