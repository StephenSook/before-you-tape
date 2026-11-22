import BYTCore
import Foundation
import Testing
@testable import BYT

/// The item card's label-number field (the web app's LabelNumberCheck): asked for while a model's numbers
/// are held (USPS-INTL-LI-ONE-READ), the Wh when one is shown, else the lithium grams, always empty.
@MainActor
@Suite struct LabelNumberCheckTests {
    static func hit(_ ruleId: String) -> RuleHit { RuleHit(ruleId: ruleId, layer: "carrier", level: "check", text: "t", section: "s", url: "u") }
    static func verdict(_ ids: [String]) -> ItemVerdict {
        ItemVerdict(level: "check", headline: "Check this", hits: ids.map(hit), question: nil, layers: [], service: nil)
    }

    @Test func itIsAskedOnlyWhileTheOneReadRuleHoldsTheNumbers() {
        #expect(LabelNumber.asked(Self.verdict(["DATA-LABEL-NUMBERS", "USPS-INTL-LI-ONE-READ"])))
        #expect(!LabelNumber.asked(Self.verdict(["DATA-LABEL-NUMBERS"])))
        #expect(!LabelNumber.asked(Self.verdict([])))
    }

    @Test func itAsksForTheWhShownElseTheLithiumGrams() {
        #expect(LabelNumber.field(for: .object(["wattHours": .number(15.4), "lithiumGrams": .number(0.1)])) == "wattHours")
        #expect(LabelNumber.field(for: .object(["wattHours": .number(0), "lithiumGrams": .number(0.1)])) == "lithiumGrams")
        #expect(LabelNumber.field(for: .object([:])) == "lithiumGrams")
        #expect(LabelNumber.prompt(for: "wattHours") == "Type the Wh printed on the label")
        #expect(LabelNumber.prompt(for: "lithiumGrams") == "Type the lithium grams printed on the label")
    }

    /// The reading the card shows is the read with the sender's own numbers on top.
    @Test func itAsksAboutTheNumbersShownWithTheSendersOnTop() {
        let item = BoxItem(itemId: "a", read: .object(["wattHours": .number(15.4)]), overrides: ["wattHours": .number(0), "lithiumGrams": .number(1)],
                           readSource: "phone_on_device", readMs: 1)
        #expect(LabelNumber.field(for: FixReadingView.current(item)) == "lithiumGrams")
    }

    @Test func aNumberAboveZeroCanBeCheckedAndACommaIsADecimalPoint() {
        #expect(LabelNumber.value("15.4") == 15.4)
        #expect(LabelNumber.value(" 15,4 ") == 15.4)
        #expect(LabelNumber.value(".5") == 0.5)
        for bad in ["", "  ", "0", "-3", "abc", "inf", "nan", "1,2,3"] { #expect(LabelNumber.value(bad) == nil, "\(bad)") }
    }
}
