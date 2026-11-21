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
        }, parse: { ParsedRead(read: $0) })
        // A model that cannot read photos, so a photo needs the cloud.
        let m = AppModel(signIn: SignIn(isSignedIn: { true }, attempt: { true }), onDeviceStatus: { .wordsOnly }, persistence: MemoryBoxPersistence(),
                         reader: reader, appVersion: appVersion, fetchEdition: fetchEdition)
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

    /// Going back to the pin already installed cancels a slower request for another pin.
    @Test func goingBackToTheInstalledPinStopsAnOlderRequest() async throws {
        let a = try EditionSourceTests.newer(id: "byt-a")
        let b = try EditionSourceTests.newer(id: "byt-b")
        let gate = Gate()
        let m = model(Models(), fetchEdition: { id in
            if id == "byt-b" { await gate.wait(); return b.text }
            return a.text
        })
        let pinA = RemoteConfigValues.parse(["rules_edition_id": "byt-a", "rules_edition_sha256": a.sha])
        await m.applyConfig(pinA)
        #expect(m.box?.result?.editionId == "byt-a")
        let slow = Task { await m.applyConfig(RemoteConfigValues.parse(["rules_edition_id": "byt-b", "rules_edition_sha256": b.sha])) }
        for _ in 0..<1000 where !gate.isWaiting { await Task.yield() }
        #expect(gate.isWaiting)
        await m.applyConfig(pinA)
        gate.release()
        await slow.value
        m.box?.reevaluate()
        #expect(m.box?.result?.editionId == "byt-a")
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

    /// The country picker lists the countries of the edition in force, not only the built-in one's.
    @Test func thePickerOffersTheInstalledEditionsCountries() async throws {
        var json = try JSONSerialization.jsonObject(with: Data(EditionSourceTests.bundled().utf8)) as! [String: Any]
        var destinations = json["destinations"] as! [String: Any]
        var extra = destinations["CA"] as! [String: Any]
        extra["code"] = "ZZ"
        extra["name"] = "Testland"
        destinations["ZZ"] = extra
        json["destinations"] = destinations
        json["editionId"] = "byt-more-countries"
        let text = String(decoding: try JSONSerialization.data(withJSONObject: json), as: UTF8.self)
        let probe = try RulesEngine()
        _ = try probe.setEdition(text)
        let sha = EditionSource.sha256Hex(try probe.canonicalEdition())
        let m = model(Models(), fetchEdition: { _ in text })
        #expect(!m.destinations.contains { $0.code == "ZZ" })
        await m.applyConfig(RemoteConfigValues.parse(["rules_edition_id": "byt-more-countries", "rules_edition_sha256": sha]))
        #expect(m.box?.result?.editionId == "byt-more-countries")
        #expect(m.destinations.contains(Destination(code: "ZZ", name: "Testland")))
        // Back to the built-in edition: its countries again.
        await m.applyConfig(RemoteConfigValues.defaults)
        #expect(!m.destinations.contains { $0.code == "ZZ" })
    }

    /// Before Remote Config has given its own kill switch, a photo is not sent to the cloud and the
    /// line says the settings are on their way; once they arrive, the next photo is read in the cloud.
    @Test func cloudChecksWaitForTheirSettings() async {
        let names = Models()
        let j = FakeItemRunner.Journal()
        let lotion = BoxStoreTests.lotion
        let reader = ItemReader(device: FakeItemRunner("device", journal: j, results: []), makeCloud: { name in
            names.names.append(name)
            return FakeItemRunner("cloud", journal: j, results: [.success(ItemReply(read: lotion, tokens: nil))])
        }, parse: { ParsedRead(read: $0) })
        let m = AppModel(signIn: SignIn(isSignedIn: { true }, attempt: { true }), onDeviceStatus: { .wordsOnly }, persistence: MemoryBoxPersistence(),
                         reader: reader)
        m.network.pathChanged(satisfied: true)
        m.box?.setConsent(true)
        #expect(m.config.killCloud && m.config.pauseUnknown)
        await m.readPhoto(jpeg)
        #expect(names.names.isEmpty && m.lastRead?.route == .blocked && m.box?.items.isEmpty == true)
        #expect(m.readLine == "Checking a photo needs the cloud, and cloud checks are waiting for their settings. Try again in a moment.")
        await m.applyConfig(RemoteConfigValues.defaults)
        await m.readPhoto(jpeg)
        #expect(names.names.count == 1 && m.box?.items.count == 1)
    }

    /// While cloud checks wait for their settings, label words are still read on this iPhone.
    @Test func wordsAreReadOnThisIPhoneWhileTheCloudWaits() async {
        let j = FakeItemRunner.Journal()
        let reader = ItemReader(device: FakeItemRunner("device", journal: j, results: [.success(ItemReply(read: BoxStoreTests.lotion, tokens: nil))]),
                                makeCloud: { _ in FakeItemRunner("cloud", journal: j, results: []) }, parse: { ParsedRead(read: $0) })
        let ready = OnDeviceStatus(unavailable: nil, localeSupported: true, contextSize: 4096, variant: "t", vision: false)
        let m = AppModel(signIn: SignIn(isSignedIn: { true }, attempt: { true }), onDeviceStatus: { ready },
                         persistence: MemoryBoxPersistence(), reader: reader)
        #expect(m.config.pauseUnknown)
        m.network.pathChanged(satisfied: true)
        await m.readWords("SHEA BODY LOTION 8 FL OZ")
        #expect(j.events == ["device start", "device end"] && m.lastRead?.source == .onDevice && m.box?.items.count == 1)
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
        }, parse: { ParsedRead(read: $0) })
        let ready = OnDeviceStatus(unavailable: nil, localeSupported: true, contextSize: 4096, variant: "t", vision: false)
        let m = AppModel(signIn: SignIn(isSignedIn: { true }, attempt: { true }), onDeviceStatus: { ready },
                         persistence: MemoryBoxPersistence(), reader: reader, config: .defaults)
        holder.model = m
        m.network.pathChanged(satisfied: true)
        m.box?.setConsent(true)
        await m.readWords("EAU DE PARFUM 50 ML")
        #expect(names.names.isEmpty && m.lastRead?.failure == .cloudPaused)
    }
}
