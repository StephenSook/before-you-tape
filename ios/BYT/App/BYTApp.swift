import FirebaseAppCheck
import FirebaseCore
import FirebaseFirestore
import SwiftUI

/// App Attest in release builds; the debug provider only in local debug builds, where the token
/// comes from the scheme's FIRAAppCheckDebugToken environment variable (never a file).
final class BYTAppCheckFactory: NSObject, AppCheckProviderFactory {
    func createProvider(with app: FirebaseApp) -> (any AppCheckProvider)? {
        #if DEBUG
        return AppCheckDebugProvider(app: app)
        #else
        return AppAttestProvider(app: app)
        #endif
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
