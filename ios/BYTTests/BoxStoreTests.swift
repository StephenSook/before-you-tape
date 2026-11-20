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

    func store(_ p: BoxPersistence = MemoryBoxPersistence(), engine: RulesEngine? = nil, idPrefix: String = "id") throws -> BoxStore {
        let engine = try engine ?? Self.bundledEngine()
        var n = 0
        return BoxStore(engine: engine, persistence: p, today: { "2026-11-20" }, newId: { n += 1; return "\(idPrefix)-\(n)" }, now: { 1000 })
    }

    /// A read as the app's parser hands it over: with the engine's tags for its label (these labels are
    /// all under the cap, so the whole label is the text the read shows).
    func outcome(_ read: JSONValue, _ source: ReadPath, fallbackAfter: FallbackAfter? = nil) -> ReadOutcome {
        var tags: [String] = []
        if case let .string(label)? = read["labelText"], !label.isEmpty, let engine = try? Self.bundledEngine(),
           case let .array(values)? = try? engine.labelTags(label) {
            tags = values.compactMap { if case let .string(s) = $0 { s } else { nil } }
        }
        return ReadOutcome(read: read, source: source, route: .hybrid, failure: nil,
                           records: [RouteRecord(kind: .photo, path: source, model: "m", reason: .onDeviceDefault, latencyMs: 1200, blocked: nil)],
                           fallbackAfter: fallbackAfter, labelTags: tags)
    }

    static let markedLotion = read(["itemName": .string("Body lotion"), "category": .string("lotion_cream"),
                                    "labelText": .string("BODY LOTION ZQXWORD"), "liquid": .bool(true)])

    /// A photo read as the app's parser gives it: tags from the whole label, the shown text clipped.
    func parsed(_ engine: RulesEngine, _ label: String) throws -> ReadOutcome {
        let raw = Self.read(["itemName": .string("Body lotion"), "category": .string("lotion_cream"), "labelText": .string(label),
                             "liquid": .bool(true), "retailBox": .string("sealed")])
        let p = try engine.parseItemReadTagged(String(decoding: try JSONEncoder().encode(raw), as: UTF8.self))
        var o = outcome(p.read, .onDevice)
        o.labelTags = p.labelTags
        o.wholeLabel = label
        return o
    }
    static func x(_ n: Int) -> String { String(repeating: "x", count: n) }

    /// A hazard word past the label cap counts, and a cut that ends "FLAMMABLE-FREE" at "FLAMMABLE"
    /// never makes one: the item keeps the tags of its whole label, and the saved copy keeps no label.
    @Test func aPhotoReadKeepsTheTagsOfItsWholeLabelNotTheClippedText() throws {
        let engine = try Self.bundledEngine()
        func level(_ label: String) throws -> (String?, [String], BoxSnapshot?) {
            let p = MemoryBoxPersistence()
            let s = try store(p, engine: engine)
            let id = try #require(s.addRead(try parsed(engine, label), cropFile: nil))
            return (s.result?.items[id]?.level, s.items[0].labelTags, p.saved.last)
        }
        // The same lotion with no hazard word is OK, so the checks below are not vacuous.
        #expect(try level(Self.x(155) + " LOTION").0 == "ok")
        let past = try level(Self.x(155) + " FLAMMABLE")
        #expect(past.1.contains("flammable") && past.0 != "ok")
        #expect(past.2?.items.first?.wholeLabel == nil && past.2?.items.first?.labelTags.contains("flammable") == true)
        let cut = try level(Self.x(150) + " FLAMMABLE-FREE LOTION")
        #expect(!cut.1.contains("flammable") && cut.0 == "ok")
    }

    /// A new edition reads the whole label still in memory again, never the clipped text shown.
    @Test func aNewEditionReadsTheWholeLabelAgainNotTheClippedText() throws {
        let engine = try Self.bundledEngine()
        let s = try store(engine: engine)
        _ = try #require(s.addRead(try parsed(engine, Self.x(155) + " ZQXWORD"), cropFile: nil))
        _ = try engine.setEdition(Self.editionWithLabelWord("zqxword", tag: "alcohol", id: "byt-more-words"))
        s.reevaluate()
        #expect(s.items[0].labelTags.contains("alcohol") && s.items[0].tagsEdition == "byt-more-words")
    }

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

    /// The box-wide lithium total depends on every item still in the box. While one item's label
    /// must be read again, no lithium item is OK on a total that may be missing it.
    @Test func aStaleLabelWithholdsTheOtherItemsLithiumOK() throws {
        let p = MemoryBoxPersistence()
        let first = try store(p)
        let staleId = first.addManual(Self.markedLotion)
        let engine = try Self.bundledEngine()
        _ = try engine.setEdition(Self.editionWithLabelWord("zqxword", tag: "alcohol", id: "byt-more-words"))
        let restored = try store(MemoryBoxPersistence(stored: p.saved.last), engine: engine, idPrefix: "later")
        restored.load()
        let phoneId = restored.addManual(Self.phone)
        // A new sealed phone is OK on its own; here it waits for the other label.
        restored.answer(phoneId, question: "device_condition", answer: "new_sealed")
        let phone = try #require(restored.result?.items[phoneId])
        #expect(phone.level == "check" && phone.hits.first?.text == BoxStore.lithiumWaits)
        #expect(restored.result?.lithium.status == "depends" && restored.result?.lithium.text == BoxStore.lithiumBoxWaits)
        #expect(restored.result?.counts.ok == 0)
        // Once that item is out of the box, the phone stands on its own again.
        restored.remove(staleId)
        #expect(restored.result?.items[phoneId]?.level == "ok" && restored.result?.lithium.status == "ok")
    }

    /// A saved box from an earlier version, with these items, read back under the bundled edition.
    func restoredOlder(_ reads: [JSONValue]) throws -> (BoxStore, [String]) {
        let p = MemoryBoxPersistence()
        let first = try store(p)
        let ids = reads.map { first.addManual($0) }
        var json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(try #require(p.saved.last))) as! [String: Any]
        json["items"] = (json["items"] as! [[String: Any]]).map { var item = $0; item["tagsEdition"] = nil; return item }
        let older = try JSONDecoder().decode(BoxSnapshot.self, from: JSONSerialization.data(withJSONObject: json))
        let restored = try store(MemoryBoxPersistence(stored: older), idPrefix: "later")
        restored.load()
        return (restored, ids)
    }

    /// A stale item marked "Take out" is still in the box until the sender removes it, so it holds
    /// the lithium total like any other stale item.
    @Test func aStaleTakeOutItemStillHoldsTheLithiumTotal() throws {
        let (restored, ids) = try restoredOlder([Self.perfume])
        let perfume = try #require(restored.result?.items[ids[0]])
        #expect(perfume.level == "take_out")
        let phoneId = restored.addManual(Self.phone)
        restored.answer(phoneId, question: "device_condition", answer: "new_sealed")
        #expect(restored.result?.items[phoneId]?.level == "check" && restored.result?.items[phoneId]?.hits.first?.text == BoxStore.lithiumWaits)
        restored.remove(ids[0])
        #expect(restored.result?.items[phoneId]?.level == "ok")
    }

    /// With stale items in the box and no lithium found yet, the box still says the total waits.
    @Test func aStaleItemAloneSaysTheLithiumTotalWaits() throws {
        let (restored, _) = try restoredOlder([Self.lotion])
        #expect(restored.result?.lithium.status == "depends" && restored.result?.lithium.text == BoxStore.lithiumBoxWaits)
    }

    /// Blank words are not a label: typing spaces (or nothing) over a stale item's label keeps it
    /// stale until real words are read.
    @Test func aBlankLabelEditKeepsAStaleItemStale() throws {
        for blank in ["", "   "] {
            let p = MemoryBoxPersistence()
            let first = try store(p)
            let id = first.addManual(Self.lotion)
            var json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(try #require(p.saved.last))) as! [String: Any]
            json["items"] = (json["items"] as! [[String: Any]]).map { var item = $0; item["tagsEdition"] = nil; return item }
            let older = try JSONDecoder().decode(BoxSnapshot.self, from: JSONSerialization.data(withJSONObject: json))
            let restored = try store(MemoryBoxPersistence(stored: older))
            restored.load()
            restored.override(id, patch: ["labelText": .string(blank)])
            #expect(restored.result?.items[id]?.level == "check" && restored.result?.items[id]?.hits.first?.text == BoxStore.labelUnknown, "\(blank)")
            // Real words do read it again.
            restored.override(id, patch: ["labelText": .string("SHEA BODY LOTION 8 FL OZ")])
            #expect(restored.result?.items[id]?.hits.first?.text != BoxStore.labelUnknown)
        }
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
        private(set) var saved: [BoxSnapshot] = []
        func save(_ snapshot: BoxSnapshot) throws {
            if failing { throw BoxFiles.SaveError(BoxFiles.tooLarge) }
            saved.append(snapshot)
        }
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

    /// A saved box that cannot be read yet (a locked iPhone), then can.
    final class LockedPersistence: BoxPersistence, @unchecked Sendable {
        var locked = true
        let stored: BoxSnapshot
        private(set) var saved: [BoxSnapshot] = []
        init(stored: BoxSnapshot) { self.stored = stored }
        func save(_ snapshot: BoxSnapshot) throws {
            if locked { throw BoxFiles.SaveError(BoxFiles.notReadYet, savedBoxUnread: true) }
            saved.append(snapshot)
        }
        func load(boxId: String) -> BoxSnapshot? { locked ? nil : stored }
    }

    /// When the saved box could not be read yet, "Try saving again" reads it first, keeps what was
    /// added meanwhile, and only then saves.
    @Test func tryingAgainReadsTheSavedBoxThatCouldNotBeReadYet() throws {
        let earlier = BoxItem(itemId: "saved-1", read: Self.shirt, identityConfirmedBy: "sender", tagsEdition: "", readSource: "manual", readMs: 0)
        let p = LockedPersistence(stored: BoxSnapshot(boxId: "b", destinationCode: "CA", items: [earlier], cloudConsent: nil, sources: BoxSources()))
        let s = try store(p)
        s.load()
        let added = s.addManual(Self.lotion)
        #expect(s.saveProblem == BoxFiles.notReadYet && s.items.count == 1)
        p.locked = false
        s.retrySave()
        #expect(s.saveProblem == nil && Set(s.items.map(\.itemId)) == ["saved-1", added])
        #expect(Set(p.saved.last?.items.map(\.itemId) ?? []) == ["saved-1", added] && s.result?.items["saved-1"] != nil)
    }

    /// "Try saving again" saves the box as it is, with nothing changed, and clears the warning once it works.
    @Test func tryingToSaveAgainSavesTheBoxAsItIs() throws {
        let p = FailingPersistence()
        let s = try store(p)
        s.addManual(Self.lotion)
        s.retrySave()
        #expect(s.saveProblem == BoxFiles.tooLarge && p.saved.isEmpty)
        p.failing = false
        s.retrySave()
        #expect(s.saveProblem == nil && p.saved.last?.items.count == 1)
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
