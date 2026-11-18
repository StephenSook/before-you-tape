import SwiftUI

struct RootView: View {
    @State private var model = RootView.makeModel()
    @Environment(\.scenePhase) private var scenePhase

    static func makeModel() -> AppModel {
        #if DEBUG
        if UITestSupport.active {
            return AppModel(onDeviceStatus: { UITestSupport.onDevice }, persistence: UITestSupport.MemoryBox(), reader: UITestSupport.reader())
        }
        #endif
        return AppModel()
    }

    var body: some View {
        NavigationStack { ReadyCheckView(model: model) }
            .task { await model.start() }
            .onChange(of: scenePhase) { _, phase in if phase == .active { model.becameActive() } }
    }
}
