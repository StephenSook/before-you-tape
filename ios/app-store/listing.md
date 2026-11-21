# App Store listing: Before You Tape (iPhone)

Text for the App Store Connect record, which exists and holds these fields. A build is installed
from TestFlight for the airplane-mode check on a real iPhone (`docs/evidence/ios/DEVICE-CHECKLIST.md`)
before any build is submitted for review. Field limits are Apple's; each field below is measured
by `python3 -I ios/app-store/check_lengths.py`.

## App information

| Field | Value |
|---|---|
| Name | Before You Tape |
| Subtitle | Check items before you mail |
| Bundle ID | app.beforeyoutape.reader |
| SKU | before-you-tape-ios |
| Primary language | English (U.S.) |
| Primary category | Utilities |
| Secondary category | Travel |
| Price | Free, no in-app purchases |
| Availability | Every country and region except France and China mainland |
| Copyright | 2026 Stephen Sookra |
| Support URL | https://before-you-tape-2026.web.app/support/ |
| Marketing URL | https://before-you-tape-2026.web.app |
| Privacy policy URL | https://before-you-tape-2026.web.app/privacy/ |

Availability: France is left out because Firestore's networking ships its own TLS library
(`openssl_grpc`, standard encryption outside iOS), which Apple exempts from export documentation
everywhere but France. China mainland is left out because it needs filings this app does not have.
`ITSAppUsesNonExemptEncryption` is `false` in `ios/project.yml`.

## Promotional text

Point the camera at a label. Your iPhone reads it, even in airplane mode, and the rules say if it can go in a box you mail abroad: OK to pack, Check this or Take it out.

## Description

Before You Tape checks the items you plan to mail abroad with USPS, before you tape the box.

Point the camera at an item's label. Apple's on-device model reads it on your iPhone, with no network needed. A rules engine then gives each item one of three verdicts: OK to pack, Check this or Take it out. The model only reads the label. The rules decide, and each verdict shows the rule behind it and the date that rule was checked.

WHAT IT CHECKS
- Batteries: power banks, loose lithium cells and devices with a battery, from the numbers printed on them.
- Liquids, sprays and flammable items, such as perfume, aerosols, hand sanitizer and nail polish.
- The rules of the country you pick: Canada and the Philippines in this edition.

PRIVATE BY DEFAULT
- Photos are read on your iPhone when Apple Intelligence is on.
- If your iPhone cannot read a photo, the app asks first. Only after you tap Allow, the cropped photo goes to Google's Gemini through Firebase AI Logic; label words you type or scan can go instead of the photo. Once you have allowed cloud checks, a photo your iPhone already read can also be checked again in the cloud when the rules ask for a second look, for example to read a battery's numbers again. You can turn this off at any time.
- Your box stays on your iPhone.

WHEN IT SAYS CHECK THIS
A rule needs something the label does not show, or a rule may be out of date. Open the item to see why and answer its question.

Before You Tape does not mail anything and does not replace USPS or customs advice. Not affiliated with or approved by the US Postal Service.

## Keywords

mail,shipping,customs,package,parcel,international,abroad,battery,lithium,perfume,aerosol,label,box

No trademarked names (Apple refuses them in keywords), so "USPS" is not a keyword.

## What's New (first version)

First release.

## Age rating

The app's rules name items the post will not take, among them alcohol, tobacco, e-cigarettes,
drugs, firearms, knives and explosives. So the two questions whose wording covers references are
answered Infrequent: "Alcohol, Tobacco, or Drug Use or References" and "Guns or Other Weapons".
Every other content question is None, medical included (the app gives mailing limits, not medical
guidance). Every capability is No: no advertising, chat, user-generated content, web browser,
shared location, social media, dating, gambling or loot boxes. Apple's rating from these answers is
13+ (12+ on devices before iOS 26).

## Version

`MARKETING_VERSION` is 1.0.0 in `ios/project.yml`, the first App Store version (build 1). Keep the
version in App Store Connect the same.
