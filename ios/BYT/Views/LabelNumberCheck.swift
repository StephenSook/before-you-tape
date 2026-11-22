import BYTCore
import SwiftUI

/// Battery numbers read from a photo are held until the sender reads the label (USPS-INTL-LI-ONE-READ):
/// they type the Wh (or, for a lithium metal cell with no Wh, the lithium grams) into an empty field,
/// never a value filled in for them (the web app's LabelNumberCheck).
enum LabelNumber {
    /// Whether the card asks for the number: while the one-read rule holds the item's numbers.
    static func asked(_ verdict: ItemVerdict) -> Bool { verdict.hits.contains { $0.ruleId == "USPS-INTL-LI-ONE-READ" } }

    /// The number asked for, from the reading the card shows (the read with the sender's numbers on top).
    static func field(for current: JSONValue) -> String {
        if case let .number(wh)? = current["wattHours"], wh > 0 { return "wattHours" }
        return "lithiumGrams"
    }

    static func prompt(for field: String) -> String {
        field == "wattHours" ? "Type the Wh printed on the label" : "Type the lithium grams printed on the label"
    }

    /// The typed number when it can be checked: a finite number above 0, with a comma read as a decimal point.
    static func value(_ text: String) -> Double? {
        let t = text.trimmingCharacters(in: .whitespaces)
        guard let comma = t.firstIndex(of: ",") else { return usable(Double(t)) }
        return usable(Double(t.replacingCharacters(in: comma...comma, with: ".")))
    }

    private static func usable(_ n: Double?) -> Double? {
        guard let n, n.isFinite, n > 0 else { return nil }
        return n
    }
}

/// The field itself. The card keys it on the number it asks for, so a change of that number (a second look
/// that changes it) starts it again, empty.
struct LabelNumberCheckView: View {
    let field: String
    let onCheck: (String, Double) -> Void
    @State private var text = ""

    var body: some View {
        HStack {
            TextField(LabelNumber.prompt(for: field), text: $text)
                .keyboardType(.decimalPad)
                .accessibilityIdentifier("label-number")
            Button("Check the number") {
                guard let value = LabelNumber.value(text) else { return }
                onCheck(field, value)
                text = ""
            }
            .buttonStyle(.bordered)
            .disabled(LabelNumber.value(text) == nil)
        }
    }
}
