import BYTCore
import Foundation
import Testing
@testable import BYT

/// The sender's own edits: the web app's rules (src/ui/ReadFields.tsx, FixReading.tsx, AddByHand.tsx).
@MainActor
@Suite struct ReadDraftTests {
    @Test func numbersAreZeroWhenEmptyAndNeverNegative() {
        #expect(ReadDraft.parseNumber("") == 0 && ReadDraft.parseNumber("  ") == 0)
        #expect(ReadDraft.parseNumber(" 9.62 ") == 9.62)
        #expect(ReadDraft.parseNumber("-1") == nil && ReadDraft.parseNumber("abc") == nil && ReadDraft.parseNumber("inf") == nil)
    }

    @Test func onlyTheChangedFieldsAreSaved() throws {
        let read = BoxStoreTests.read(["itemName": .string("Phone"), "category": .string("phone"), "milliampHours": .number(2500),
                                       "volts": .number(3.7), "wattHours": .number(9.62)])
        var d = ReadDraft.of(read)
        #expect(d.changed(from: read).isEmpty)
        d.numbers["milliampHours"] = "2600"
        d.flags["liquid"] = true
        #expect(d.changed(from: read) == ["milliampHours": .number(2600), "liquid": .bool(true)])
    }

    @Test func aNegativeNumberBlocksSave() {
        var d = ReadDraft.of(BoxStoreTests.shirt)
        #expect(d.numbersValid)
        d.numbers["wattHours"] = "-5"
        #expect(!d.numbersValid)
        d.category = "clothing"
        #expect(d.manualRead() == nil)
    }

    @Test func aTypedItemNeedsWhatItIsAndCountsTheLabelWords() throws {
        var d = ReadDraft.of(nil)
        #expect(d.manualRead() == nil)
        d.category = "perfume_fragrance"
        let seen = try #require(d.manualRead())
        #expect(seen["itemName"] == .string("Perfume or cologne") && seen["evidence"] == .string("item_seen"))
        d.labelText = " EAU DE PARFUM 50 ML "
        let labelled = try #require(d.manualRead())
        #expect(labelled["evidence"] == .string("label_read") && labelled["labelText"] == .string("EAU DE PARFUM 50 ML"))
        #expect(labelled["volts"] == .number(0) && labelled["liquid"] == .bool(false))
    }

    @Test func theCategoryLabelsAreTheWebAppsLabels() throws {
        let web = try String(contentsOf: BoxStoreTests.repo.appendingPathComponent("src/ui/categoryLabels.ts"), encoding: .utf8)
        let pairs = web.split(separator: "\n").compactMap { line -> (String, String)? in
            let t = line.trimmingCharacters(in: .whitespaces)
            guard let colon = t.firstIndex(of: ":"), t.hasSuffix("\","), let quote = t.firstIndex(of: "\"") else { return nil }
            return (String(t[..<colon]), String(t[t.index(after: quote)..<t.index(t.endIndex, offsetBy: -2)]))
        }
        #expect(pairs.count == 38)
        #expect(pairs.map(\.0) == ReadDraft.categories.map(\.id))
        #expect(pairs.map(\.1) == ReadDraft.categories.map(\.label))
    }

    /// Fixing the misread mAh saves only that field and the rules re-check the item at once.
    @Test func fixingTheMisreadNumberReChecksTheItem() throws {
        let s = try BoxStoreTests().store()
        let misread = BoxStoreTests.read(["itemName": .string("Phone"), "category": .string("phone"), "labelText": .string("3.7V 2500mAh 9.62Wh"),
                                          "volts": .number(3.7), "milliampHours": .number(2500), "wattHours": .number(9.62), "batteryWords": .bool(true)])
        let id = s.addManual(misread)
        #expect(s.result?.items[id]?.hits.contains { $0.ruleId == "USPS-INTL-LI-WH-MISMATCH" } == true)
        let item = try #require(s.items.first)
        var d = ReadDraft.of(FixReadingView.current(item))
        d.numbers["milliampHours"] = "2600"
        s.override(id, patch: d.changed(from: FixReadingView.current(item)))
        #expect(s.items.first?.overrides == ["milliampHours": .number(2600)])
        #expect(s.result?.items[id]?.hits.contains { $0.ruleId == "USPS-INTL-LI-WH-MISMATCH" } == false)
    }

    /// A label longer than the engine takes would make it refuse the whole box, so it cannot be saved.
    @Test func aLabelOverTheEnginesCapCannotBeSaved() throws {
        #expect(try RulesEngine().itemReadContract()["labelTextMax"] == .number(Double(ReadDraft.labelTextMax)))
        var d = ReadDraft.of(nil)
        d.category = "clothing"
        d.labelText = String(repeating: "é", count: ReadDraft.labelTextMax)
        #expect(d.canSave && d.manualRead() != nil)
        d.labelText += "x"
        #expect(!d.labelValid && !d.canSave && d.manualRead() == nil)
    }

    /// When the engine refuses the box, every item still has a row the sender can fix or remove.
    @Test func everyItemKeepsARowWhenTheBoxCannotBeChecked() throws {
        let s = try BoxStoreTests().store()
        let shirt = s.addManual(BoxStoreTests.shirt)
        let long = s.addManual(BoxStoreTests.read(["category": .string("clothing"), "labelText": .string(String(repeating: "x", count: 161))]))
        #expect(s.result == nil && s.engineProblem != nil)
        let rows = BoxView.rows(items: s.items, result: s.result)
        #expect(rows.map(\.item.itemId) == [shirt, long] && rows.allSatisfy { $0.verdict == nil })
        s.remove(long)
        #expect(s.result?.items[shirt] != nil)
        #expect(BoxView.rows(items: s.items, result: s.result).first?.verdict != nil)
    }

    /// A new name alone is not a statement about what the item is: "Check this" stays until the
    /// sender changes the category or types the label words.
    @Test func aRenameAloneKeepsTheUncertainty() throws {
        let s = try BoxStoreTests().store()
        let unsure = BoxStoreTests.read(["itemName": .string("Shirt"), "category": .string("clothing"), "evidence": .string("not_sure")])
        let id = s.addRead(ReadOutcome(read: unsure, source: .onDevice, route: .hybrid, failure: nil, records: []), cropFile: nil)!
        #expect(s.result?.items[id]?.level == "check")
        let item = try #require(s.items.first)
        var d = ReadDraft.of(FixReadingView.current(item))
        d.itemName = "My shirt"
        let patch = d.fixPatch(from: FixReadingView.current(item))
        #expect(patch["evidence"] == nil && patch["itemName"] == .string("My shirt"))
        s.applyFix(id, patch: patch)
        #expect(s.items.first?.identityConfirmedBy == nil)
        #expect(s.result?.items[id]?.level == "check" && s.result?.items[id]?.hits.contains { $0.ruleId == "DATA-UNSURE" } == true)
        // Typing the label words does say what it is.
        var l = ReadDraft.of(FixReadingView.current(s.items.first!))
        l.labelText = "100% COTTON T-SHIRT"
        s.applyFix(id, patch: l.fixPatch(from: FixReadingView.current(s.items.first!)))
        #expect(s.result?.items[id]?.hits.contains { $0.ruleId == "DATA-UNSURE" } == false)
    }

    /// Clearing the label words says nothing about what the item is either: only new words or a new category do.
    @Test func clearingTheLabelKeepsTheUncertainty() throws {
        let s = try BoxStoreTests().store()
        let unsure = BoxStoreTests.read(["itemName": .string("Shirt"), "category": .string("clothing"),
                                         "labelText": .string("SHIRT 100% COTTON"), "evidence": .string("not_sure")])
        let id = s.addRead(ReadOutcome(read: unsure, source: .onDevice, route: .hybrid, failure: nil, records: []), cropFile: nil)!
        let item = try #require(s.items.first)
        var d = ReadDraft.of(FixReadingView.current(item))
        d.labelText = "  "
        let patch = d.fixPatch(from: FixReadingView.current(item))
        #expect(patch["labelText"] != nil && patch["evidence"] == nil)
        s.applyFix(id, patch: patch)
        #expect(s.items.first?.identityConfirmedBy == nil)
        #expect(s.result?.items[id]?.level == "check" && s.result?.items[id]?.hits.contains { $0.ruleId == "DATA-UNSURE" } == true)
    }

    /// The same words with a space added are not new words.
    @Test func addingASpaceToTheLabelKeepsTheUncertainty() throws {
        let s = try BoxStoreTests().store()
        let unsure = BoxStoreTests.read(["itemName": .string("Shirt"), "category": .string("clothing"),
                                         "labelText": .string("SHIRT 100% COTTON"), "evidence": .string("not_sure")])
        let id = s.addRead(ReadOutcome(read: unsure, source: .onDevice, route: .hybrid, failure: nil, records: []), cropFile: nil)!
        let item = try #require(s.items.first)
        var d = ReadDraft.of(FixReadingView.current(item))
        d.labelText = " SHIRT 100% COTTON  "
        let patch = d.fixPatch(from: FixReadingView.current(item))
        #expect(patch["evidence"] == nil)
        s.applyFix(id, patch: patch)
        #expect(s.items.first?.identityConfirmedBy == nil && s.result?.items[id]?.level == "check")
    }

    /// A fix that says what the item is clears "We're not sure what this is": the sender's word is the evidence.
    @Test func aFixThatSaysWhatItIsClearsTheUncertainty() throws {
        let s = try BoxStoreTests().store()
        let unsure = BoxStoreTests.read(["itemName": .string("Item"), "category": .string("other"), "evidence": .string("not_sure")])
        let id = s.addRead(ReadOutcome(read: unsure, source: .onDevice, route: .hybrid, failure: nil, records: []), cropFile: nil)!
        #expect(s.result?.items[id]?.hits.contains { $0.ruleId == "DATA-UNSURE" } == true)
        let item = try #require(s.items.first)
        var d = ReadDraft.of(FixReadingView.current(item))
        d.category = "clothing"
        d.itemName = "Cotton shirt"
        s.applyFix(id, patch: d.fixPatch(from: FixReadingView.current(item)))
        #expect(s.items.first?.overrides["evidence"] == .string("item_seen"))
        #expect(s.items.first?.identityConfirmedBy == "sender")
        #expect(s.result?.items[id]?.hits.contains { $0.ruleId == "DATA-UNSURE" } == false)
        // A fix that only changes a number is not a statement about what the item is.
        var n = ReadDraft.of(FixReadingView.current(s.items.first!))
        n.flags["liquid"] = true
        #expect(n.fixPatch(from: FixReadingView.current(s.items.first!)) == ["liquid": .bool(true)])
    }

    static let phone = BoxStoreTests.read(["itemName": .string("Phone"), "category": .string("phone"), "labelText": .string("3.85V 4000mAh 15.4Wh"),
                                           "volts": .number(3.85), "milliampHours": .number(4000), "wattHours": .number(15.4)])

    /// Only the fields the sender typed into are saved: a field they never touched is never saved, even when
    /// the reading moved under the form (a second look landed while it was open).
    @Test func aFixSavesOnlyTheFieldsTheSenderTypedInto() {
        var d = ReadDraft.of(Self.phone)
        d.flags["liquid"] = true
        let moved = SecondLookStoreTests.with(Self.phone, ["milliampHours": .number(40000), "wattHours": .number(154), "itemName": .string("Big phone")])
        #expect(d.fixPatch(from: moved) == ["liquid": .bool(true)])
    }

    /// A second look that moves the reading under the open form resets the fields it moved to the new reading,
    /// and they are no longer the sender's: no choice made against the old reading is saved. The moved fields
    /// the sender had edited are named.
    @Test func aReadingThatMovesUnderTheFormResetsTheFieldsItMoved() {
        var d = ReadDraft.of(Self.phone)
        for (f, typed) in [("volts", "3.85"), ("milliampHours", "4000"), ("wattHours", "15.4")] {
            d.numbers[f] = "1"
            d.numbers[f] = typed
        }
        d.flags["liquid"] = true
        let moved = SecondLookStoreTests.with(Self.phone, ["milliampHours": .number(40000), "wattHours": .number(154)])
        #expect(d.rebase(from: Self.phone, to: moved) == ["milliampHours", "wattHours"])
        #expect(d.numbers["milliampHours"] == "40000" && d.numbers["wattHours"] == "154" && d.numbers["volts"] == "3.85")
        #expect(d.fixPatch(from: moved) == ["volts": .number(3.85), "liquid": .bool(true)])
        #expect(ReadDraft.changedLine(["milliampHours", "wattHours"])
            == "The second look changed Milliamp-hours (mAh), Watt-hours (Wh). Check it again before you save.")
        #expect(ReadDraft.changedLine([]) == nil)
        // A moved field the sender had not edited is reset without a word.
        var quiet = ReadDraft.of(Self.phone)
        #expect(quiet.rebase(from: Self.phone, to: moved).isEmpty && quiet.numbers["wattHours"] == "154")
    }

    /// A reading counts as moved when its text changes in any way, even to another spelling of the same
    /// letters (an accent stored on its own), as the web compares: a label edit made against the old one is reset.
    @Test func aLabelRespelledByASecondLookCountsAsMoved() {
        let composed = SecondLookStoreTests.with(Self.phone, ["labelText": .string("CAF\u{00C9} FLAMMABLE BODY LOTION")])
        let decomposed = SecondLookStoreTests.with(Self.phone, ["labelText": .string("CAFE\u{0301} FLAMMABLE BODY LOTION")])
        #expect(composed == decomposed)
        #expect(FixReadingView.exactly(composed) != FixReadingView.exactly(decomposed))
        var d = ReadDraft.of(composed)
        d.labelText = "SHEA BODY LOTION 8 FL OZ"
        #expect(d.rebase(from: composed, to: decomposed) == ["labelText"])
        #expect(d.fixPatch(from: decomposed).isEmpty)
    }

    /// The same, through the store: numbers retyped against the first read, then a second look that reads
    /// other numbers, then Save. The retyped volts alone do not settle the battery dispute, so the larger
    /// reading still decides it, as on the web.
    @Test func numbersRetypedBeforeASecondLookMovedThemDoNotSettleIt() throws {
        let t = BoxStoreTests()
        let engine = try BoxStoreTests.bundledEngine()
        let s = try t.store(engine: engine)
        s.setDestination("CA")
        let big = SecondLookStoreTests.bigPhone
        let id = try #require(s.addRead(t.outcome(Self.phone, .onDevice), cropFile: nil))
        s.answer(id, question: "device_condition", answer: "new_sealed")
        s.answer(id, question: "cell_count", answer: "one")
        let opened = FixReadingView.current(s.items[0])
        var d = ReadDraft.of(opened)
        for (f, typed) in [("volts", "3.85"), ("milliampHours", "4000"), ("wattHours", "15.4")] {
            d.numbers[f] = "1"
            d.numbers[f] = typed
        }
        let m = try engine.mergeSecondLook(device: Self.phone, cloud: big)
        s.applySecondLook(id, merged: m.merged, ms: 900, reason: "reason", cloudLabel: "3.85V 40000mAh", disputes: m.disputes)
        let now = FixReadingView.current(s.items[0])
        _ = d.rebase(from: opened, to: now)
        s.applyFix(id, patch: d.fixPatch(from: now))
        #expect(s.items[0].disputes?["battery"]?["resolved"] == .bool(false))
        #expect(s.result?.items[id]?.level == "take_out")
    }

    /// A battery number the sender typed again as it was shown is theirs too; one typed back to empty is not.
    @Test func aBatteryNumberTypedAgainAsShownCounts() {
        var d = ReadDraft.of(Self.phone)
        d.numbers["milliampHours"] = "400"
        d.numbers["milliampHours"] = "4000"
        d.numbers["lithiumGrams"] = "5"
        d.numbers["lithiumGrams"] = ""
        #expect(d.fixPatch(from: Self.phone) == ["milliampHours": .number(4000)])
        // A cleared number the sender typed is saved as 0.
        d.numbers["wattHours"] = ""
        #expect(d.fixPatch(from: Self.phone) == ["milliampHours": .number(4000), "wattHours": .number(0)])
        // Nothing typed, nothing saved.
        #expect(ReadDraft.of(Self.phone).fixPatch(from: Self.phone).isEmpty)
    }
}
