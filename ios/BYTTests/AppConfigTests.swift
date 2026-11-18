import BYTCore
import Foundation
import Testing
@testable import BYT

/// Remote Config applies live: the next read uses the new values, with no restart.
@MainActor
@Suite struct AppConfigTests {
    let jpeg = Data([0xFF, 0xD8, 0xFF, 0xD9])
    final class Models: @unchecked Sendable { var names: [String] = [] }

    func model(_ models: Models, appVersion: String = "1.0.0", fetchEdition: @escaping @Sendable (String) async -> String? = { _ in nil }) -> AppModel {
        let j = FakeItemRunner.Journal()
        let lotion = BoxStoreTests.lotion
        let reader = ItemReader(device: FakeItemRunner("device", journal: j, results: []), makeCloud: { name in
            models.names.append(name)
            return FakeItemRunner("cloud", journal: j, results: [.success(ItemReply(read: lotion, tokens: nil))])
        }, parse: { $0 })
        let m = AppModel(signIn: SignIn(isSignedIn: { true }, attempt: { true }), persistence: MemoryBoxPersistence(), reader: reader,
                         appVersion: appVersion, fetchEdition: fetchEdition)
        m.network.pathChanged(satisfied: true)
        m.box?.setConsent(true)
        return m
    }

    @Test func aNewCloudModelIsUsedByTheNextRead() async {
        let names = Models()
        let m = model(names)
        await m.applyConfig(RemoteConfigValues.parse(["cloud_model_item": "gemini-3.8-flash"]))
        await m.readPhoto(jpeg)
        #expect(names.names == ["gemini-3.8-flash"])
        #expect(m.lastRead?.records.last?.model == "gemini-3.8-flash")
    }

    @Test func theKillSwitchStopsCloudReadsAtOnce() async {
        let names = Models()
        let m = model(names)
        await m.applyConfig(RemoteConfigValues.parse(["kill_cloud": "true"]))
        await m.readPhoto(jpeg)
        #expect(names.names.isEmpty && m.lastRead?.route == .blocked)
    }

    @Test func belowTheMinimumVersionTheAppSaysToUpdate() async {
        let m = model(Models(), appVersion: "0.9.0")
        #expect(m.updateLine == nil)
        await m.applyConfig(RemoteConfigValues.parse(["minimum_version_ios": "0.10.0"]))
        #expect(m.updateLine == "This version is out of date. Update the app to keep checking items.")
        await m.applyConfig(RemoteConfigValues.parse(["minimum_version_ios": "0.9.0"]))
        #expect(m.updateLine == nil)
    }

    @Test func aNewEditionPinIsFollowedOnlyWhenItChecksOut() async throws {
        let newer = try EditionSourceTests.newer()
        let m = model(Models(), fetchEdition: { _ in newer.text })
        await m.applyConfig(RemoteConfigValues.parse(["rules_edition_id": "byt-newer-test", "rules_edition_sha256": newer.sha]))
        #expect(m.box?.result?.editionId == "byt-newer-test" && m.editionNotice == nil)
        await m.applyConfig(RemoteConfigValues.parse(["rules_edition_id": "byt-newer-test", "rules_edition_sha256": String(repeating: "0", count: 64)]))
        #expect(m.box?.result?.editionId != "byt-newer-test")
        #expect(m.editionNotice == "A newer rule edition failed its integrity check. Using the built-in edition.")
    }
}
