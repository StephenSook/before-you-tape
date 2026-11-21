import BYTCore
import SwiftUI

/// The words and the confirm rule of the dispute picker, the web app's (src/ui/ItemCard.tsx).
enum DisputeWords {
    static let labels: [String: String] = [
        "category": "What it is", "retailBox": "Its box", "battery": "Battery numbers", "lithiumGrams": "Lithium metal",
        "batteryWords": "Battery words", "liquid": "Liquid", "pressurized": "Under pressure", "alcoholOnLabel": "Alcohol on the label",
        "flammableOnLabel": "Flammable on the label", "glassContainer": "Glass container", "powder": "Powder", "labelTags": "Label words",
        "evidence": "How it was read",
    ]
    static let evidenceText = ["label_read": "Read its label", "item_seen": "Saw the item only", "not_sure": "Not sure what it is"]
    static let boxText = ["sealed": "Sealed", "open_or_none": "Open or no box", "cannot_tell": "Can't tell"]
    static let flagFields = ["batteryWords", "liquid", "pressurized", "alcoholOnLabel", "flammableOnLabel", "glassContainer", "powder"]

    static let checkingAgain = "Checking again in the cloud."
    static let disagree = "The two reads disagree. Pick what the item shows."
    static let keepBoth = "Keep both for now"
    static let tryAgain = "Try again"

    static func sideName(_ side: DisputeSide) -> String { side == .device ? "first read" : "second look" }
    static func choice(_ side: DisputeSide, _ reading: String) -> String { (side == .device ? "First read: " : "Second look: ") + reading }
    static func confirm(otherSide: DisputeSide, otherSaw: String, picked: String) -> String {
        "The \(sideName(otherSide)) saw \(otherSaw). Use \(picked) only if the item really shows that."
    }
    static func use(_ picked: String) -> String { "Yes, use \(picked)" }

    /// The disputes the sender has not settled, in the web app's field order.
    static func open(_ disputes: JSONValue?) -> [String] {
        BoxStore.disputeFields.filter { field in
            guard let d = disputes?[field] else { return false }
            return d["resolved"] != .bool(true)
        }
    }

    /// A number as the web app writes it: no ".0" on a whole number.
    static func number(_ d: Double) -> String { d == d.rounded() && abs(d) < 1e15 ? String(Int(d)) : String(d) }

    private static func num(_ v: JSONValue?) -> Double { if case let .number(n)? = v { n } else { 0 } }
    private static func strings(_ v: JSONValue?) -> [String] {
        if case let .array(a)? = v { a.compactMap { if case let .string(s) = $0 { s } else { nil } } } else { [] }
    }
    /// The label words that can change a verdict: every tag but the one that only says a label was read.
    private static func words(_ v: JSONValue?) -> [String] { strings(v).filter { $0 != "label_text" } }

    /// One read's value of a disputed fact, in plain words. A zero or empty reading says only that nothing
    /// was read, never that nothing is there.
    static func reading(_ field: String, _ value: JSONValue?) -> String {
        let text: String? = if case let .string(s)? = value { s } else { nil }
        switch field {
        case "category": return ReadDraft.categories.first { $0.id == text }?.label ?? text ?? ""
        case "retailBox": return boxText[text ?? ""] ?? text ?? ""
        case "evidence": return evidenceText[text ?? ""] ?? text ?? ""
        case "battery":
            let parts = [("volts", "V"), ("milliampHours", "mAh"), ("wattHours", "Wh")].compactMap { key, unit in
                num(value?[key]) > 0 ? "\(number(num(value?[key]))) \(unit)" : nil
            }
            return parts.isEmpty ? "No numbers read" : parts.joined(separator: ", ")
        case "lithiumGrams": return num(value) > 0 ? "\(number(num(value))) g lithium" : "No lithium amount read"
        case "labelTags":
            let w = words(value).map { $0.replacingOccurrences(of: "_", with: " ") }
            return w.isEmpty ? "No warning words read" : w.joined(separator: ", ")
        default: return value == .bool(true) ? "Yes" : "Not seen"
        }
    }

    /// Whether picking one reading drops something the other read saw: a lithium amount, battery numbers,
    /// a hazard flag or a label word. Such a pick asks the sender to confirm first.
    static func dropsWhatOtherSaw(_ field: String, picked: JSONValue?, other: JSONValue?) -> Bool {
        switch field {
        case "lithiumGrams": return num(picked) == 0 && num(other) > 0
        case "battery":
            let keys = ["volts", "milliampHours", "wattHours"]
            return keys.allSatisfy { num(picked?[$0]) == 0 } && keys.contains { num(other?[$0]) > 0 }
        case "labelTags":
            let mine = strings(picked)
            return words(other).contains { !mine.contains($0) }
        default:
            return flagFields.contains(field) && picked == .bool(false) && other == .bool(true)
        }
    }
}

/// The facts the two reads disagree on, each with both readings to pick from; a pick that drops what
/// the other read saw is confirmed first.
struct DisputePicker: View {
    let item: BoxItem
    let onSettle: (String, DisputeSide) -> Void
    @State private var asking: String?
    @State private var askingSide: DisputeSide = .device

    var body: some View {
        let open = DisputeWords.open(item.disputes)
        if !open.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text(DisputeWords.disagree)
                ForEach(open, id: \.self) { field in row(field) }
            }
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("disputes")
        }
    }

    private func value(_ field: String, _ side: DisputeSide) -> JSONValue? { item.disputes?[field]?[side.rawValue] }

    private func pick(_ field: String, _ side: DisputeSide) {
        let other: DisputeSide = side == .device ? .cloud : .device
        if DisputeWords.dropsWhatOtherSaw(field, picked: value(field, side), other: value(field, other)) {
            asking = field
            askingSide = side
        } else {
            asking = nil
            onSettle(field, side)
        }
    }

    @ViewBuilder private func row(_ field: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(DisputeWords.labels[field] ?? field).font(.headline)
            ForEach([DisputeSide.device, .cloud], id: \.self) { side in
                Button(DisputeWords.choice(side, DisputeWords.reading(field, value(field, side)))) { pick(field, side) }
                    .buttonStyle(.bordered)
            }
            if asking == field {
                let other: DisputeSide = askingSide == .device ? .cloud : .device
                let picked = DisputeWords.reading(field, value(field, askingSide))
                let otherSaw = DisputeWords.flagFields.contains(field) ? (DisputeWords.labels[field] ?? field).lowercased()
                    : DisputeWords.reading(field, value(field, other))
                Text(DisputeWords.confirm(otherSide: other, otherSaw: otherSaw, picked: picked))
                Button(DisputeWords.use(picked)) { asking = nil; onSettle(field, askingSide) }.buttonStyle(.bordered)
                Button(DisputeWords.keepBoth) { asking = nil }.buttonStyle(.borderless)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(DisputeWords.labels[field] ?? field)
    }
}
