import Foundation
import Observation

/// The iPhone client's state.
@MainActor
@Observable
final class AppModel {
    let signIn: SignIn
    private(set) var signedIn = false
    private(set) var onDevice: OnDeviceStatus

    init(signIn: SignIn = .firebase(), onDevice: OnDeviceStatus = ModelSessionFactory.onDeviceStatus()) {
        self.signIn = signIn
        self.onDevice = onDevice
    }

    func start() async {
        signedIn = await signIn.ensure()
        onDevice = ModelSessionFactory.onDeviceStatus()
    }
}
