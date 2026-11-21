import SwiftUI

/// What was checked for this item: the four rule layers, each with its state and date.
struct LayerList: View {
    let layers: [LayerStatus]

    static func row(_ l: LayerStatus) -> String {
        let state = ["checked": "checked", "stale": "out of date", "missing": "not loaded"][l.state] ?? l.state
        return "\(l.label): \(state)" + (l.checkedOn.map { ", \($0)" } ?? "")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(layers, id: \.id) { Text(Self.row($0)) }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("layer-list")
    }
}

/// One question a clerk would ask, with its answers as buttons.
struct QuestionRow: View {
    let question: Question
    let value: String?
    let onAnswer: (String) -> Void

    /// An answer not chosen yet is open: outlined, and as tappable to the eye as any other button
    /// (grey read as switched off). The chosen answer is filled.
    enum Look: Equatable { case open, chosen }

    static func look(_ answer: String, value: String?) -> Look { value == answer ? .chosen : .open }
    static func tint(_ look: Look) -> Color { .accentColor }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(question.text)
            ForEach(question.answers, id: \.id) { a in
                let look = Self.look(a.id, value: value)
                Group {
                    if look == .chosen {
                        Button(a.label) { onAnswer(a.id) }.buttonStyle(.borderedProminent)
                    } else {
                        Button(a.label) { onAnswer(a.id) }.buttonStyle(.bordered)
                    }
                }
                .tint(Self.tint(look))
                .accessibilityAddTraits(look == .chosen ? .isSelected : [])
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("question-row")
    }
}
