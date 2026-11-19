import FirebaseCore
import SwiftUI

/// The Firebase settings file this build carries. FirebaseApp.configure() raises when the file is
/// missing, and Auth and Firestore raise later on a file without an API key or project ID, so a copy
/// built without usable settings (a fresh clone) shows a plain screen instead of crashing.
enum FirebaseSetup {
    static let missing = "This copy of the app was built without its Firebase settings file, so it cannot start. Add GoogleService-Info.plist to ios/BYT/Config and build again."

    /// True when the settings hold every field Firebase needs.
    static func usable(_ options: FirebaseOptions?) -> Bool {
        guard let options else { return false }
        return ![options.googleAppID, options.gcmSenderID, options.apiKey ?? "", options.projectID ?? ""]
            .contains(where: \.isEmpty)
    }

    /// Configures Firebase from the bundled settings file; false, with nothing configured, when the
    /// file is missing or incomplete.
    static func configure() -> Bool {
        guard usable(FirebaseOptions.defaultOptions()) else { return false }
        FirebaseApp.configure()
        return true
    }
}

/// Shown instead of the app when this build has no usable Firebase settings.
struct MissingSettingsView: View {
    var body: some View {
        Text(FirebaseSetup.missing)
            .font(.title3.weight(.semibold))
            .padding(24)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}
