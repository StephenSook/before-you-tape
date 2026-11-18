import Foundation

/// The Remote Config values the iPhone reads. Model names come only from here. The defaults must
/// equal the defaults in remoteconfig.template.json (a test reads the file and checks).
struct RemoteConfigValues: Equatable, Sendable {
    var cloudModelItem: String
    var cloudModelItemFallback: String
    var cloudModelText: String
    var killCloud: Bool
    var minimumVersionIOS: String

    static let defaults = RemoteConfigValues(cloudModelItem: "gemini-3.5-flash-lite", cloudModelItemFallback: "gemini-3.8-flash",
                                             cloudModelText: "gemini-3.5-flash-lite", killCloud: false, minimumVersionIOS: "0.0.0")

    var asStrings: [String: String] {
        ["cloud_model_item": cloudModelItem, "cloud_model_item_fallback": cloudModelItemFallback,
         "cloud_model_text": cloudModelText, "kill_cloud": String(killCloud), "minimum_version_ios": minimumVersionIOS]
    }
}
