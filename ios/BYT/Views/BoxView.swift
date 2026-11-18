import SwiftUI

/// The box: where it goes, the summary, and every item with its verdict.
struct BoxView: View {
    let model: AppModel

    var body: some View {
        List {
            if let box = model.box {
                Section { DestinationPicker(destinations: model.destinations, box: box) }
                Section("Your box") { BoxSummaryView(box: box) }
                ForEach(box.items) { item in
                    if let verdict = box.result?.items[item.itemId] {
                        ItemCardView(item: item, verdict: verdict, box: box)
                    }
                }
                .onDelete { rows in rows.map { box.items[$0].itemId }.forEach(box.remove) }
            } else {
                Text("The rules could not load. Reinstall the app.")
            }
        }
        .navigationTitle("Your box")
        .toolbar { NavigationLink("Check an item") { CheckItemView(model: model) } }
    }
}
