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
                        let id = row.item.itemId
                        ItemCardView(item: row.item, verdict: verdict, box: box,
                                     checkingAgain: model.isCheckingAgain(id), lookError: model.secondLookError(id),
                                     onRetryLook: { model.retrySecondLook(id) },
                                     onOfferLook: model.isLookOffered(id) ? { model.checkInTheCloud(id) } : nil)
                    } else {
                        UncheckedItemRow(item: row.item, box: box, remove: model.remove)
                    }
                }
                // Through the model, so a removed item's second look is cancelled and its crop forgotten.
                .onDelete { rows in rows.map { box.items[$0].itemId }.forEach(model.remove) }
            } else {
                Text(model.rulesProblem ?? AppModel.rulesFailed)
            }
        }
        .navigationTitle("Your box")
        .toolbar {
            NavigationLink("Check an item") { CheckItemView(model: model) }
            Button("Type it") { typing = true }.disabled(model.box == nil)
        }
        .sheet(isPresented: $typing) { if let box = model.box { TypedEntryView(box: box) } }
        // The cloud question asked by a card's "Check it in the cloud", with the crop that would be sent.
        .sheet(isPresented: Binding(get: { model.askingConsent && model.lookAwaitingConsent != nil }, set: { _ in })) {
            ConsentSheet(crop: model.pendingCrop) { allow in Task { await model.answerConsent(allow) } }
        }
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
    /// The model's removal, which also cancels the item's second look.
    let remove: (String) -> Void
    @State private var fixing = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(FixReadingView.current(item).text("itemName") ?? "This item").font(.title3.weight(.semibold))
            Text("This item could not be checked. Fix it or remove it.")
            HStack {
                Button("Fix this reading") { fixing = true }.buttonStyle(.bordered)
                Button("Remove", role: .destructive) { remove(item.itemId) }.buttonStyle(.bordered)
            }
        }
        .padding(.vertical, 6)
        .sheet(isPresented: $fixing) { FixReadingView(item: item, box: box) }
    }
}
