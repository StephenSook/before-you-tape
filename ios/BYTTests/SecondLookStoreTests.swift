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

    /// A rule update that makes both labels carry the same words settles their dispute: there is nothing
    /// left for the sender to choose between.
    @Test func aRuleUpdateThatMakesTheLabelsAgreeSettlesTheirDispute() throws {
        let device = Self.with(Self.lotion, ["labelText": .string("FLAMMABLE BODY LOTION")])
        let cloudText = "SHEA ZQXWORD BODY LOTION"
        let cloud = Self.with(Self.lotion, ["labelText": .string(cloudText)])
        let engine = try BoxStoreTests.bundledEngine()
        let s = try t.store(engine: engine)
        var outcome = t.outcome(device, .onDevice)
        outcome.wholeLabel = "FLAMMABLE BODY LOTION"
        let id = try #require(s.addRead(outcome, cropFile: nil))
        let m = try engine.mergeSecondLook(device: device, cloud: cloud)
        s.applySecondLook(id, merged: m.merged, ms: 900, reason: "reason", cloudLabel: cloudText, disputes: m.disputes)
        #expect(dispute(s, "labelTags")?["resolved"] == .bool(false))
        _ = try engine.setEdition(BoxStoreTests.editionWithLabelWord("zqxword", tag: "flammable", id: "byt-more-words"))
        s.reevaluate()
        #expect(dispute(s, "labelTags")?["resolved"] == .bool(true))
        #expect(level(s, id) == "take_out")
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
        // Without the dispute, the cloud's category alone does not hold it: what still holds it is the one-read
        // battery check, as the reads did not agree on what it is.
        let controlRules = control.0.result?.items[control.1]?.hits.map(\.ruleId) ?? []
        #expect(!controlRules.contains("DATA-DISPUTE") && controlRules.contains("USPS-INTL-LI-ONE-READ"), "\(controlRules)")
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

    // Battery numbers stand only when a second look read the same ones (USPS-INTL-LI-ONE-READ): numbers the
    // sender picked between two readings, or typed, are the sender's (the web app's tests of the same name).
    static let phone = with(powerBank, ["itemName": .string("Phone"), "category": .string("phone"), "labelText": .string("3.85V 4000mAh 15.4Wh"),
                                        "volts": .number(3.85), "milliampHours": .number(4000), "wattHours": .number(15.4)])
    /// No Wh on its label, like the web test's: a label figure above a typed number holds it (rule edition revision 7).
    static let bigPhone = with(phone, ["labelText": .string("3.85V 40000mAh"), "milliampHours": .number(40000), "wattHours": .number(154)])
    func ruleIds(_ s: BoxStore, _ id: String) -> [String] { s.result?.items[id]?.hits.map(\.ruleId) ?? [] }

    @Test func numbersBothReadsAgreedOnAreOK() throws {
        let (s, id) = try look(Self.phone, Self.phone)
        #expect(s.items[0].identityConfirmedBy == "second_look")
        #expect(level(s, id) == "ok")
    }

    @Test func numbersPickedBetweenTwoReadingsAreHeldEitherSide() throws {
        // The smaller reading would have been OK: it is held for its numbers.
        let small = try look(Self.phone, Self.bigPhone)
        // Reads that disagree on the numbers never make a second look stand behind them, picked or not.
        #expect(small.0.items[0].identityConfirmedBy != "second_look")
        small.0.settleDispute(small.1, field: "battery", side: .device)
        #expect(small.0.items[0].identityConfirmedBy != "second_look")
        #expect(level(small.0, small.1) == "check")
        #expect(ruleIds(small.0, small.1).contains("USPS-INTL-LI-ONE-READ"))
        // The larger one is over 100 Wh and out either way.
        let large = try look(Self.phone, Self.bigPhone)
        large.0.settleDispute(large.1, field: "battery", side: .cloud)
        #expect(dispute(large.0, "battery")?["resolved"] == .bool(true))
        #expect(large.0.items[0].identityConfirmedBy != "second_look")
        #expect(level(large.0, large.1) == "take_out")
    }

    /// An item a second look confirmed while its numbers were still disputed (a box saved by an earlier
    /// build): picking either side of the battery or lithium grams makes the numbers the sender's.
    @Test func pickingNumbersOnASecondLookItemMakesThemTheSenders() throws {
        let numbers: [(String, JSONValue)] = [
            ("battery", .object(["device": .object(["volts": .number(3.85), "milliampHours": .number(4000), "wattHours": .number(15.4)]),
                                 "cloud": .object(["volts": .number(3.85), "milliampHours": .number(40000), "wattHours": .number(154)]),
                                 "resolved": .bool(false)])),
            ("lithiumGrams", .object(["device": .number(0.1), "cloud": .number(1.2), "resolved": .bool(false)])),
        ]
        for (field, open) in numbers {
            for side in [DisputeSide.device, .cloud] {
                let item = BoxItem(itemId: "saved-n", read: Self.with(Self.phone, ["labelText": .string("")]),
                                   answers: ["device_condition": "new_sealed", "cell_count": "one"], identityConfirmedBy: "second_look",
                                   tagsEdition: "", readSource: "phone_on_device", readMs: 900,
                                   secondLook: SecondLookNote(ms: 900, reason: "battery_numbers"), disputes: .object([field: open]))
                let p = MemoryBoxPersistence(stored: BoxSnapshot(boxId: "saved-box", destinationCode: "CA", items: [item],
                                                                cloudConsent: true, sources: BoxSources()))
                let s = try t.store(p, engine: engine)
                s.load()
                s.settleDispute("saved-n", field: field, side: side)
                #expect(dispute(s, field)?["resolved"] == .bool(true), "\(field) \(side)")
                #expect(s.items[0].identityConfirmedBy == "sender", "\(field) \(side)")
                #expect(p.saved.last?.items.first?.identityConfirmedBy == "sender", "\(field) \(side)")
            }
        }
    }

    @Test func lithiumGramsPickedBetweenTwoReadingsAreHeld() throws {
        let coin = Self.with(Self.phone, ["category": .string("battery_toy"), "itemName": .string("Toy"), "labelText": .string("CR2032 LITHIUM"),
                                          "volts": .number(3), "milliampHours": .number(0), "wattHours": .number(0), "lithiumGrams": .number(0.1)])
        let (s, id) = try look(coin, Self.with(coin, ["lithiumGrams": .number(1.2)]))
        #expect(s.items[0].identityConfirmedBy != "second_look")
        s.settleDispute(id, field: "lithiumGrams", side: .device)
        #expect(s.items[0].identityConfirmedBy != "second_look")
        #expect(level(s, id) == "check")
        #expect(ruleIds(s, id).contains("USPS-INTL-LI-ONE-READ"))
    }

    @Test func numbersTypedInFullAreJudgedOnTheirRulesAndAPartlyTypedSetIsHeld() throws {
        // All three numbers typed: they are the sender's, and the Wh rules judge them (rule edition revision 7).
        let all = try look(Self.bigPhone, Self.bigPhone)
        #expect(all.0.items[0].identityConfirmedBy == "second_look")
        all.0.override(all.1, patch: ["volts": .number(3.85), "milliampHours": .number(4000), "wattHours": .number(15.4)])
        #expect(all.0.items[0].identityConfirmedBy == "sender")
        #expect(level(all.0, all.1) == "ok")
        #expect(!ruleIds(all.0, all.1).contains("USPS-INTL-LI-ONE-READ"))
        // One number typed makes the identity the sender's, and the set is part typed, part read: never OK.
        for patch: [String: JSONValue] in [["volts": .number(3.7)], ["milliampHours": .number(4000)], ["wattHours": .number(15.4)],
                                           ["lithiumGrams": .number(0.1)]] {
            let one = try look(Self.bigPhone, Self.bigPhone)
            one.0.override(one.1, patch: patch)
            #expect(one.0.items[0].identityConfirmedBy == "sender", "\(patch)")
            #expect(level(one.0, one.1) != "ok", "\(patch)")
        }
    }

    @Test func numbersTypedWhileTheCloudReadRanAreJudgedAsTheSenders() throws {
        let s = try t.store(engine: engine)
        s.setDestination("CA")
        let id = try #require(s.addRead(t.outcome(Self.bigPhone, .onDevice), cropFile: nil))
        s.answer(id, question: "device_condition", answer: "new_sealed")
        s.answer(id, question: "cell_count", answer: "one")
        s.override(id, patch: ["volts": .number(3.85), "milliampHours": .number(4000), "wattHours": .number(15.4)])
        let m = try engine.mergeSecondLook(device: Self.bigPhone, cloud: Self.bigPhone)
        s.applySecondLook(id, merged: m.merged, ms: 900, reason: "reason", cloudLabel: Self.label(Self.bigPhone), disputes: m.disputes)
        #expect(s.items[0].identityConfirmedBy == "sender")
        #expect(level(s, id) == "ok")
        #expect(!ruleIds(s, id).contains("USPS-INTL-LI-ONE-READ"))
    }

    @Test func anItemTheSenderConfirmedWhileItsLookRanIsReleasedOnceBothReadsAgree() throws {
        let s = try t.store(engine: engine)
        s.setDestination("CA")
        let id = try #require(s.addRead(t.outcome(Self.phone, .onDevice), cropFile: nil))
        s.answer(id, question: "device_condition", answer: "new_sealed")
        s.answer(id, question: "cell_count", answer: "one")
        s.confirmIdentity(id)
        let m = try engine.mergeSecondLook(device: Self.phone, cloud: Self.phone)
        s.applySecondLook(id, merged: m.merged, ms: 900, reason: "reason", cloudLabel: Self.label(Self.phone), disputes: m.disputes)
        #expect(s.items[0].identityConfirmedBy == "second_look")
        #expect(level(s, id) == "ok")
    }

    /// A box saved by an earlier build, with numbers the sender typed or picked under a second look, is
    /// judged by who gave its numbers when it opens: typed in full, the Wh rules judge them; picked between
    /// two readings, they are still read, so held. What is saved still says second_look, and a recheck
    /// writes nothing.
    @Test func aSavedItemIsJudgedByWhoGaveItsNumbersAndItsSavedIdentityIsKept() throws {
        func saved(_ read: JSONValue, overrides: [String: JSONValue] = [:], disputes: JSONValue? = nil) -> BoxSnapshot {
            let item = BoxItem(itemId: "saved-n", read: Self.with(read, ["labelText": .string("")]), overrides: overrides,
                               answers: ["device_condition": "new_sealed", "cell_count": "one"], identityConfirmedBy: "second_look",
                               tagsEdition: "", readSource: "phone_on_device", readMs: 900,
                               secondLook: SecondLookNote(ms: 900, reason: "battery_numbers"), disputes: disputes)
            return BoxSnapshot(boxId: "saved-box", destinationCode: "CA", items: [item], cloudConsent: true, sources: BoxSources())
        }
        let pickedDispute: JSONValue = .object(["battery": .object([
            "device": .object(["volts": .number(3.85), "milliampHours": .number(4000), "wattHours": .number(15.4)]),
            "cloud": .object(["volts": .number(3.85), "milliampHours": .number(40000), "wattHours": .number(154)]),
            "resolved": .bool(true)])])
        let cases: [(String, BoxSnapshot, String)] = [
            ("control", saved(Self.phone), "ok"),
            ("typed", saved(Self.bigPhone, overrides: ["volts": .number(3.85), "milliampHours": .number(4000), "wattHours": .number(15.4)]), "ok"),
            ("picked", saved(Self.phone, disputes: pickedDispute), "check"),
        ]
        for (name, snapshot, want) in cases {
            let p = MemoryBoxPersistence(stored: snapshot)
            let s = try t.store(p, engine: engine)
            s.load()
            #expect(level(s, "saved-n") == want, "\(name)")
            #expect(ruleIds(s, "saved-n").contains("USPS-INTL-LI-ONE-READ") == (want == "check"), "\(name)")
            #expect(!p.saved.isEmpty && p.saved.allSatisfy { $0.items.first?.identityConfirmedBy == "second_look" }, "\(name)")
            let saves = p.saved.count
            s.reevaluate()
            #expect(p.saved.count == saves, "\(name)")
        }
    }

    @Test func aLaterLookThatSeesAnotherKindOfItemDropsAnEarlierSecondLook() throws {
        let (s, id) = try look(Self.phone, Self.phone)
        #expect(s.items[0].identityConfirmedBy == "second_look")
        // The same numbers, so only what the item is differs between the two looks.
        let tablet = Self.with(Self.phone, ["itemName": .string("Tablet"), "category": .string("tablet")])
        let m = try engine.mergeSecondLook(device: Self.phone, cloud: tablet)
        s.applySecondLook(id, merged: m.merged, ms: 900, reason: "reason", cloudLabel: Self.label(tablet), disputes: m.disputes)
        #expect(s.items[0].identityConfirmedBy != "second_look")
    }

    @Test func aLookIsNotCountedAsAgreeingWhenTheSenderChangedWhatTheItemIs() throws {
        let bank = Self.with(Self.phone, ["itemName": .string("Power bank"), "category": .string("power_bank")])
        let s = try t.store(engine: engine)
        s.setDestination("CA")
        let id = try #require(s.addRead(t.outcome(bank, .onDevice), cropFile: nil))
        s.answer(id, question: "device_condition", answer: "new_sealed")
        s.answer(id, question: "cell_count", answer: "one")
        s.override(id, patch: ["category": .string("phone")])
        s.confirmIdentity(id)
        let m = try engine.mergeSecondLook(device: bank, cloud: bank)
        s.applySecondLook(id, merged: m.merged, ms: 900, reason: "reason", cloudLabel: Self.label(bank), disputes: m.disputes)
        #expect(s.items[0].identityConfirmedBy != "second_look")
        #expect(level(s, id) != "ok")
    }

    @Test func correctionsOfAnythingButTheNumbersKeepTheSecondLook() throws {
        let (s, id) = try look(Self.phone, Self.phone)
        s.override(id, patch: ["itemName": .string("My phone")])
        #expect(s.items[0].identityConfirmedBy == "second_look")
        #expect(level(s, id) == "ok")
    }
}
