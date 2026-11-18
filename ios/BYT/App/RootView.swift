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
        // As the host app of the unit tests it never touches the shared box.
        if ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] != nil { return AppModel() }
        return AppModel(remote: FirestoreBoxRemote())
    }

    var body: some View {
        NavigationStack { ReadyCheckView(model: model) }
            .task { await model.start() }
            .onChange(of: scenePhase) { _, phase in if phase == .active { model.becameActive() } }
            .onReceive(NotificationCenter.default.publisher(for: .NSCalendarDayChanged)) { _ in model.dayChanged() }
    }
}
