import SwiftUI

struct RootView: View {
    @State private var model = AppModel()

    var body: some View {
        NavigationStack { ReadyCheckView(model: model) }
            .task { await model.start() }
    }
}
