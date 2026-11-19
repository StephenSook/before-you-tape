import Foundation
import Network
import Observation

/// Whether the iPhone has a network path, as the read router needs it.
@MainActor
@Observable
final class NetworkStatus {
    private(set) var online = false
    @ObservationIgnored private let monitor = NWPathMonitor()
    @ObservationIgnored private var started = false
    /// Called when the network comes back after being away.
    @ObservationIgnored var onReconnect: (() -> Void)?

    func start() {
        guard !started else { return }
        started = true
        monitor.pathUpdateHandler = { [weak self] path in
            let satisfied = path.status == .satisfied
            Task { @MainActor in self?.pathChanged(satisfied: satisfied) }
        }
        monitor.start(queue: DispatchQueue(label: "app.beforeyoutape.network"))
    }

    /// The OS reported a new network path.
    func pathChanged(satisfied: Bool) {
        let wasOnline = online
        online = satisfied
        if satisfied, !wasOnline { onReconnect?() }
    }
}
