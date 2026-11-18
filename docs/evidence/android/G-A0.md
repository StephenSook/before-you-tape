# Gate G-A0: the shared vectors against the bundled engine on the JVM

Recorded 2026-11-18 07:19 EST and re-run 2026-11-18 13:24 EST on the merged, reviewed bridge (pull request #9), branch `lane-android` (b1836d5).

The Android app does not port the rules. It runs the web app's own engine, bundled by
`scripts/build-embed.sh` from `src/engine`, `src/shared` and `src/embed`, in QuickJS. This gate
checks that the bundle gives the same answers as the engine's own tests, on the JVM, before any
app work depends on it.

## Bundle

| Field | Value |
|---|---|
| File | `android/build/embed/byt-engine.js` (built by Gradle `:engine:buildEmbed`) |
| SHA-256 | `9887f1fa045b632245262912ffb269a683f0eac7297706f9a6a788507acde8b5` |
| Size | 48,417 bytes, 11 inputs, all under `src/engine`, `src/shared` or `src/embed` |
| esbuild | 0.28.2 |
| Manifest commit | `b1836d5` (`dirty: false`, rebuilt on a clean tree) |
| Runtime | QuickJS through Zipline 1.28.0 (JVM artifact), in `:engine:test` |

## Result (`SharedVectorsTest`)

| Test | Result |
|---|---|
| `everyBoxVectorGivesItsVerdict` | 20 of 20 box vectors (`tests/vectors/box.json`) |
| `everyGuardVectorGivesItsVerdict` | 64 of 64 review guard vectors (`tests/vectors/box-guards.json`) |
| `everyDestinationVectorGivesItsHits` | 21 of 21 destination vectors (`tests/vectors/destinations.json`) |
| `theVectorCountsMatchTheFiles` | counts run equal the three files' lengths (20, 64, 21) |
| `aPlantedWrongExpectationFails` | one changed expected level gives exactly one failure, naming that vector and item |
| `everyGuardVectorPinsEveryItem` | every guard vector pins a verdict for every item it lists |

The assertions are the TypeScript engine tests' own: each item's level, `expectRules`,
`notRules`, `expectLithium` and `expectQuestion`; destination hits as `{ruleId, level}` lists.
Vector items get the shared defaults from `tests/vectors/defaults.json`, the same file the
TypeScript tests read.

`EditionHashTest` also passes: the bundled edition's body, hashed in Kotlin with
`MessageDigest`, gives its edition id.

The re-run uses the bridge as merged, after three review rounds (input checks on every item, including negative numbers and the 160-character read label; an exact `structuredClone` stand-in; stricter bundle checks); all counts are unchanged.

Not covered here: running the bundle in the app's own QuickJS on a phone, and comparing QuickJS
with the phone's WebView V8 (gate G-A5).
