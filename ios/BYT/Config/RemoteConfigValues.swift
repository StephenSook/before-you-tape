import Foundation

/// The Remote Config values the iPhone reads, read the way the web app reads them
/// (src/config/remoteConfig.ts): a value that is empty, unknown or malformed keeps the default.
/// The defaults must equal remoteconfig.template.json (a test reads the file and checks).
struct RemoteConfigValues: Equatable, Sendable {
    var cloudModelItem: String
    /// Empty turns the fallback model off.
    var cloudModelItemFallback: String
    var cloudModelText: String
    var killCloud: Bool
    var minimumVersionIOS: String
    /// The second-look policy as JSON with all five reasons, in a fixed order.
    var secondLookPolicyJSON: String
    /// A newer rule edition to use, by id and SHA-256; both empty means the built-in edition.
    var rulesEditionId: String
    var rulesEditionSha256: String

    /// The cloud models this app may send to Firebase AI Logic: the web app's list (src/config/models.ts).
    static let allowedCloudModels = ["gemini-3.5-flash-lite", "gemini-3.8-flash"]
    static let policyKeys = ["whMismatch", "batteryNumbers", "notSure", "hazardNoLabel", "identity"]

    static let defaults = RemoteConfigValues(
        cloudModelItem: "gemini-3.5-flash-lite", cloudModelItemFallback: "gemini-3.8-flash", cloudModelText: "gemini-3.5-flash-lite",
        killCloud: false, minimumVersionIOS: "0.0.0",
        secondLookPolicyJSON: #"{"whMismatch":true,"batteryNumbers":true,"notSure":true,"hazardNoLabel":true,"identity":true}"#,
        rulesEditionId: "", rulesEditionSha256: "")

    var asStrings: [String: String] {
        ["cloud_model_item": cloudModelItem, "cloud_model_item_fallback": cloudModelItemFallback,
         "cloud_model_text": cloudModelText, "kill_cloud": String(killCloud), "minimum_version_ios": minimumVersionIOS,
         "second_look_policy_json": secondLookPolicyJSON, "rules_edition_id": rulesEditionId, "rules_edition_sha256": rulesEditionSha256]
    }

    static func parse(_ v: [String: String]) -> RemoteConfigValues {
        let d = defaults
        func model(_ key: String, _ fallback: String) -> String {
            let name = (v[key] ?? "").trimmingCharacters(in: .whitespaces)
            return allowedCloudModels.contains(name) ? name : fallback
        }
        let fallbackRaw = (v["cloud_model_item_fallback"] ?? d.cloudModelItemFallback).trimmingCharacters(in: .whitespaces)
        let id = (v["rules_edition_id"] ?? "").trimmingCharacters(in: .whitespaces)
        let sha = (v["rules_edition_sha256"] ?? "").trimmingCharacters(in: .whitespaces).lowercased()
        let pinOK = id.range(of: "^[a-z0-9-]{1,64}$", options: .regularExpression) != nil
            && sha.range(of: "^[0-9a-f]{64}$", options: .regularExpression) != nil
        let minimum = (v["minimum_version_ios"] ?? "").trimmingCharacters(in: .whitespaces)
        return RemoteConfigValues(
            cloudModelItem: model("cloud_model_item", d.cloudModelItem),
            cloudModelItemFallback: fallbackRaw.isEmpty ? "" : model("cloud_model_item_fallback", d.cloudModelItemFallback),
            cloudModelText: model("cloud_model_text", d.cloudModelText),
            killCloud: v["kill_cloud"].map(pauseCloud) ?? d.killCloud,
            minimumVersionIOS: minimum.isEmpty ? d.minimumVersionIOS : minimum,
            secondLookPolicyJSON: policy(v["second_look_policy_json"]) ?? d.secondLookPolicyJSON,
            rulesEditionId: pinOK ? id : "", rulesEditionSha256: pinOK ? sha : "")
    }

    /// The pause switch fails closed: only a clear "false" word opens the cloud; empty or garbled text keeps it paused.
    static func pauseCloud(_ s: String) -> Bool {
        !["0", "false", "f", "no", "n", "off"].contains(s.trimmingCharacters(in: .whitespaces).lowercased())
    }

    /// The policy must name all five reasons with true or false; anything else keeps the default.
    static func policy(_ raw: String?) -> String? {
        guard let raw, let o = try? JSONSerialization.jsonObject(with: Data(raw.utf8)) as? [String: Any] else { return nil }
        var parts: [String] = []
        for k in policyKeys {
            guard let n = o[k] as? NSNumber, CFGetTypeID(n) == CFBooleanGetTypeID() else { return nil }
            parts.append("\"\(k)\":\(n.boolValue)")
        }
        return "{" + parts.joined(separator: ",") + "}"
    }

    /// Versions compare by number, part by part (0.10.0 is above 0.9.0). A version that cannot be
    /// read never locks the app.
    static func isBelowMinimum(current: String, minimum: String) -> Bool {
        func parts(_ s: String) -> [Int]? {
            let p = s.trimmingCharacters(in: .whitespaces).split(separator: ".", omittingEmptySubsequences: false).map { Int($0) }
            return p.isEmpty || p.contains(nil) ? nil : p.compactMap { $0 }
        }
        guard let c = parts(current), let m = parts(minimum) else { return false }
        for i in 0..<max(c.count, m.count) {
            let a = i < c.count ? c[i] : 0, b = i < m.count ? m[i] : 0
            if a != b { return a < b }
        }
        return false
    }
}
