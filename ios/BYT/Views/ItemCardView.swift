import BYTCore
import SwiftUI

/// One item: its name, the verdict, the first reason, where it was read, the clerk's question, and
/// what was checked folded away under "What we checked".
struct ItemCardView: View {
    let item: BoxItem
    let verdict: ItemVerdict
    let box: BoxStore
    @State private var fixing = false

    private var name: String {
        if case let .string(n)? = item.overrides["itemName"] ?? item.read["itemName"], !n.isEmpty { return n }
        return "This item"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(item.quantity > 1 ? "\(name) x \(item.quantity)" : name).font(.title3.weight(.semibold))
            VerdictChip(level: verdict.level)
            if let reason = verdict.hits.first?.text { Text(reason) }
            SourceGlyph(source: item.readSource)
            if let q = verdict.question {
                QuestionRow(question: q, value: item.answers[q.id]) { box.answer(item.itemId, question: q.id, answer: $0) }
            }
            if verdict.hits.contains(where: { $0.ruleId == "DATA-IDENTITY" }) {
                Button("Yes, this is \(name)") { box.confirmIdentity(item.itemId) }
                    .buttonStyle(.bordered)
                    .accessibilityIdentifier("confirm-identity")
            }
            Button("Fix this reading") { fixing = true }
                .buttonStyle(.borderless)
            DisclosureGroup("What we checked") { LayerList(layers: verdict.layers) }
        }
        .padding(.vertical, 6)
        .sheet(isPresented: $fixing) { FixReadingView(item: item, box: box) }
    }
}
