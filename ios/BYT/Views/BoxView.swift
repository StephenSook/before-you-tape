import SwiftUI

/// The box: where it goes, the summary, and every item with its verdict.
struct BoxView: View {
    let model: AppModel
    @State private var typing = false

    var body: some View {
        List {
            if let box = model.box {
                Section { DestinationPicker(destinations: model.destinations, box: box) }
                Section("Your box") {
                    BoxSummaryView(box: box)
                    SaveProblemRow(box: box)
                    #if DEBUG
                    if UITestSupport.active {
                        // UI tests read the count of model calls here; release builds have no such line.
                        Text("Model calls: \(UITestSupport.calls.value)").font(.caption).accessibilityIdentifier("ui-test-model-calls")
                    }
                    #endif
                }
                ForEach(Self.rows(items: box.items, result: box.result)) { row in
                    if let verdict = row.verdict {
                        ItemCardView(item: row.item, verdict: verdict, box: box)
                    } else {
                        UncheckedItemRow(item: row.item, box: box)
                    }
                }
                .onDelete { rows in rows.map { box.items[$0].itemId }.forEach(box.remove) }
            } else {
                Text("The rules could not load. Reinstall the app.")
            }
        }
        .navigationTitle("Your box")
        .toolbar {
            NavigationLink("Check an item") { CheckItemView(model: model) }
            Button("Type it") { typing = true }.disabled(model.box == nil)
        }
        .sheet(isPresented: $typing) { if let box = model.box { TypedEntryView(box: box) } }
    }
}

extension BoxView {
    struct Row: Identifiable {
        let item: BoxItem
        let verdict: ItemVerdict?
        var id: String { item.itemId }
    }

    /// Every item gets a row, with its verdict when the rules could check it: an item the rules
    /// refuse must stay on screen so the sender can fix or remove it.
    static func rows(items: [BoxItem], result: BoxResult?) -> [Row] {
        items.map { Row(item: $0, verdict: result?.items[$0.itemId]) }
    }
}

/// An item the rules could not check (for example a label too long to read): fix it or remove it.
private struct UncheckedItemRow: View {
    let item: BoxItem
    let box: BoxStore
    @State private var fixing = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(FixReadingView.current(item).text("itemName") ?? "This item").font(.title3.weight(.semibold))
            Text("This item could not be checked. Fix it or remove it.")
            HStack {
                Button("Fix this reading") { fixing = true }.buttonStyle(.bordered)
                Button("Remove", role: .destructive) { box.remove(item.itemId) }.buttonStyle(.bordered)
            }
        }
        .padding(.vertical, 6)
        .sheet(isPresented: $fixing) { FixReadingView(item: item, box: box) }
    }
}
