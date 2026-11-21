import BYTCore
import Foundation
import FoundationModels
import Testing
import UIKit
@testable import BYT

/// Model states the app tests name, so no test depends on the model of the machine running it (the
/// simulator on a Mac with Apple Intelligence reports image understanding).
extension OnDeviceStatus {
    /// Apple's model reads label words but not photos.
    static let wordsOnly = OnDeviceStatus(unavailable: nil, localeSupported: true, contextSize: 4096, variant: "test", vision: false)
    /// Apple's model reads label words and photos.
    static let wordsAndPhotos = OnDeviceStatus(unavailable: nil, localeSupported: true, contextSize: 4096, variant: "test", vision: true)
}

/// A scripted runner that records each call's start and end.
final class FakeItemRunner: ItemModelRunner, @unchecked Sendable {
    let name: String
    var results: [Result<ItemReply, ReadError>]
    var delaySeconds: Double = 0
    let journal: Journal
    final class Journal: @unchecked Sendable {
        private let lock = NSLock()
        private(set) var events: [String] = []
        func add(_ e: String) { lock.lock(); events.append(e); lock.unlock() }
    }

    init(_ name: String, journal: Journal, results: [Result<ItemReply, ReadError>]) {
        self.name = name
        self.journal = journal
        self.results = results
    }

    func read(_ input: ItemInput) async -> Result<ItemReply, ReadError> {
        journal.add("\(name) start")
        if delaySeconds > 0 { try? await Task.sleep(for: .seconds(delaySeconds)) }
        journal.add("\(name) end")
        return results.isEmpty ? .failure(ReadError(.other)) : results.removeFirst()
    }
}

@MainActor
@Suite struct ItemReaderTests {
    let read: JSONValue = .object(["itemName": .string("Perfume")])
    func status(available: Bool = true) -> OnDeviceStatus {
        OnDeviceStatus(unavailable: available ? nil : .appleIntelligenceOff, localeSupported: true, contextSize: 4096, variant: "test", vision: true)
    }
    func situation(available: Bool = true, online: Bool = true, consent: Bool? = true, kill: Bool = false) -> ReadSituation {
        var config = RemoteConfigValues.defaults
        config.killCloud = kill
        return ReadSituation(status: status(available: available), online: online, cloudConsent: consent, config: config)
    }
    let words = ItemInput.words("EAU DE PARFUM 50 ML")

    func reader(device: FakeItemRunner, cloud: FakeItemRunner, built: Built = Built()) -> ItemReader {
        ItemReader(device: device, makeCloud: { model in built.models.append(model); return cloud }, parse: { ParsedRead(read: $0) })
    }
    final class Built: @unchecked Sendable { var models: [String] = [] }

    @Test func readsOnDeviceOnTheHybridRouteAndNeverBuildsACloudRunner() async {
        let j = FakeItemRunner.Journal(), built = Built()
        let o = await reader(device: FakeItemRunner("device", journal: j, results: [.success(ItemReply(read: read, tokens: TokenUse(input: 10, output: 1)))]),
                             cloud: FakeItemRunner("cloud", journal: j, results: []), built: built).read(words, situation: situation())
        #expect(o.read == read && o.source == .onDevice && o.route == .hybrid)
        #expect(built.models.isEmpty)
        #expect(o.records.map(\.path) == [.onDevice])
    }

    /// The parser's tags (from the whole label) and the whole label ride with the read to the box.
    @Test func carriesTheParsersTagsAndWholeLabelIntoTheOutcome() async {
        let j = FakeItemRunner.Journal()
        let r = ItemReader(device: FakeItemRunner("device", journal: j, results: [.success(ItemReply(read: read, tokens: nil))]),
                           makeCloud: { _ in FakeItemRunner("cloud", journal: j, results: []) },
                           parse: { ParsedRead(read: $0, labelTags: ["flammable", "label_text"], wholeLabel: "WHOLE LABEL") })
        let o = await r.read(words, situation: situation())
        #expect(o.read == read && o.labelTags == ["flammable", "label_text"] && o.wholeLabel == "WHOLE LABEL")
    }

    @Test func makesNoCloudCallWhenConsentIsUnansweredKilledOrOffline() async {
        for s in [situation(available: false, consent: nil), situation(available: false, kill: true), situation(available: false, online: false)] {
            let j = FakeItemRunner.Journal(), built = Built()
            let o = await reader(device: FakeItemRunner("device", journal: j, results: []),
                                 cloud: FakeItemRunner("cloud", journal: j, results: [.success(ItemReply(read: read, tokens: TokenUse(input: 1, output: 1)))]), built: built).read(words, situation: s)
            #expect(o.route == .blocked && o.read == nil)
            #expect(built.models.isEmpty && j.events.isEmpty)
        }
    }

    @Test func fallsToTheCloudOnceWhenTheDeviceIsUnavailableOnTheHybridRoute() async {
        let j = FakeItemRunner.Journal(), built = Built()
        let o = await reader(device: FakeItemRunner("device", journal: j, results: [.failure(ReadError(.unavailable))]),
                             cloud: FakeItemRunner("cloud", journal: j, results: [.success(ItemReply(read: read, tokens: TokenUse(input: 20, output: 1)))]), built: built).read(words, situation: situation())
        #expect(o.read == read && o.source == .cloud)
        #expect(o.records.map(\.path) == [.onDevice, .cloud])
        #expect(built.models == [RemoteConfigValues.defaults.cloudModelItem])
    }

    @Test func stopsAtTypedEntryAfterAGuardrailBlock() async {
        let j = FakeItemRunner.Journal(), built = Built()
        let o = await reader(device: FakeItemRunner("device", journal: j, results: [.failure(ReadError(.guardrailBlock))]),
                             cloud: FakeItemRunner("cloud", journal: j, results: [.success(ItemReply(read: read, tokens: TokenUse(input: 1, output: 1)))]), built: built).read(words, situation: situation())
        #expect(o.read == nil && o.failure == .guardrailBlock)
        #expect(built.models.isEmpty)
        #expect(o.records.first?.blocked == .guardrail)
    }

    @Test func givesUpAfterTheTimeLimit() async {
        let j = FakeItemRunner.Journal()
        let slow = FakeItemRunner("device", journal: j, results: [.success(ItemReply(read: read, tokens: TokenUse(input: 1, output: 1)))])
        slow.delaySeconds = 5
        var r = reader(device: slow, cloud: FakeItemRunner("cloud", journal: j, results: []))
        r.deviceSeconds = 0.2
        let o = await r.read(words, situation: situation(online: false))
        #expect(o.read == nil && o.failure == .timeout && o.route == .deviceOnly)
    }

    @Test func aSecondReadWaitsForTheFirst() async {
        let j = FakeItemRunner.Journal()
        let device = FakeItemRunner("device", journal: j, results: [.success(ItemReply(read: read, tokens: TokenUse(input: 1, output: 1))), .success(ItemReply(read: read, tokens: TokenUse(input: 1, output: 1)))])
        device.delaySeconds = 0.2
        let r = reader(device: device, cloud: FakeItemRunner("cloud", journal: j, results: []))
        async let a = r.read(words, situation: situation())
        async let b = r.read(words, situation: situation())
        _ = await (a, b)
        #expect(j.events == ["device start", "device end", "device start", "device end"])
    }

    let photo = ItemInput.photo(cropJPEG: Data([0xFF, 0xD8]))

    /// Apple's model reads the label photo when it reports image understanding; no cloud runner is built.
    @Test func aPhotoIsReadOnThisIPhoneWhenItsModelReadsImages() async {
        let j = FakeItemRunner.Journal(), built = Built()
        let o = await reader(device: FakeItemRunner("device", journal: j, results: [.success(ItemReply(read: read, tokens: TokenUse(input: 1, output: 1)))]),
                             cloud: FakeItemRunner("cloud", journal: j, results: [.success(ItemReply(read: read, tokens: TokenUse(input: 1, output: 1)))]), built: built)
            .read(photo, situation: situation())
        #expect(o.source == .onDevice && o.route == .hybrid && o.records.map(\.kind) == [.photo])
        #expect(built.models.isEmpty && j.events == ["device start", "device end"])
    }

    /// In airplane mode, with the cloud question never answered, the photo is still read on this iPhone,
    /// and it is not a read that must ask about the cloud first.
    @Test func aPhotoIsReadOnThisIPhoneInAirplaneModeWithoutAskingAboutTheCloud() async {
        let j = FakeItemRunner.Journal(), built = Built()
        let s = situation(online: false, consent: nil)
        #expect(!ItemReader.needsCloud(.photo, s))
        let o = await reader(device: FakeItemRunner("device", journal: j, results: [.success(ItemReply(read: read, tokens: nil))]),
                             cloud: FakeItemRunner("cloud", journal: j, results: []), built: built).read(photo, situation: s)
        #expect(o.read == read && o.source == .onDevice && o.route == .deviceOnly && o.records.first?.reason == .noNetwork)
        #expect(built.models.isEmpty)
    }

    /// A model that does not report image understanding never gets the photo: it goes to the cloud,
    /// only when allowed, and the record says why.
    @Test func aPhotoGoesToTheCloudWhenThisIPhonesModelCannotReadImages() async {
        let j = FakeItemRunner.Journal()
        var s = situation()
        s.status.vision = false
        #expect(ItemReader.needsCloud(.photo, s))
        let o = await reader(device: FakeItemRunner("device", journal: j, results: [.success(ItemReply(read: read, tokens: nil))]),
                             cloud: FakeItemRunner("cloud", journal: j, results: [.success(ItemReply(read: read, tokens: nil))])).read(photo, situation: s)
        #expect(o.source == .cloud && o.route == .cloudOnly && o.records.first?.reason == .noImageInput)
        #expect(j.events == ["cloud start", "cloud end"])
    }

    @Test func anAnswerTheParserRejectsMovesToTheCloudOnTheHybridRoute() async {
        let j = FakeItemRunner.Journal()
        let bad: JSONValue = .object(["itemName": .string("")])
        var r = reader(device: FakeItemRunner("device", journal: j, results: [.success(ItemReply(read: bad, tokens: nil))]),
                       cloud: FakeItemRunner("cloud", journal: j, results: [.success(ItemReply(read: read, tokens: nil))]))
        r.parse = { $0 == bad ? nil : ParsedRead(read: $0) }
        let o = await r.read(words, situation: situation())
        #expect(o.read == read && o.source == .cloud)
        #expect(o.records.map(\.path) == [.onDevice, .cloud])
    }

    @Test func aServerErrorRetriesOnceThenTriesTheFallbackModelOnce() async {
        let j = FakeItemRunner.Journal(), built = Built()
        let o = await reader(device: FakeItemRunner("device", journal: j, results: []),
                             cloud: FakeItemRunner("cloud", journal: j, results: [.failure(ReadError(.server, fallbackAfter: .status500)),
                                                                                   .failure(ReadError(.server, fallbackAfter: .status500)),
                                                                                   .success(ItemReply(read: read, tokens: nil))]),
                             built: built).read(words, situation: situation(available: false))
        #expect(o.read == read && o.source == .cloud && o.route == .cloudOnly && o.fallbackAfter == .status500)
        #expect(built.models == [RemoteConfigValues.defaults.cloudModelItem, RemoteConfigValues.defaults.cloudModelItemFallback])
        #expect(o.records.map(\.model) == [RemoteConfigValues.defaults.cloudModelItem, RemoteConfigValues.defaults.cloudModelItem,
                                           RemoteConfigValues.defaults.cloudModelItemFallback])
    }

    @Test func anAppCheckRefusalNeverRetries() async {
        let j = FakeItemRunner.Journal(), built = Built()
        let o = await reader(device: FakeItemRunner("device", journal: j, results: []),
                             cloud: FakeItemRunner("cloud", journal: j, results: [.failure(ReadError(.appCheckRefused)), .success(ItemReply(read: read, tokens: nil))]),
                             built: built).read(words, situation: situation(available: false))
        #expect(o.read == nil && o.failure == .appCheckRefused)
        #expect(o.records.count == 1 && built.models.count == 1)
    }

    @Test func theRecordCarriesTokensAndNeverTheWords() async throws {
        let j = FakeItemRunner.Journal()
        let o = await reader(device: FakeItemRunner("device", journal: j, results: [.success(ItemReply(read: read, tokens: TokenUse(input: 700, output: 90)))]),
                             cloud: FakeItemRunner("cloud", journal: j, results: [])).read(words, situation: situation())
        let rec = try #require(o.records.first)
        #expect(rec.inputTokens == 700 && rec.outputTokens == 90 && rec.model == ItemReader.deviceModelName && rec.kind == .labelWords)
        let text = String(decoding: try JSONEncoder().encode(o.records), as: UTF8.self)
        #expect(!text.contains("PARFUM"))
    }

    @Test func aGoneModelGetsNoRetryAndOneTryOnTheFallback() async {
        let j = FakeItemRunner.Journal(), built = Built()
        let o = await reader(device: FakeItemRunner("device", journal: j, results: []),
                             cloud: FakeItemRunner("cloud", journal: j, results: [.failure(ReadError(.other, fallbackAfter: .status404)),
                                                                                   .success(ItemReply(read: read, tokens: nil))]),
                             built: built).read(words, situation: situation(available: false))
        #expect(o.read == read && o.fallbackAfter == .status404)
        #expect(o.records.count == 2)
        #expect(built.models == [RemoteConfigValues.defaults.cloudModelItem, RemoteConfigValues.defaults.cloudModelItemFallback])
    }

    @Test func aPlainFourOhFourFails() async {
        let j = FakeItemRunner.Journal(), built = Built()
        let o = await reader(device: FakeItemRunner("device", journal: j, results: []),
                             cloud: FakeItemRunner("cloud", journal: j, results: [.failure(ReadError(.other)), .success(ItemReply(read: read, tokens: nil))]),
                             built: built).read(words, situation: situation(available: false))
        #expect(o.read == nil && o.failure == .other && o.fallbackAfter == nil)
        #expect(o.records.count == 1 && built.models.count == 1)
    }

    @Test func aServerErrorWithNoFallbackStatusRetriesOnceAndStops() async {
        let j = FakeItemRunner.Journal(), built = Built()
        let o = await reader(device: FakeItemRunner("device", journal: j, results: []),
                             cloud: FakeItemRunner("cloud", journal: j, results: [.failure(ReadError(.server)), .failure(ReadError(.server)),
                                                                                   .success(ItemReply(read: read, tokens: nil))]),
                             built: built).read(words, situation: situation(available: false))
        #expect(o.read == nil && o.failure == .server)
        #expect(o.records.count == 2 && built.models.count == 1)
    }

    @Test func theFallbackModelGetsNoRetryOfItsOwn() async {
        let j = FakeItemRunner.Journal()
        let o = await reader(device: FakeItemRunner("device", journal: j, results: []),
                             cloud: FakeItemRunner("cloud", journal: j, results: [.failure(ReadError(.other, fallbackAfter: .status404)),
                                                                                   .failure(ReadError(.network)), .success(ItemReply(read: read, tokens: nil))]))
            .read(words, situation: situation(available: false))
        #expect(o.read == nil && o.failure == .network && o.fallbackAfter == .status404)
        #expect(o.records.count == 2)
    }

    /// The pause switch is read again before every cloud attempt, the retry and the fallback included.
    @Test func aCloudPausedDuringAReadStopsBeforeTheNextCloudCall() async {
        let j = FakeItemRunner.Journal(), built = Built()
        var r = reader(device: FakeItemRunner("device", journal: j, results: [.failure(ReadError(.unavailable))]),
                       cloud: FakeItemRunner("cloud", journal: j, results: [.success(ItemReply(read: read, tokens: nil))]), built: built)
        r.cloudOpen = { false }
        let o = await r.read(words, situation: situation())
        #expect(o.read == nil && o.failure == .cloudPaused && built.models.isEmpty)
        #expect(j.events == ["device start", "device end"])
    }

    @Test func aPauseBetweenTheCloudCallAndItsRetryStopsTheRetry() async {
        let j = FakeItemRunner.Journal()
        final class Gate: @unchecked Sendable { var calls = 0 }
        let gate = Gate()
        var r = reader(device: FakeItemRunner("device", journal: j, results: []),
                       cloud: FakeItemRunner("cloud", journal: j, results: [.failure(ReadError(.server, fallbackAfter: .status503)),
                                                                             .success(ItemReply(read: read, tokens: nil))]))
        r.cloudOpen = { gate.calls += 1; return gate.calls == 1 }
        let o = await r.read(words, situation: situation(available: false))
        #expect(o.failure == .cloudPaused && o.records.count == 1)
        #expect(j.events == ["cloud start", "cloud end"])
    }

    /// A second look reads the same input in the cloud only, even when this iPhone's model could read it,
    /// and records itself as a second look.
    @Test func aSecondLookReadsOnlyInTheCloud() async {
        let j = FakeItemRunner.Journal(), built = Built()
        let o = await reader(device: FakeItemRunner("device", journal: j, results: [.success(ItemReply(read: read, tokens: nil))]),
                             cloud: FakeItemRunner("cloud", journal: j, results: [.success(ItemReply(read: read, tokens: TokenUse(input: 5, output: 1)))]),
                             built: built).secondLook(photo, situation: situation())
        #expect(o.read == read && o.source == .cloud && o.route == .cloudOnly)
        #expect(j.events == ["cloud start", "cloud end"] && built.models == [RemoteConfigValues.defaults.cloudModelItem])
        #expect(o.records.map(\.reason) == [.secondLook] && o.records.map(\.path) == [.cloud])
    }

    /// The cloud gate is read before a second look's call too: closed, nothing is sent.
    @Test func aSecondLookSendsNothingWhenTheCloudIsClosed() async {
        let j = FakeItemRunner.Journal(), built = Built()
        var r = reader(device: FakeItemRunner("device", journal: j, results: []),
                       cloud: FakeItemRunner("cloud", journal: j, results: [.success(ItemReply(read: read, tokens: nil))]), built: built)
        r.cloudOpen = { false }
        let o = await r.secondLook(photo, situation: situation())
        #expect(o.read == nil && o.failure == .cloudPaused && j.events.isEmpty && built.models.isEmpty)
    }

    /// A second look gets a first read's cloud retry: a server error is tried once more.
    @Test func aSecondLookRetriesAServerErrorOnce() async {
        let j = FakeItemRunner.Journal()
        let o = await reader(device: FakeItemRunner("device", journal: j, results: []),
                             cloud: FakeItemRunner("cloud", journal: j, results: [.failure(ReadError(.server)), .success(ItemReply(read: read, tokens: nil))]))
            .secondLook(photo, situation: situation())
        #expect(o.read == read && o.records.count == 2)
    }

    @Test func theDeviceRunnerHoldsNoFirebaseAI() {
        #expect(Mirror(reflecting: DeviceRunner()).children.isEmpty)
    }
}

@Suite struct ModelFailureMappingTests {
    @Test func mapsEachModelErrorToItsReadFailure() {
        #expect(ModelSessionFactory.failure(from: LanguageModelError.guardrailViolation(.init(debugDescription: "x"))) == .guardrailBlock)
        #expect(ModelSessionFactory.failure(from: LanguageModelError.refusal(.init(explanation: "no", debugDescription: "x"))) == .refusal)
        #expect(ModelSessionFactory.failure(from: LanguageModelError.contextSizeExceeded(.init(contextSize: 4096, tokenCount: 5000, debugDescription: "x"))) == .contextExceeded)
        #expect(ModelSessionFactory.failure(from: LanguageModelError.unsupportedLanguageOrLocale(.init(languageCode: .french, debugDescription: "x"))) == .unavailable)
        #expect(ModelSessionFactory.failure(from: LanguageModelError.rateLimited(.init(resetDate: nil, debugDescription: "x"))) == .rateLimited)
        #expect(ModelSessionFactory.failure(from: CancellationError()) == .cancelled)
        #expect(ModelSessionFactory.failure(from: URLError(.notConnectedToInternet)) == .network)
        #expect(ModelSessionFactory.failure(from: NSError(domain: "x", code: 1)) == .other)
    }
}
