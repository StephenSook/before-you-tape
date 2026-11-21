import BYTCore
import Foundation
import Testing
@testable import BYT

/// The web app's second-look store tests (src/data/boxStore.test.ts), same reads, same expectations:
/// the merge and the disputes come from the bundled engine, as on the iPhone.
@MainActor
@Suite struct SecondLookStoreTests {
    let t = BoxStoreTests()
    let engine: RulesEngine
    init() throws { engine = try BoxStoreTests.bundledEngine() }

    static func with(_ read: JSONValue, _ patch: [String: JSONValue]) -> JSONValue {
        guard case var .object(o) = read else { return read }
        for (k, v) in patch { o[k] = v }
        return .object(o)
    }

    static func label(_ read: JSONValue) -> String? { if case let .string(s)? = read["labelText"] { s } else { nil } }

    func level(_ s: BoxStore, _ id: String) -> String? { s.result?.items[id]?.level }
    func dispute(_ s: BoxStore, _ field: String) -> JSONValue? { s.items.first?.disputes?[field] }

    /// A label with no "power bank" words, so only the category tells the two reads apart.
    static let powerBank = BoxStoreTests.read(["itemName": .string("Power bank"), "category": .string("power_bank"),
        "labelText": .string("LI-ION 3.7V 5000mAh 18.5Wh"), "volts": .number(3.7), "milliampHours": .number(5000),
        "wattHours": .number(18.5), "batteryWords": .bool(true), "retailBox": .string("sealed")])
    static let lotion = with(BoxStoreTests.lotion, ["flammableOnLabel": .bool(false)])

    /// Adds the device read, answers as a sender would, then lands the second look (Canada).
    func look(_ device: JSONValue, _ cloud: JSONValue, disputes: Bool = true,
              persistence: MemoryBoxPersistence = MemoryBoxPersistence()) throws -> (BoxStore, String) {
        let s = try t.store(persistence, engine: engine)
        s.setDestination("CA")
        let id = try #require(s.addRead(t.outcome(device, .onDevice), cropFile: nil))
        s.answer(id, question: "device_condition", answer: "new_sealed")
        s.answer(id, question: "cell_count", answer: "one")
        let m = try engine.mergeSecondLook(device: device, cloud: cloud)
        s.applySecondLook(id, merged: m.merged, ms: 900, reason: "reason", cloudLabel: Self.label(cloud),
                          disputes: disputes ? m.disputes : .object([:]))
        return (s, id)
    }

    @Test func anAgreeingSecondLookConfirmsTheItemAndADifferentOneDoesNot() throws {
        let s = try t.store(engine: engine)
        let a = try #require(s.addRead(t.outcome(BoxStoreTests.shirt, .onDevice), cropFile: nil))
        s.applySecondLook(a, merged: BoxStoreTests.shirt, ms: 900, reason: "identity", cloudLabel: nil)
        #expect(s.items[0].identityConfirmedBy == "second_look")
        let b = try #require(s.addRead(t.outcome(BoxStoreTests.shirt, .onDevice), cropFile: nil))
        s.applySecondLook(b, merged: Self.with(BoxStoreTests.shirt, ["category": .string("toy")]), ms: 900, reason: "identity", cloudLabel: nil)
        #expect(s.items[1].identityConfirmedBy == nil && s.items[1].read["category"] == .string("toy"))
        #expect(s.sources.secondLooks == 2)
        #expect(s.items[1].secondLook == SecondLookNote(ms: 900, reason: "identity"))
    }

    @Test func aSecondLookKeepsTheUnionOfBothLabelsTags() throws {
        let flammable = Self.with(Self.lotion, ["labelText": .string("FLAMMABLE BODY LOTION")])
        let plain = Self.with(Self.lotion, ["labelText": .string("SHEA BUTTER MOISTURE BODY LOTION FOR DRY SKIN 8 FL OZ")])
        // The flammable label alone is Take it out for Canada.
        let alone = try t.store(engine: engine)
        #expect(level(alone, try #require(alone.addRead(t.outcome(flammable, .onDevice), cropFile: nil))) == "take_out")
        for (device, cloud) in [(flammable, plain), (plain, flammable)] {
            let s = try t.store(engine: engine)
            let id = try #require(s.addRead(t.outcome(device, .onDevice), cropFile: nil))
            let m = try engine.mergeSecondLook(device: device, cloud: cloud)
            s.applySecondLook(id, merged: m.merged, ms: 900, reason: "reason", cloudLabel: Self.label(cloud))
            #expect(level(s, id) == "take_out", "device \(Self.label(device) ?? ""), cloud \(Self.label(cloud) ?? "")")
        }
    }

    /// Picking a reading uses that reading: a correction of part of it made earlier does not stay on top,
    /// so the rules never judge numbers the sender did not pick.
    @Test func pickingABatteryReadingReplacesAnEarlierPartialCorrection() throws {
        let cloud = Self.with(Self.powerBank, ["milliampHours": .number(10000), "wattHours": .number(37)])
        let (s, id) = try look(Self.powerBank, cloud)
        s.override(id, patch: ["milliampHours": .number(2500)])
        #expect(dispute(s, "battery")?["resolved"] == .bool(false))
        s.settleDispute(id, field: "battery", side: .cloud)
        #expect(s.items[0].overrides["milliampHours"] == nil)
        #expect(s.items[0].read["milliampHours"] == .number(10000) && s.items[0].read["wattHours"] == .number(37))
    }

    /// A rule update while the label words are still disputed tags both sides again, so a pick made after
    /// it uses the current edition's words, never the ones the earlier edition found.
    @Test func pickingALabelAfterARuleUpdateUsesTheCurrentWords() throws {
        let deviceText = "SHEA ZQXWORD BODY LOTION"
        let device = Self.with(Self.lotion, ["labelText": .string(deviceText)])
        let cloud = Self.with(Self.lotion, ["labelText": .string("FLAMMABLE BODY LOTION")])
        let engine = try BoxStoreTests.bundledEngine()
        let s = try t.store(engine: engine)
        var outcome = t.outcome(device, .onDevice)
        outcome.wholeLabel = deviceText
        let id = try #require(s.addRead(outcome, cropFile: nil))
        let m = try engine.mergeSecondLook(device: device, cloud: cloud)
        s.applySecondLook(id, merged: m.merged, ms: 900, reason: "reason", cloudLabel: Self.label(cloud), disputes: m.disputes)
        #expect(dispute(s, "labelTags")?["resolved"] == .bool(false))
        _ = try engine.setEdition(BoxStoreTests.editionWithLabelWord("zqxword", tag: "alcohol", id: "byt-more-words"))
        s.reevaluate()
        s.settleDispute(id, field: "labelTags", side: .device)
        #expect(s.items[0].labelTags.contains("alcohol") && !s.items[0].labelTags.contains("flammable"), "\(s.items[0].labelTags)")
        #expect(s.items[0].tagsEdition == "byt-more-words")
    }

    /// A rule update tags again the labels still in memory: both reads' labels while their words are
    /// merged, and only the picked read's label once the sender picked one. A warning only the cloud
    /// read saw is never dropped by a rule update.
    @Test func aRuleUpdateKeepsTheLabelWordsOfThePickedRead() throws {
        let plainText = "SHEA BUTTER MOISTURE BODY LOTION FOR DRY SKIN 8 FL OZ"
        let plain = Self.with(Self.lotion, ["labelText": .string(plainText)])
        let flammable = Self.with(Self.lotion, ["labelText": .string("FLAMMABLE BODY LOTION")])
        for pick in [nil, DisputeSide.cloud, .device] {
            let engine = try BoxStoreTests.bundledEngine()
            let s = try t.store(engine: engine)
            var device = t.outcome(plain, .onDevice)
            device.wholeLabel = plainText
            let id = try #require(s.addRead(device, cropFile: nil))
            let m = try engine.mergeSecondLook(device: plain, cloud: flammable)
            s.applySecondLook(id, merged: m.merged, ms: 900, reason: "reason", cloudLabel: Self.label(flammable), disputes: m.disputes)
            if let pick { s.settleDispute(id, field: "labelTags", side: pick) }
            let tags = Set(s.items[0].labelTags), before = level(s, id)
            #expect(tags.contains("flammable") == (pick != .device), "pick \(String(describing: pick))")
            _ = try engine.setEdition(BoxStoreTests.editionWithLabelWord("zqxword", tag: "alcohol", id: "byt-more-words"))
            s.reevaluate()
            #expect(s.items[0].tagsEdition == "byt-more-words")
            #expect(Set(s.items[0].labelTags) == tags, "pick \(String(describing: pick))")
            #expect(level(s, id) == before, "pick \(String(describing: pick))")
        }
    }

    @Test func aLabelCorrectionMadeWhileTheLookRanIsKeptAcrossAReload() throws {
        let flammable = Self.with(BoxStoreTests.lotion, ["labelText": .string("FLAMMABLE BODY LOTION")])
        let p = MemoryBoxPersistence()
        let s = try t.store(p, engine: engine)
        let id = try #require(s.addRead(t.outcome(flammable, .onDevice), cropFile: nil))
        s.override(id, patch: ["labelText": .string("SHEA BODY LOTION 8 FL OZ")])
        let m = try engine.mergeSecondLook(device: flammable, cloud: flammable)
        s.applySecondLook(id, merged: m.merged, ms: 900, reason: "reason", cloudLabel: Self.label(flammable))
        let before = level(s, id)
        #expect(before != "take_out")
        let saved = try #require(p.saved.last)
        #expect(!saved.items[0].labelTags.contains("flammable"))
        let reloaded = try t.store(MemoryBoxPersistence(stored: saved), engine: engine)
        reloaded.load()
        #expect(level(reloaded, id) == before)
    }

    @Test func aPowerBankReadAsAPhoneIsHeldAtCheckThis() throws {
        let phone = Self.with(Self.powerBank, ["itemName": .string("Phone"), "category": .string("phone")])
        let control = try look(Self.powerBank, phone, disputes: false)
        #expect(level(control.0, control.1) == "ok")
        let (s, id) = try look(Self.powerBank, phone)
        #expect(level(s, id) == "check")
        #expect(s.result?.items[id]?.hits.map(\.ruleId).contains("DATA-DISPUTE") == true)
        #expect(dispute(s, "category") == .object(["device": .string("power_bank"), "cloud": .string("phone"), "resolved": .bool(false)]))
    }

    @Test func noCautiousReadingEndsAtOK() throws {
        let phone = Self.with(Self.powerBank, ["itemName": .string("Phone"), "category": .string("phone"), "labelText": .string("3.85V 4000mAh 15.4Wh"),
                                              "volts": .number(3.85), "milliampHours": .number(4000), "wattHours": .number(15.4)])
        let box = try look(Self.with(phone, ["retailBox": .string("open_or_none")]), phone)
        #expect(level(box.0, box.1) != "ok" && box.0.items[0].read["retailBox"] == .string("open_or_none"))
        let wh = try look(Self.with(Self.powerBank, ["volts": .number(3.7), "milliampHours": .number(25675), "wattHours": .number(95)]),
                          Self.with(Self.powerBank, ["volts": .number(3.6), "milliampHours": .number(25675), "wattHours": .number(105)]))
        #expect(level(wh.0, wh.1) != "ok" && wh.0.items[0].read["wattHours"] == .number(105))
        let grams = try look(Self.with(phone, ["lithiumGrams": .number(2.5)]), phone)
        #expect(level(grams.0, grams.1) != "ok" && grams.0.items[0].read["lithiumGrams"] == .number(2.5))
    }

    @Test func aLabelWordOnlyOneReadSawIsADisputeOfTagsNeverOfText() throws {
        let (s, _) = try look(Self.with(Self.lotion, ["labelText": .string("FLAMMABLE BODY LOTION")]),
                              Self.with(Self.lotion, ["labelText": .string("SHEA BUTTER BODY LOTION 8 FL OZ")]))
        let d = try #require(dispute(s, "labelTags"))
        #expect(d["device"].map { "\($0)" }?.contains("flammable") == true)
        #expect(d["cloud"].map { "\($0)" }?.contains("flammable") == false)
        let saved = String(decoding: try JSONEncoder().encode(s.items[0].forStorage.disputes), as: UTF8.self)
        #expect(!saved.contains("LOTION"))
    }

    @Test func noDisputeStandsOnAFactTheSenderCorrectedWhileTheLookRan() throws {
        let s = try t.store(engine: engine)
        let id = try #require(s.addRead(t.outcome(Self.powerBank, .onDevice), cropFile: nil))
        s.override(id, patch: ["category": .string("power_bank"), "labelText": .string("POWER BANK 37Wh")])
        let phone = Self.with(Self.powerBank, ["category": .string("phone"), "labelText": .string("FLAMMABLE PHONE")])
        let m = try engine.mergeSecondLook(device: Self.powerBank, cloud: phone)
        s.applySecondLook(id, merged: m.merged, ms: 900, reason: "reason", cloudLabel: Self.label(phone), disputes: m.disputes)
        #expect(s.items[0].disputes == nil)
    }

    @Test func thePickedReadingSettlesTheDisputeAndIsJudged() throws {
        let phone = Self.with(Self.powerBank, ["itemName": .string("Phone"), "category": .string("phone")])
        let (s, id) = try look(Self.powerBank, phone)
        s.settleDispute(id, field: "category", side: .device)
        #expect(s.items[0].read["category"] == .string("power_bank") && s.items[0].read["itemName"] == .string("Power bank"))
        #expect(dispute(s, "category")?["resolved"] == .bool(true) && s.items[0].identityConfirmedBy == "sender")
        #expect(level(s, id) == "take_out")
        let wh = try look(Self.with(Self.powerBank, ["volts": .number(3.7), "milliampHours": .number(25675), "wattHours": .number(95)]),
                          Self.with(Self.powerBank, ["volts": .number(3.6), "milliampHours": .number(25675), "wattHours": .number(105)]))
        wh.0.settleDispute(wh.1, field: "battery", side: .device)
        #expect(wh.0.items[0].read["volts"] == .number(3.7) && wh.0.items[0].read["wattHours"] == .number(95))
        #expect(wh.0.items[0].disputes?["battery"]?["resolved"] == .bool(true))
        // Picking a label brings back that read's label and its words, and only those.
        let lab = try look(Self.with(Self.lotion, ["labelText": .string("FLAMMABLE BODY LOTION")]),
                           Self.with(Self.lotion, ["labelText": .string("SHEA BUTTER BODY LOTION 8 FL OZ")]))
        #expect(level(lab.0, lab.1) == "take_out")
        lab.0.settleDispute(lab.1, field: "labelTags", side: .cloud)
        #expect(!lab.0.items[0].labelTags.contains("flammable"))
        #expect(lab.0.items[0].read["labelText"] == .string("SHEA BUTTER BODY LOTION 8 FL OZ"))
        #expect(level(lab.0, lab.1) == "ok")
        lab.0.settleDispute(lab.1, field: "labelTags", side: .device)
        #expect(lab.0.items[0].read["labelText"] == .string("FLAMMABLE BODY LOTION"))
        #expect(level(lab.0, lab.1) == "take_out")
    }

    @Test func aFirstReadThatWasNotSureStaysAtCheckThis() throws {
        let phone = Self.with(Self.powerBank, ["itemName": .string("Phone"), "category": .string("phone")])
        let (s, id) = try look(Self.with(phone, ["evidence": .string("not_sure")]), Self.with(phone, ["evidence": .string("label_read")]))
        #expect(level(s, id) == "check")
        #expect(dispute(s, "evidence") == .object(["device": .string("not_sure"), "cloud": .string("label_read"), "resolved": .bool(false)]))
        s.settleDispute(id, field: "evidence", side: .cloud)
        #expect(s.items[0].read["evidence"] == .string("label_read") && level(s, id) == "ok")
    }

    @Test func afterAReloadThePickedCategoryNamesTheItem() throws {
        let phone = Self.with(Self.powerBank, ["itemName": .string("Phone"), "category": .string("phone")])
        let p = MemoryBoxPersistence()
        _ = try look(Self.powerBank, phone, persistence: p)
        let reloaded = try t.store(MemoryBoxPersistence(stored: try #require(p.saved.last)), engine: engine)
        reloaded.load()
        let id = try #require(reloaded.items.first?.itemId)
        reloaded.settleDispute(id, field: "category", side: .device)
        #expect(reloaded.items[0].read["itemName"] == .string("Power bank"))
    }

    @Test func noHazardComesFromTheClippedLabelASecondLookShows() throws {
        let whole = String(repeating: "x", count: 150) + " FLAMMABLE-FREE LOTION"
        let cloud = Self.with(Self.lotion, ["labelText": .string(String(String.UnicodeScalarView(whole.unicodeScalars.prefix(160))))])
        let s = try t.store(engine: engine)
        let id = try #require(s.addRead(t.outcome(Self.lotion, .onDevice), cropFile: nil))
        let m = try engine.mergeSecondLook(device: Self.lotion, cloud: cloud)
        s.applySecondLook(id, merged: m.merged, ms: 900, reason: "reason", cloudLabel: whole, disputes: m.disputes)
        #expect(!s.items[0].labelTags.contains("flammable") && level(s, id) != "take_out")
    }

    @Test func batteryNumbersSettleOnlyOnAWholeSet() throws {
        let device = Self.with(Self.powerBank, ["volts": .number(3.7), "milliampHours": .number(2500), "wattHours": .number(0)])
        let cloud = Self.with(Self.powerBank, ["volts": .number(3.8), "milliampHours": .number(2500), "wattHours": .number(9.5)])
        let (s, id) = try look(device, cloud)
        s.override(id, patch: ["milliampHours": .number(2600)])
        #expect(dispute(s, "battery")?["resolved"] == .bool(false))
        #expect(s.result?.items[id]?.hits.map(\.ruleId).contains("DATA-DISPUTE") == true)
        s.override(id, patch: ["volts": .number(3.7), "milliampHours": .number(2600), "wattHours": .number(9.62)])
        #expect(dispute(s, "battery")?["resolved"] == .bool(true))
        // A single number corrected while the cloud read ran does not cancel the battery dispute either.
        let early = try t.store(engine: engine)
        let eid = try #require(early.addRead(t.outcome(device, .onDevice), cropFile: nil))
        early.override(eid, patch: ["milliampHours": .number(2500)])
        let m = try engine.mergeSecondLook(device: device, cloud: cloud)
        early.applySecondLook(eid, merged: m.merged, ms: 900, reason: "reason", cloudLabel: Self.label(cloud), disputes: m.disputes)
        #expect(early.items[0].disputes?["battery"]?["resolved"] == .bool(false))
    }

    @Test func fixingAFactSettlesItsDisputeAndTheSavedCopyKeepsTheDisputes() throws {
        let p = MemoryBoxPersistence()
        let phone = Self.with(Self.powerBank, ["itemName": .string("Phone"), "category": .string("phone")])
        let (s, id) = try look(Self.powerBank, phone, persistence: p)
        #expect(p.saved.last?.items[0].disputes?["category"]?["resolved"] == .bool(false))
        s.override(id, patch: ["category": .string("power_bank")])
        #expect(dispute(s, "category")?["resolved"] == .bool(true))
        #expect(s.result?.items[id]?.hits.map(\.ruleId).contains("DATA-DISPUTE") == false)
        #expect(p.saved.last?.items[0].disputes?["category"]?["resolved"] == .bool(true))
    }
}
