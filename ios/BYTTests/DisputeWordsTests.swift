import BYTCore
import Foundation
import Testing
@testable import BYT

/// The dispute picker's words and its confirm rule are the web app's (src/ui/ItemCard.tsx).
@MainActor
@Suite struct DisputeWordsTests {
    func web() throws -> String {
        try String(contentsOf: BoxStoreTests.repo.appendingPathComponent("src/ui/ItemCard.tsx"), encoding: .utf8)
    }

    @Test func everyFieldHasTheWebAppsLabel() throws {
        let web = try web()
        #expect(DisputeWords.labels.count == 13 && Set(DisputeWords.labels.keys) == Set(BoxStore.disputeFields))
        for (field, label) in DisputeWords.labels { #expect(web.contains("\(field): \"\(label)\""), "\(field)") }
        for (value, text) in DisputeWords.boxText { #expect(web.contains("\(value): \"\(text)\""), "\(value)") }
        for (value, text) in DisputeWords.evidenceText { #expect(web.contains("\(value): \"\(text)\""), "\(value)") }
        #expect(web.contains("const SIDE_NAME = { device: \"\(DisputeWords.sideName(.device))\", cloud: \"\(DisputeWords.sideName(.cloud))\" }"))
    }

    /// The card's own sentences for a second look and a dispute are the web app's.
    @Test func theCardsSentencesAreTheWebAppsWords() throws {
        let web = try web()
        for text in [DisputeWords.checkingAgain, DisputeWords.disagree, DisputeWords.keepBoth, DisputeWords.tryAgain] {
            #expect(web.contains(text), "\(text)")
        }
        #expect(DisputeWords.choice(.device, "Power bank") == "First read: Power bank")
        #expect(DisputeWords.choice(.cloud, "Phone") == "Second look: Phone")
        #expect(web.contains("First read: {readingText(f, d.device)}") && web.contains("Second look: {readingText(f, d.cloud)}"))
        #expect(DisputeWords.confirm(otherSide: .cloud, otherSaw: "liquid", picked: "Not seen")
                == "The second look saw liquid. Use Not seen only if the item really shows that.")
        #expect(web.contains("The {SIDE_NAME[other]} saw {otherSaw}. Use {picked} only if the item really shows that."))
        #expect(DisputeWords.use("Not seen") == "Yes, use Not seen" && web.contains("Yes, use {picked}"))
    }

    @Test func eachReadingIsSaidInPlainWords() {
        #expect(DisputeWords.reading("category", .string("power_bank")) == "Power bank")
        #expect(DisputeWords.reading("retailBox", .string("open_or_none")) == "Open or no box")
        #expect(DisputeWords.reading("evidence", .string("item_seen")) == "Saw the item only")
        let battery: JSONValue = .object(["volts": .number(3.7), "milliampHours": .number(5000), "wattHours": .number(18.5)])
        #expect(DisputeWords.reading("battery", battery) == "3.7 V, 5000 mAh, 18.5 Wh")
        #expect(DisputeWords.reading("battery", .object(["volts": .number(0), "milliampHours": .number(0), "wattHours": .number(0)])) == "No numbers read")
        #expect(DisputeWords.reading("lithiumGrams", .number(2.5)) == "2.5 g lithium")
        #expect(DisputeWords.reading("lithiumGrams", .number(0)) == "No lithium amount read")
        #expect(DisputeWords.reading("labelTags", .array([.string("label_text"), .string("flammable"), .string("power_bank")])) == "flammable, power bank")
        #expect(DisputeWords.reading("labelTags", .array([.string("label_text")])) == "No warning words read")
        #expect(DisputeWords.reading("liquid", .bool(true)) == "Yes" && DisputeWords.reading("liquid", .bool(false)) == "Not seen")
    }

    /// A pick that drops what the other read saw (a lithium amount, battery numbers, a hazard flag or a
    /// label word) asks the sender to confirm first.
    @Test func aPickThatDropsWhatTheOtherReadSawAsksFirst() {
        #expect(DisputeWords.dropsWhatOtherSaw("lithiumGrams", picked: .number(0), other: .number(2.5)))
        #expect(!DisputeWords.dropsWhatOtherSaw("lithiumGrams", picked: .number(2.5), other: .number(0)))
        let none: JSONValue = .object(["volts": .number(0), "milliampHours": .number(0), "wattHours": .number(0)])
        let some: JSONValue = .object(["volts": .number(3.7), "milliampHours": .number(0), "wattHours": .number(0)])
        #expect(DisputeWords.dropsWhatOtherSaw("battery", picked: none, other: some) && !DisputeWords.dropsWhatOtherSaw("battery", picked: some, other: none))
        #expect(DisputeWords.dropsWhatOtherSaw("labelTags", picked: .array([.string("label_text")]), other: .array([.string("label_text"), .string("flammable")])))
        #expect(!DisputeWords.dropsWhatOtherSaw("labelTags", picked: .array([.string("flammable")]), other: .array([.string("label_text")])))
        #expect(DisputeWords.dropsWhatOtherSaw("liquid", picked: .bool(false), other: .bool(true)))
        #expect(!DisputeWords.dropsWhatOtherSaw("liquid", picked: .bool(true), other: .bool(false)))
        #expect(!DisputeWords.dropsWhatOtherSaw("category", picked: .string("phone"), other: .string("power_bank")))
    }

    /// Open disputes, in the web app's field order; settled ones are left out.
    @Test func openDisputesAreListedInOrder() {
        let disputes: JSONValue = .object([
            "evidence": .object(["device": .string("not_sure"), "cloud": .string("label_read"), "resolved": .bool(false)]),
            "category": .object(["device": .string("power_bank"), "cloud": .string("phone"), "resolved": .bool(false)]),
            "liquid": .object(["device": .bool(true), "cloud": .bool(false), "resolved": .bool(true)]),
        ])
        #expect(DisputeWords.open(disputes) == ["category", "evidence"])
        #expect(DisputeWords.open(nil).isEmpty)
    }
}
