import FirebaseRemoteConfig
import Foundation

/// Fetches Remote Config at start and listens for real-time updates, so a new model name, the
/// kill switch, a raised minimum version or a new rule edition reaches the iPhone with no restart.
/// Offline, the last activated values (or the built-in defaults) stay in force.
@MainActor
final class RemoteConfigLoader {
    private lazy var remoteConfig = RemoteConfig.remoteConfig()
    private var registration: ConfigUpdateListenerRegistration?
    private let live: LiveFirebase
    var onChange: ((RemoteConfigValues) -> Void)?

    init(live: LiveFirebase = .thisLaunch) { self.live = live }

    /// In a launch that may not call Firebase, nothing is fetched and the values the app started with
    /// stay in force.
    func start() {
        guard live.allowed else {
            live.skip("Remote Config fetch")
            return
        }
        guard registration == nil else { return }
        remoteConfig.setDefaults(RemoteConfigValues.defaults.asStrings.mapValues { $0 as NSString })
        publish()
        Task {
            _ = try? await remoteConfig.fetchAndActivate()
            publish()
        }
        registration = remoteConfig.addOnConfigUpdateListener { [weak self] _, error in
            guard error == nil else { return }
            Task { @MainActor in
                guard let self else { return }
                _ = try? await self.remoteConfig.activate()
                self.publish()
            }
        }
    }

    /// The values in force. Cloud checks stay held until kill_cloud comes from the server (fetched now
    /// or fetched before and kept): a failed or blocked first fetch never opens them on the default.
    var current: RemoteConfigValues {
        let keys = Array(RemoteConfigValues.defaults.asStrings.keys)
        let read = RemoteConfigValues.parse(Dictionary(uniqueKeysWithValues: keys.map { ($0, remoteConfig.configValue(forKey: $0).stringValue) }))
        return RemoteConfigValues.effective(read, killCloudFromServer: remoteConfig.configValue(forKey: "kill_cloud").source == .remote)
    }

    private func publish() { onChange?(current) }
}
