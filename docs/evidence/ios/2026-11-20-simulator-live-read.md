# On-device photo reads on the simulator, 2026-11-20

Three real label photos read by Apple's on-device model through the iPhone app's own reader, the
rules engine's parser and the rules, with the network off. This is the simulator, which uses the
Mac's own Apple model. It is not the iPhone: the airplane-mode check on a real iPhone is
`DEVICE-CHECKLIST.md`.

- Code: commit 3a4dac8 plus `ios/BYTTests/LiveModelTests.swift` (the opt-in test that ran this).
- Xcode 27.2, iPhone 18 Pro simulator, iOS 27.2. The model reported itself available, in a
  supported language, with image understanding (`capabilities.contains(.vision)`).
- Each photo: the whole photo as the app crops it (768 px long side, under the 500 KB cap), read
  offline with the cloud question never answered.
- Command: `TEST_RUNNER_BYT_LIVE_MODEL=1 xcodebuild -project ios/BYT.xcodeproj -scheme BYT -destination 'platform=iOS Simulator,name=iPhone 18 Pro,OS=27.2' test -only-testing:BYTTests/LiveModelTests`

## Output, as printed

```
LIVE own-18: path=on_device failure=none ms=7470 tokens=974/159 crop=118260B line=shea better 24H Moisture BODY LOTION: OK to pack. Read on this iPhone.
LIVE own-25: path=on_device failure=none ms=4592 tokens=974/137 crop=118294B line=BELLAVITA LUXURY HONEY OUD: Take it out. Read on this iPhone.
LIVE i01: path=on_device failure=none ms=4988 tokens=974/141 crop=154981B line=Power Bank: Take it out. Read on this iPhone.
```

The photos are `public/eval/items/own-18.jpg` (body lotion), `own-25.jpg` (perfume) and `i01.jpg`
(power bank). This was a check of the read path, not an eval run.

## Notes

- Every read ran on the device (`path=on_device`) and the box saved it as `phone_on_device`.
- The input token count is the same (974) for all three photos, so the image may not be counted
  in the model's reported usage. The time and the output tokens differ per photo.
- The verdicts come from the rules for Canada, the box's default country.
