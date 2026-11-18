import BYTCore
import Foundation
import Testing
@testable import BYT

/// What the store hands to persistence, kept in memory for the test.
final class MemoryBoxPersistence: BoxPersistence, @unchecked Sendable {
    var saved: [BoxSnapshot] = []
    var stored: BoxSnapshot?
    init(stored: BoxSnapshot? = nil) { self.stored = stored }
    func save(_ snapshot: BoxSnapshot) { saved.append(snapshot) }
    func load(boxId: String) -> BoxSnapshot? { stored }
}

/// The web app's box store tests (src/data/boxStore.test.ts), same reads, same edition.
@MainActor
@Suite struct BoxStoreTests {
    static let repo = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()

    static func read(_ patch: [String: JSONValue]) -> JSONValue {
        var base: [String: JSONValue] = [
            "itemName": .string("Item"), "category": .string("other"), "labelText": .string(""), "volts": .number(0),
            "milliampHours": .number(0), "wattHours": .number(0), "lithiumGrams": .number(0), "batteryWords": .bool(false),
            "liquid": .bool(false), "pressurized": .bool(false), "alcoholOnLabel": .bool(false), "flammableOnLabel": .bool(false),
            "glassContainer": .bool(false), "powder": .bool(false), "retailBox": .string("cannot_tell"), "evidence": .string("label_read"),
        ]
        for (k, v) in patch { base[k] = v }
        return .object(base)
    }
    static let lotion = read(["itemName": .string("Body lotion"), "category": .string("lotion_cream"),
                              "labelText": .string("SHEA BODY LOTION 8 FL OZ"), "liquid": .bool(true)])
    static let shirt = read(["itemName": .string("Shirt"), "category": .string("clothing"), "evidence": .string("item_seen")])
    static let perfume = read(["itemName": .string("Perfume"), "category": .string("perfume_fragrance"),
                               "labelText": .string("EAU DE PARFUM ALCOHOL DENAT 50 ML"), "liquid": .bool(true)])
    static let phone = read(["itemName": .string("Phone"), "category": .string("phone"), "labelText": .string("LI-ION 3.85V 4000mAh 15.4Wh"),
                             "volts": .number(3.85), "milliampHours": .number(4000), "wattHours": .number(15.4),
                             "batteryWords": .bool(true), "retailBox": .string("sealed")])

    func store(_ p: MemoryBoxPersistence = MemoryBoxPersistence()) throws -> BoxStore {
        let engine = try RulesEngine()
        _ = try engine.setEdition(String(contentsOf: Self.repo.appendingPathComponent("rules/edition.json"), encoding: .utf8))
        var n = 0
        return BoxStore(engine: engine, persistence: p, today: { "2026-11-20" }, newId: { n += 1; return "id-\(n)" }, now: { 1000 })
    }

    func outcome(_ read: JSONValue, _ source: ReadPath, fallbackAfter: FallbackAfter? = nil) -> ReadOutcome {
        ReadOutcome(read: read, source: source, route: .hybrid, failure: nil,
                    records: [RouteRecord(kind: .photo, path: source, model: "m", reason: .onDeviceDefault, latencyMs: 1200, blocked: nil)],
                    fallbackAfter: fallbackAfter)
    }

    @Test func reChecksOnACountryChangeWithNoModelCall() throws {
        let s = try store()
        let id = s.addManual(Self.lotion)
        #expect(s.result?.items[id]?.headline == "OK to pack")
        s.setDestination("PH")
        #expect(s.result?.items[id]?.headline == "Take it out")
        #expect(s.sources.rulesOnlyRechecks == 1)
    }

    @Test func aLateReadUsesTheCurrentDestination() throws {
        let s = try store()
        s.setDestination("PH")
        let id = try #require(s.addRead(outcome(Self.lotion, .onDevice), cropFile: "k"))
        #expect(s.result?.items[id]?.headline == "Take it out")
    }

    @Test func aHandAddedItemIsSenderConfirmed() throws {
        let s = try store()
        s.addManual(Self.shirt)
        #expect(s.items.first?.identityConfirmedBy == "sender")
        #expect(s.items.first?.readSource == "manual")
    }

    @Test func theSavedCopyHasNoLabelTextAndHasItsLabelTags() throws {
        let p = MemoryBoxPersistence()
        let s = try store(p)
        s.addRead(outcome(Self.perfume, .onDevice), cropFile: "k")
        let saved = try #require(p.saved.last?.items.first)
        #expect(saved.read["labelText"] == .string(""))
        #expect(saved.labelTags.contains("alcohol"))
        #expect(s.items.first?.read["labelText"] == .string("EAU DE PARFUM ALCOHOL DENAT 50 ML"))
    }

    @Test func aCorrectedLabelKeepsItsTagsWhenItsTextIsNotSaved() throws {
        let p = MemoryBoxPersistence()
        let s = try store(p)
        let id = try #require(s.addRead(outcome(Self.read(["category": .string("lotion_cream"), "labelText": .string("BODY LOTION")]), .onDevice),
                                        cropFile: "k"))
        s.override(id, patch: ["labelText": .string("BODY LOTION ALCOHOL DENAT 8 FL OZ")])
        let saved = try #require(p.saved.last?.items.first)
        #expect(saved.overrides["labelText"] == nil)
        #expect(saved.labelTags.contains("alcohol") && saved.labelTags.contains("liquid"))
    }

    @Test func mergesARemoteItemOnce() throws {
        let s = try store()
        let remote = BoxItem(itemId: "phone-1", read: Self.shirt, readSource: "phone_cloud", readMs: 2100)
        s.mergeRemote(remote)
        s.mergeRemote(remote)
        #expect(s.items.count == 1)
        var other = remote
        other.itemId = "phone-2"
        other.readSource = "phone_on_device"
        s.mergeRemote(other)
        #expect(s.items.map(\.readSource) == ["phone_cloud", "phone_on_device"])
    }

    @Test func clampsQuantityAndFeedsTheLithiumCount() throws {
        let s = try store()
        let id = s.addManual(Self.phone)
        s.answer(id, question: "cell_count", answer: "one")
        s.setQuantity(id, 5)
        #expect(s.result?.lithium.status == "over")
        s.setQuantity(id, 0)
        #expect(s.items.first?.quantity == 1)
        s.setQuantity(id, 500)
        #expect(s.items.first?.quantity == 99)
        s.setQuantity(id, .nan)
        #expect(s.items.first?.quantity == 1)
    }

    @Test func aWrongMahFromTheOnDeviceReadLandsOnCheckThis() throws {
        let s = try store()
        // A 2600 mAh cell misread as 2500 beside its printed 9.62 Wh (3.7 V x 2.6 Ah).
        let misread = Self.read(["itemName": .string("Phone"), "category": .string("phone"), "labelText": .string("3.7V 2500mAh 9.62Wh"),
                                 "volts": .number(3.7), "milliampHours": .number(2500), "wattHours": .number(9.62), "batteryWords": .bool(true)])
        let id = try #require(s.addRead(outcome(misread, .onDevice), cropFile: "k"))
        #expect(s.result?.items[id]?.level == "check")
        #expect(s.result?.items[id]?.hits.contains { $0.ruleId == "USPS-INTL-LI-WH-MISMATCH" } == true)
    }

    @Test func theVerdictIsNeverReadFromStorage() throws {
        let saved = BoxItem(itemId: "saved-1", read: Self.lotion, readSource: "phone_on_device", readMs: 900)
        let p = MemoryBoxPersistence(stored: BoxSnapshot(boxId: "b", destinationCode: "PH", items: [saved], cloudConsent: true, sources: BoxSources()))
        let s = try store(p)
        s.load()
        #expect(s.items.map(\.itemId) == ["saved-1"])
        #expect(s.destinationCode == "PH" && s.cloudConsent == true)
        #expect(s.result?.items["saved-1"]?.headline == "Take it out")
        #expect(!(String(decoding: try JSONEncoder().encode(p.saved.last), as: UTF8.self)).contains("headline"))
    }

    @Test func countsReadsByWhereTheyRanAndFallbacks() throws {
        let s = try store()
        s.addRead(outcome(Self.shirt, .onDevice), cropFile: "a")
        s.addRead(outcome(Self.shirt, .cloud, fallbackAfter: .status503), cropFile: "b")
        #expect(s.sources == BoxSources(onDevice: 1, inCloud: 1, secondLooks: 0, rulesOnlyRechecks: 0, cloudFallbacks: 1))
        #expect(s.items.map(\.readSource) == ["phone_on_device", "phone_cloud"])
        #expect(s.items.last?.readFallback == .status503)
        #expect(s.items.first?.readMs == 1200)
    }

    @Test func startsInCanadaWithConsentUnansweredAndRemovesItems() throws {
        let s = try store()
        #expect(s.destinationCode == "CA" && s.cloudConsent == nil)
        let id = s.addManual(Self.shirt)
        s.remove(id)
        #expect(s.items.isEmpty && s.result?.items[id] == nil)
        s.setConsent(true)
        #expect(s.cloudConsent == true)
    }
}
