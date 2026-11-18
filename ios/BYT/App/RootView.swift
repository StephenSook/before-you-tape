import SwiftUI

struct RootView: View {
    @State private var model = RootView.makeModel()

    static func makeModel() -> AppModel {
        #if DEBUG
        if UITestSupport.active {
            return AppModel(onDevice: UITestSupport.onDevice, persistence: UITestSupport.MemoryBox(), reader: UITestSupport.reader())
        }
        #endif
        return AppModel()
    }

    var body: some View {
        NavigationStack { ReadyCheckView(model: model) }
            .task { await model.start() }
    }
}
