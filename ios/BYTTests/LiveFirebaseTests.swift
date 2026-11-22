import Foundation
import Testing
@testable import BYT

/// Tests and Debug launches never reach the live Firebase project: no sign-in, no Remote Config
/// fetch, no Firestore read. Release builds always may; a Debug build only when launched with
/// -liveFirebase and not hosted by XCTest.
@MainActor
@Suite struct LiveFirebaseTests {
    @Test func releaseBuildsAlwaysCallFirebase() {
        #expect(LiveFirebase.decide(debug: false, arguments: [], hostedByXCTest: false))
        #expect(LiveFirebase.decide(debug: false, arguments: [], hostedByXCTest: true))
    }

    @Test func aDebugBuildCallsFirebaseOnlyWhenOptedInAndNotUnderXCTest() {
        #expect(!LiveFirebase.decide(debug: true, arguments: [], hostedByXCTest: false))
        #expect(LiveFirebase.decide(debug: true, arguments: [LiveFirebase.optIn], hostedByXCTest: false))
        #expect(!LiveFirebase.decide(debug: true, arguments: [LiveFirebase.optIn], hostedByXCTest: true))
    }

    @Test func thisTestLaunchIsHostedAndOff() {
        #expect(LiveFirebase.hostedByXCTest(environment: ProcessInfo.processInfo.environment))
        #expect(!LiveFirebase.thisLaunch.allowed)
    }

    @Test func anOffLaunchSkipsTheCallAndSaysSo() async {
        var ran = false
        let off = await LiveFirebase(allowed: false).call("probe while off", offline: 0) { ran = true; return 1 }
        #expect(off == 0)
        #expect(!ran)
        #expect(LiveFirebase.skipped.contains("probe while off"))
        let on = await LiveFirebase(allowed: true).call("probe while on", offline: 0) { ran = true; return 1 }
        #expect(on == 1)
        #expect(ran)
        #expect(!LiveFirebase.skipped.contains("probe while on"))
    }

    @Test func anOffSignInNeverSignsIn() async {
        let signIn = SignIn.firebase(live: LiveFirebase(allowed: false))
        #expect(await !signIn.ensure())
        #expect(signIn.currentUid() == nil)
        #expect(await signIn.delete(nil) == .none)
        #expect(LiveFirebase.skipped.contains("anonymous sign-in"))
    }

    /// The model a hosted test launch builds, with the launch's own sign-in, Remote Config and edition
    /// read: started and given a pin, it signs in nowhere and reads nothing from Firestore.
    @Test func aHostedTestLaunchMakesNoFirestoreCall() async throws {
        let defaults = try #require(UserDefaults(suiteName: "LiveFirebaseTests-\(UUID().uuidString)"))
        let m = AppModel(persistence: MemoryBoxPersistence(), defaults: defaults)
        await m.start()
        await m.applyConfig(RemoteConfigValues.parse([
            "rules_edition_id": "byt-hermetic-test", "rules_edition_sha256": String(repeating: "0", count: 64),
        ]))
        // The network monitor's first answer may start a retry of the pin; it ends the same way.
        await m.editionRetry?.value
        #expect(!m.signedIn)
        #expect(m.editionNotice == EditionSource.notLoaded)
        #expect(LiveFirebase.skipped.contains("Firestore read of ruleEditions/byt-hermetic-test"))
        #expect(LiveFirebase.skipped.contains("anonymous sign-in"))
        #expect(LiveFirebase.skipped.contains("Remote Config fetch"))
    }
}
