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

    static func bundledEngine() throws -> RulesEngine {
        let engine = try RulesEngine()
        _ = try engine.setEdition(String(contentsOf: Self.repo.appendingPathComponent("rules/edition.json"), encoding: .utf8))
        return engine
    }

    /// The bundled edition with one more label word, under its own id.
    static func editionWithLabelWord(_ pattern: String, tag: String, id: String) throws -> String {
        let text = try String(contentsOf: repo.appendingPathComponent("rules/edition.json"), encoding: .utf8)
        var json = try JSONSerialization.jsonObject(with: Data(text.utf8)) as! [String: Any]
        json["labelWords"] = (json["labelWords"] as! [[String: Any]]) + [["pattern": pattern, "tag": tag]]
        json["editionId"] = id
        return String(decoding: try JSONSerialization.data(withJSONObject: json), as: UTF8.self)
    }

    func store(_ p: BoxPersistence = MemoryBoxPersistence(), engine: RulesEngine? = nil) throws -> BoxStore {
        let engine = try engine ?? Self.bundledEngine()
        var n = 0
        return BoxStore(engine: engine, persistence: p, today: { "2026-11-20" }, newId: { n += 1; return "id-\(n)" }, now: { 1000 })
    }

    func outcome(_ read: JSONValue, _ source: ReadPath, fallbackAfter: FallbackAfter? = nil) -> ReadOutcome {
        ReadOutcome(read: read, source: source, route: .hybrid, failure: nil,
                    records: [RouteRecord(kind: .photo, path: source, model: "m", reason: .onDeviceDefault, latencyMs: 1200, blocked: nil)],
                    fallbackAfter: fallbackAfter)
    }

    static let markedLotion = read(["itemName": .string("Body lotion"), "category": .string("lotion_cream"),
                                    "labelText": .string("BODY LOTION ZQXWORD"), "liquid": .bool(true)])

    /// The saved copy keeps only the tags an edition found in the label. Under a newer edition with
    /// other label words those tags may be wrong, and the label is gone: never OK, read it again.
    @Test func aNewEditionNeverGivesARestoredItemOKFromTheOldTags() throws {
        let p = MemoryBoxPersistence()
        let first = try store(p)
        let id = first.addManual(Self.markedLotion)
        #expect(first.result?.items[id]?.level == "ok")
        let engine = try Self.bundledEngine()
        _ = try engine.setEdition(Self.editionWithLabelWord("zqxword", tag: "alcohol", id: "byt-more-words"))
        let restored = try store(MemoryBoxPersistence(stored: p.saved.last), engine: engine)
        restored.load()
        let verdict = try #require(restored.result?.items[id])
        #expect(verdict.level == "check" && verdict.hits.first?.text == BoxStore.rulesChanged)
        #expect(restored.result?.counts.ok == 0 && restored.result?.counts.check == 1)
        // Under the edition that tagged it, the same restored item is OK as before.
        let same = try store(MemoryBoxPersistence(stored: p.saved.last))
        same.load()
        #expect(same.result?.items[id]?.level == "ok")
    }

    /// A box saved before the iPhone kept which edition read each label: where its tags came from is
    /// unknown, so a saved item never shows OK from them until its label is read again.
    @Test func aBoxSavedBeforeTagEditionsWereKeptNeverShowsOKFromItsTags() throws {
        let p = MemoryBoxPersistence()
        let first = try store(p)
        let id = first.addManual(Self.lotion)
        var json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(try #require(p.saved.last))) as! [String: Any]
        json["items"] = (json["items"] as! [[String: Any]]).map { var item = $0; item["tagsEdition"] = nil; return item }
        let older = try JSONDecoder().decode(BoxSnapshot.self, from: JSONSerialization.data(withJSONObject: json))
        #expect(older.items.first?.tagsEdition == nil)
        let restored = try store(MemoryBoxPersistence(stored: older))
        restored.load()
        let verdict = try #require(restored.result?.items[id])
        #expect(verdict.level == "check" && verdict.hits.first?.text == BoxStore.labelUnknown)
    }

    /// An item read with no label words has tags that no edition changes: it is not asked for a label.
    @Test func anItemWithNoLabelWordsIsNotAskedForThemUnderANewEdition() throws {
        let p = MemoryBoxPersistence()
        let first = try store(p)
        let id = first.addManual(Self.shirt)
        #expect(first.items.first?.tagsEdition == "" && first.result?.items[id]?.level == "ok")
        let engine = try Self.bundledEngine()
        _ = try engine.setEdition(Self.editionWithLabelWord("zqxword", tag: "alcohol", id: "byt-more-words"))
        let restored = try store(MemoryBoxPersistence(stored: p.saved.last), engine: engine)
        restored.load()
        #expect(restored.result?.items[id]?.level == "ok")
    }

    /// While the label is still in memory, a newer edition reads it again, and its tags are saved.
    @Test func aNewEditionReadsTheLabelAgainWhileItIsInMemory() throws {
        let p = MemoryBoxPersistence()
        let engine = try Self.bundledEngine()
        let s = try store(p, engine: engine)
        let id = s.addManual(Self.markedLotion)
        _ = try engine.setEdition(Self.editionWithLabelWord("zqxword", tag: "alcohol", id: "byt-more-words"))
        s.reevaluate()
        #expect(s.items[0].labelTags.contains("alcohol") && s.items[0].tagsEdition == "byt-more-words")
        #expect(s.result?.items[id]?.level != "ok" && s.result?.items[id]?.hits.first?.text != BoxStore.rulesChanged)
    }

    final class FailingPersistence: BoxPersistence, @unchecked Sendable {
        var failing = true
        func save(_ snapshot: BoxSnapshot) throws { if failing { throw BoxFiles.SaveError(BoxFiles.tooLarge) } }
        func load(boxId: String) -> BoxSnapshot? { nil }
    }

    /// A change the iPhone could not save is still on screen, and the box says it is not saved
    /// until a later save works.
    /// Coming back to the foreground or a new day derives the verdicts again and writes nothing, so
    /// a saved box that could not be read is never replaced by an empty one.
    @Test func aLifecycleRecheckWritesNothing() throws {
        let p = MemoryBoxPersistence()
        let s = try store(p)
        s.load()
        s.reevaluate()
        #expect(p.saved.isEmpty && s.result != nil)
    }

    /// Except when a label still in memory was read again under a new edition: its new tags are saved.
    @Test func aRecheckThatReadALabelAgainSavesItsTags() throws {
        let p = MemoryBoxPersistence()
        let engine = try Self.bundledEngine()
        let s = try store(p, engine: engine)
        s.addManual(Self.markedLotion)
        let saves = p.saved.count
        _ = try engine.setEdition(Self.editionWithLabelWord("zqxword", tag: "alcohol", id: "byt-more-words"))
        s.reevaluate()
        #expect(p.saved.count == saves + 1 && p.saved.last?.items.first?.tagsEdition == "byt-more-words")
        s.reevaluate()
        #expect(p.saved.count == saves + 1)
    }

    @Test func aChangeThatCannotBeSavedSaysSo() throws {
        let p = FailingPersistence()
        let s = try store(p)
        #expect(s.saveProblem == nil)
        let id = s.addManual(Self.lotion)
        #expect(s.items.count == 1 && s.saveProblem == BoxFiles.tooLarge)
        p.failing = false
        s.setQuantity(id, 2)
        #expect(s.saveProblem == nil)
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

    /// The verdict after a relaunch must equal the verdict now: what is saved keeps every tag the
    /// engine used, including a remote item's label text.
    @Test func aRemoteItemKeepsTheTagsOfItsLabelTextAfterARelaunch() throws {
        let p = MemoryBoxPersistence()
        let s = try store(p)
        let remote = BoxItem(itemId: "r1", read: Self.perfume, labelTags: [], readSource: "phone_cloud", readMs: 900)
        s.mergeRemote(remote)
        #expect(s.items.first?.labelTags.contains("alcohol") == true)
        let after = try store(MemoryBoxPersistence(stored: p.saved.last))
        after.load()
        #expect(after.result?.items["r1"] == s.result?.items["r1"])
    }

    @Test func aDamagedSavedBoxCannotCrashOrBreakTheBox() throws {
        let json = #"{"onDevice":9223372036854775807,"rulesOnlyRechecks":9223372036854775807,"inCloud":-5}"#
        let counts = try JSONDecoder().decode(BoxSources.self, from: Data(json.utf8))
        #expect(counts.onDevice == BoxSources.maxCount && counts.rulesOnlyRechecks == BoxSources.maxCount && counts.inCloud == 0)
        let twin = BoxItem(itemId: "same", read: Self.shirt, readSource: "phone_on_device", readMs: 1)
        let p = MemoryBoxPersistence(stored: BoxSnapshot(boxId: "b", destinationCode: "CA", items: [twin, twin], cloudConsent: nil, sources: counts))
        let s = try store(p)
        s.load()
        #expect(s.items.count == 1 && s.result != nil)
        s.setDestination("PH")
        #expect(s.sources.rulesOnlyRechecks == BoxSources.maxCount)
    }
}
