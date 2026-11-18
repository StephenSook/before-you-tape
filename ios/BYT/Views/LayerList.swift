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

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(question.text)
            ForEach(question.answers, id: \.id) { a in
                Button(a.label) { onAnswer(a.id) }
                    .buttonStyle(.bordered)
                    .tint(value == a.id ? .accentColor : .secondary)
                    .accessibilityAddTraits(value == a.id ? .isSelected : [])
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("question-row")
    }
}
