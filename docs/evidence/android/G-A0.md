# Gate G-A0: the shared vectors against the bundled engine on the JVM

Recorded 2026-11-18 07:19 EST, branch `lane-android`.

The Android app does not port the rules. It runs the web app's own engine, bundled by
`scripts/build-embed.sh` from `src/engine`, `src/shared` and `src/embed`, in QuickJS. This gate
checks that the bundle gives the same answers as the engine's own tests, on the JVM, before any
app work depends on it.

## Bundle

| Field | Value |
|---|---|
| File | `android/build/embed/byt-engine.js` (built by Gradle `:engine:buildEmbed`) |
| SHA-256 | `7193fdda43ac6e5ad4f292309b29db374b289de7741fa622d3439e6b15397fbe` |
| Size | 44,806 bytes, 11 inputs, all under `src/engine`, `src/shared` or `src/embed` |
| esbuild | 0.28.2 |
| Manifest commit | `2a40dd5` (the build where the bundle's inputs last changed; `dirty: false`) |
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

Not covered here: running the bundle in the app's own QuickJS on a phone, and comparing QuickJS
with the phone's WebView V8 (gate G-A5).
