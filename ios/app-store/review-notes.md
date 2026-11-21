# App Review notes: Before You Tape (iPhone)

The section below goes in App Store Connect > App Review Information > Notes. Contact name, phone
and email for the reviewer are entered in App Store Connect by the account holder, not here. No
demo account is needed.

## Notes for the reviewer

Before You Tape needs no account. It signs in anonymously by itself.

What it does: you photograph an item's label, the app reads it, and a rules engine bundled with the app says whether the item can go in a box mailed abroad with USPS: OK to pack, Check this or Take it out. The model only reads the label. The rules decide every verdict.

To try it (about 2 minutes):
1. Open the app. The first screen, Ready check, says whether this iPhone reads label photos on the device.
2. Tap Check an item. Hold a product label (a lotion, a perfume or a power bank) inside the white frame and tap Check now. Or tap Add a photo and pick a photo of a label.
3. The line under the photo gives the item, its verdict and where it was read, for example "Body lotion: OK to pack. Read on this iPhone."
4. Go back and tap Your box to see every item and why it got its verdict. Under What we checked, each rule layer shows the date it was checked. The country picker checks the whole box again by the rules alone.

If this iPhone has Apple Intelligence on: photos and typed label words are read on the iPhone by Apple's on-device model, also in airplane mode. Nothing goes to the cloud unless cloud checks were allowed. Once they are, a photo the iPhone already read can also be checked again in the cloud when the rules ask for a second look, for example to read a power bank's battery numbers again; the item then says why ("Battery numbers decide what may be mailed, so the cloud read them again.").

If it does not (Apple Intelligence off or not supported, or its model still downloading): Ready check and the Check an item screen say so. A photo then needs a cloud check, and the app asks once: "To check items when this iPhone can't, a cropped photo of the item and the words on its label go to Google's Gemini. Allow?"
- Tap Allow: the cropped photo and the label's words go to Gemini through Firebase AI Logic, and the line ends "Read in the cloud."
- Tap Keep everything on this iPhone: nothing is sent. You can still add an item by hand in Your box > Type it, and the rules give its verdict.
After either answer, the Check an item screen shows the choice and a button to change it (Turn off cloud checks, or Turn on cloud checks, which asks again).

Camera: used only to photograph the label you choose to check. Only the part of the photo inside the white frame is read or sent.

Countries in this rule edition: Canada and the Philippines.

Not affiliated with or approved by the US Postal Service.
