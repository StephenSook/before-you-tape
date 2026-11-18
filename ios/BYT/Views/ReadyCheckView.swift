import SwiftUI

/// What this iPhone can do before the sender starts: sign-in and the on-device model.
struct ReadyCheckView: View {
    let model: AppModel

    var body: some View {
        List {
            Label(model.signedIn ? "Signed in" : "Not signed in yet. Check the network.", systemImage: "person.badge.key")
            Label(ReadyCheck.modelLine(model.onDevice), systemImage: "iphone")
        }
        .navigationTitle("Ready check")
    }
}
