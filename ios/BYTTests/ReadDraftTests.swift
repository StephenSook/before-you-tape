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
}
