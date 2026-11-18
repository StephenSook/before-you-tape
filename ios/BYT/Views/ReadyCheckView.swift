import SwiftUI

/// What this iPhone can do before the sender starts: sign-in and the on-device model.
struct ReadyCheckView: View {
    let model: AppModel

    var body: some View {
        List {
            if let line = model.updateLine { Label(line, systemImage: "arrow.down.app").accessibilityIdentifier("update-line") }
            if let notice = model.editionNotice { Label(notice, systemImage: "exclamationmark.triangle").accessibilityIdentifier("edition-notice") }
            Label(model.signedIn ? "Signed in" : "Not signed in yet. Check the network.", systemImage: "person.badge.key")
            Label(ReadyCheck.modelLine(model.onDevice), systemImage: "iphone")
            Section {
                NavigationLink("Your box") { BoxView(model: model) }
                NavigationLink("Check an item") { CheckItemView(model: model) }
            }
        }
        .navigationTitle("Ready check")
    }
}
