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
            .task {
                await model.start()
                #if DEBUG
                if UITestSupport.active, UITestSupport.secondLook { await UITestSupport.readPhotoForSecondLook(model) }
                if UITestSupport.active, UITestSupport.phoneRead { await UITestSupport.readPhotoOfAPhone(model) }
                #endif
            }
            .onChange(of: scenePhase) { _, phase in if phase == .active { model.becameActive() } }
            .onReceive(NotificationCenter.default.publisher(for: .NSCalendarDayChanged)) { _ in model.dayChanged() }
    }
}
