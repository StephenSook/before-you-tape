# App Store screenshots (6.9-inch iPhone, 1320 x 2868)

01 and 02 were captured on 2026-11-21 from the Release build of commit ba1e88a (the commit uploaded
as 1.0.0 build 1, rule edition revision 3). 03, 04 and 05 were captured again on 2026-11-26 from the
Release build of commit 14d6f7c (the commit uploaded as 1.0.0 build 4, rule edition revision 9). All
were taken on an iPhone 17 Pro Max simulator (iOS 27.2), with `xcrun simctl io <device> screenshot`. The status bar was set to 9:41 with
`xcrun simctl status_bar`. Every read is a real read by Apple's on-device model on that simulator
(the Mac's model), through the app's own screens: Add a photo, then the photo picker. The files
are saved as RGB PNGs with no alpha channel, as App Store Connect asks; the simulator's alpha was
fully opaque, so no pixel changed.

| File | What it shows |
|---|---|
| 01-ready-check.png | Ready check: signed in, this iPhone checks items with no network, label photos are read on it, and Delete everything on this iPhone. |
| 02-check-a-photo.png | A power bank label read on the iPhone: "Power bank: Take it out. Read on this iPhone." |
| 03-your-box.png | The box for Canada: 1 to take out, 1 to check, 2 OK to pack. The power bank is Take it out; the lotion, confirmed, is OK to pack and shows Check it in the cloud (cloud checks were never answered, so it asks first). |
| 04-why-and-when.png | A perfume whose question ("Does the label list alcohol?") was answered "Can't tell", so it stays "Check this"; the chosen answer is filled. Below it, each rule layer with the date it was checked (service suspensions: 2026-11-25), then the T-shirt, OK to pack. |
| 05-another-country.png | The same box sent to the Philippines: 3 to take out, 1 OK to pack, "Re-checked 4 items for Philippines in 26 ms. 0 model calls." |

What was done by hand, as a sender would (for 03 to 05):
- The lotion, the T-shirt and the perfume were confirmed with their "Yes, this is ..." buttons.
- The perfume's alcohol question was answered "Can't tell", because the photo's record does not say
  what its label lists.

Photos used: `own-01` (power bank), `own-18` (lotion) and `own-25` (perfume), all the project
owner's own photos, and `i13` (T-shirt, CC BY-SA 4.0), whose image does not appear in any
screenshot. No CC-licensed image appears in these files. In 02, the power bank label's maker and EU
representative lines (company names, a street address and an email address) were blurred on
2026-11-26, as in the published photo; every other pixel of 02 is as captured.

## Known limits

- The simulator has no camera, so 02 shows "No camera found. Add a photo instead." above the read.
  A real iPhone shows the camera there. Replace 02 with a 6.9-inch device capture if one is made.
- The captures from revision 3 had a Canada suspension note on the lotion and the T-shirt (in 03 and
  04). That note came from an inactive banner on the USPS service alerts page: USPS has not suspended
  mail to Canada, and rule edition revision 9 drops it. 03, 04 and 05 were captured again with
  revision 9 and carry no such note.
- The perfume's name in 04 is spelled as the on-device model read it ("BELLLAVITA").
- The re-check time in 05 is what this run measured; another run can show a different time (earlier
  captures showed 133 ms and 1 ms).
