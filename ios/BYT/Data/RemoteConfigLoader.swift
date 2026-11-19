import FirebaseRemoteConfig
import Foundation

/// Fetches Remote Config at start and listens for real-time updates, so a new model name, the
/// kill switch, a raised minimum version or a new rule edition reaches the iPhone with no restart.
/// Offline, the last activated values (or the built-in defaults) stay in force.
@MainActor
final class RemoteConfigLoader {
    private lazy var remoteConfig = RemoteConfig.remoteConfig()
    private var registration: ConfigUpdateListenerRegistration?
    var onChange: ((RemoteConfigValues) -> Void)?

    func start() {
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

    var current: RemoteConfigValues {
        let keys = Array(RemoteConfigValues.defaults.asStrings.keys)
        return RemoteConfigValues.parse(Dictionary(uniqueKeysWithValues: keys.map { ($0, remoteConfig.configValue(forKey: $0).stringValue) }))
    }

    private func publish() { onChange?(current) }
}
