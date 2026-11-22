import SwiftUI

struct RootView: View {
    @State private var model = RootView.makeModel()
    @Environment(\.scenePhase) private var scenePhase

    static func makeModel() -> AppModel {
        #if DEBUG
        if UITestSupport.active {
            // A UI test calls no Firebase service, Remote Config included, so it runs on the shipped
            // defaults with the cloud open: its cloud reader is a fixed one that sends nothing.
            return AppModel(onDeviceStatus: { UITestSupport.onDevice }, persistence: UITestSupport.MemoryBox(), reader: UITestSupport.reader(),
                            config: .defaults)
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
