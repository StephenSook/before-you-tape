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

    /// Holds a fetch open until the test lets it finish.
    final class Gate: @unchecked Sendable {
        private let lock = NSLock()
        private var waiter: CheckedContinuation<Void, Never>?
        private var open = false
        var isWaiting: Bool { lock.withLock { waiter != nil } }
        func wait() async {
            await withCheckedContinuation { c in
                lock.lock()
                if open { lock.unlock(); c.resume() } else { waiter = c; lock.unlock() }
            }
        }
        func release() {
            let c = lock.withLock { () -> CheckedContinuation<Void, Never>? in open = true; defer { waiter = nil }; return waiter }
            c?.resume()
        }
    }

    /// A request that finishes late (here its fetch fails) never replaces the edition a newer pin installed.
    @Test func anOlderEditionRequestNeverReplacesTheCurrentRules() async throws {
        let current = try EditionSourceTests.newer(id: "byt-current")
        let gate = Gate()
        let m = model(Models(), fetchEdition: { id in
            if id == "byt-late" { await gate.wait(); return nil }
            return current.text
        })
        let late = Task { await m.applyConfig(RemoteConfigValues.parse(["rules_edition_id": "byt-late", "rules_edition_sha256": current.sha])) }
        for _ in 0..<1000 where !gate.isWaiting { await Task.yield() }
        #expect(gate.isWaiting)
        await m.applyConfig(RemoteConfigValues.parse(["rules_edition_id": "byt-current", "rules_edition_sha256": current.sha]))
        #expect(m.box?.result?.editionId == "byt-current")
        gate.release()
        await late.value
        m.box?.reevaluate()
        #expect(m.box?.result?.editionId == "byt-current" && m.editionNotice == nil)
    }

    /// Fails the first fetch (the document was briefly unavailable), then serves the edition.
    final class FlakyFetch: @unchecked Sendable {
        let text: String
        private(set) var calls = 0
        init(_ text: String) { self.text = text }
        func fetch() -> String? {
            calls += 1
            return calls == 1 ? nil : text
        }
    }

    func failedOnce() async throws -> (AppModel, FlakyFetch, RemoteConfigValues) {
        let newer = try EditionSourceTests.newer()
        let flaky = FlakyFetch(newer.text)
        let m = model(Models(), fetchEdition: { _ in flaky.fetch() })
        let pin = RemoteConfigValues.parse(["rules_edition_id": "byt-newer-test", "rules_edition_sha256": newer.sha])
        await m.applyConfig(pin)
        #expect(m.box?.result?.editionId != "byt-newer-test" && m.editionNotice == EditionSource.notLoaded)
        return (m, flaky, pin)
    }

    @Test func aFailedEditionFetchIsTriedAgainWhenTheSamePinArrivesAgain() async throws {
        let (m, flaky, pin) = try await failedOnce()
        await m.applyConfig(pin)
        #expect(flaky.calls == 2 && m.box?.result?.editionId == "byt-newer-test" && m.editionNotice == nil)
        // Installed now: the same pin again fetches nothing.
        await m.applyConfig(pin)
        #expect(flaky.calls == 2)
    }

    @Test func aFailedEditionFetchIsTriedAgainBackInTheForeground() async throws {
        let (m, flaky, _) = try await failedOnce()
        m.becameActive()
        await m.editionRetry?.value
        #expect(flaky.calls == 2 && m.box?.result?.editionId == "byt-newer-test" && m.editionNotice == nil)
    }

    @Test func aFailedEditionFetchIsTriedAgainWhenTheNetworkReturns() async throws {
        let (m, flaky, _) = try await failedOnce()
        m.network.pathChanged(satisfied: false)
        m.network.pathChanged(satisfied: true)
        await m.editionRetry?.value
        #expect(flaky.calls == 2 && m.box?.result?.editionId == "byt-newer-test")
    }

    final class Holder: @unchecked Sendable { var model: AppModel? }

    /// Pauses the cloud while the on-device read runs, then fails it so the read would fall to the cloud.
    struct PausingDevice: ItemModelRunner {
        let holder: Holder
        func read(_ input: ItemInput) async -> Result<ItemReply, ReadError> {
            await holder.model?.applyConfig(RemoteConfigValues.parse(["kill_cloud": "true"]))
            return .failure(ReadError(.unavailable))
        }
    }

    /// The pause switch flipped during a read stops that read's cloud call: it is read live.
    @Test func aPauseDuringAReadStopsItsCloudCall() async {
        let holder = Holder(), names = Models()
        let j = FakeItemRunner.Journal()
        let reader = ItemReader(device: PausingDevice(holder: holder), makeCloud: { name in
            names.names.append(name)
            return FakeItemRunner("cloud", journal: j, results: [])
        }, parse: { $0 })
        let ready = OnDeviceStatus(unavailable: nil, localeSupported: true, contextSize: 4096, variant: "t", vision: false)
        let m = AppModel(signIn: SignIn(isSignedIn: { true }, attempt: { true }), onDeviceStatus: { ready },
                         persistence: MemoryBoxPersistence(), reader: reader)
        holder.model = m
        m.network.pathChanged(satisfied: true)
        m.box?.setConsent(true)
        await m.readWords("EAU DE PARFUM 50 ML")
        #expect(names.names.isEmpty && m.lastRead?.failure == .cloudPaused)
    }
}
