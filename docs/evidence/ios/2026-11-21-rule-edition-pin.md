# Rule edition pin on a real iPhone, 2026-11-21

**Result: pass.** Build 1.0.0 (2) of the iPhone app, which carries rule edition revision 4
(`byt-cfd7e337919a`), switched to revision 5 (`byt-1e330a4fdf37`) through the Remote Config pin and the
published edition document, with no new build.

## What was tested

- Phone: iPhone 17 Pro (iPhone18,1), iOS 27.2.1 (24B156).
- App: 1.0.0 (2) from main at 31fd8c5, exported Ad Hoc (Release configuration) from the same archive as
  the build uploaded to App Store Connect. Its compiled code section is the same as that build's.
  Installed with `xcrun devicectl device install app` over Wi-Fi.
- Pin: Remote Config template version 6 with `rules_edition_id` `byt-1e330a4fdf37` and
  `rules_edition_sha256` `b63c55afc6a0c77b7c32a1457ff593f9cc13992b2821363291ade2cfab3038bc`, and the
  edition document at `ruleEditions/byt-1e330a4fdf37`, written with `scripts/publish-edition.ts`.
- Checked before the phone:
  - That hash is the one the app's own check computes (the bundled engine loads the edition in
    JavaScriptCore and hashes its canonical form), both from `rules/edition.json` and from the
    document's text.
  - On the iOS 27.2 simulator, build 2's code installed revision 5 under the pin, and kept revision 4
    with "A newer rule edition failed its integrity check. Using the built-in edition." when the hash
    was wrong.
  - Every shared vector passes through the bundled engine with revision 5, on the iOS 27.2 simulator
    and on macOS: 41 box, 64 box guards, 25 destinations.

## What was seen

The tester opened the app online and checked two items. The saved box was copied off the phone with
`xcrun devicectl device copy from`. Only each item's category, route, read time and edition are kept
here.

| Item | Category | Route | Read time (s) | Edition that tagged it |
|---|---|---|---|---|
| 26 | power_bank | phone_on_device | 4.3 | `byt-1e330a4fdf37` (revision 5) |
| 27 | alcohol_drink | phone_on_device | 3.5 | `byt-1e330a4fdf37` (revision 5) |

The same box holds 25 older items, read on the iPhone in earlier sessions: 22 tagged
`byt-3b5f5508968f` (2026-11-20) and 3 tagged `byt-66deff20c520` (revision 3, build 1). They keep the
edition that tagged them; `docs/LIMITS.md` (the item on label words) says how such an item is shown.

## Not recorded

- Whether Ready check showed a notice: the box does not keep it, and the tester did not report one.
- The box file itself, which names the tester's own products. It stays off the repo.
