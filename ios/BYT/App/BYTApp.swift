import FirebaseAppCheck
import FirebaseCore
import FirebaseFirestore
import SwiftUI

/// App Attest in release builds; the debug provider only in a debug build launched with -liveFirebase,
/// where the token comes from the scheme's FIRAAppCheckDebugToken environment variable (never a file).
/// Any other debug or test launch gets a provider that sends nothing, so App Check's own token fetch at
/// launch never reaches the live project either.
final class BYTAppCheckFactory: NSObject, AppCheckProviderFactory {
    private let live: LiveFirebase

    init(live: LiveFirebase = .thisLaunch) { self.live = live }

    func createProvider(with app: FirebaseApp) -> (any AppCheckProvider)? {
        #if DEBUG
        guard live.allowed else { return OfflineAppCheckProvider(live: live) }
        return AppCheckDebugProvider(app: app)
        #else
        return AppAttestProvider(app: app)
        #endif
    }
}

/// App Check's provider in a launch that may not call Firebase: every token request fails at once,
/// with no network call, and says so in the log.
final class OfflineAppCheckProvider: NSObject, AppCheckProvider {
    private let live: LiveFirebase

    init(live: LiveFirebase) { self.live = live }

    func getToken(completion handler: @escaping (AppCheckToken?, (any Error)?) -> Void) {
        live.skip("App Check token")
        handler(nil, NSError(domain: "app.beforeyoutape.reader.liveFirebase", code: 1,
                             userInfo: [NSLocalizedDescriptionKey: "Firebase network calls are off in this launch."]))
    }
}

@main
struct BYTApp: App {
    /// False in a build without usable Firebase settings: nothing that needs Firebase starts.
    private let configured: Bool

    init() {
        AppCheck.setAppCheckProviderFactory(BYTAppCheckFactory())
        configured = FirebaseSetup.configure()
        guard configured else { return }
        // The box keeps working offline; writes wait in the cache until the network returns.
        let settings = FirestoreSettings()
        settings.cacheSettings = PersistentCacheSettings(sizeBytes: FirestoreCacheSizeUnlimited as NSNumber)
        Firestore.firestore().settings = settings
    }

    var body: some Scene {
        WindowGroup {
            if configured { RootView() } else { MissingSettingsView() }
        }
    }
}
