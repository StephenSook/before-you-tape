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
        #expect(pairs.count == 37)
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
}
