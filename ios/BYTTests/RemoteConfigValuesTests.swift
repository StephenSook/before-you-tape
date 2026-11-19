import BYTCore
import Foundation
import Testing
@testable import BYT

/// Remote Config read the way the web app reads it (src/config/remoteConfig.ts): a bad value keeps the default.
@MainActor
@Suite struct RemoteConfigValuesTests {
    let d = RemoteConfigValues.defaults
    let sha = String(repeating: "AB", count: 32)

    @Test func emptyOrBadValuesKeepTheDefaults() {
        #expect(RemoteConfigValues.parse([:]) == d)
        let p = RemoteConfigValues.parse(["cloud_model_item": "  ", "cloud_model_text": "gemini-9-unknown",
                                          "second_look_policy_json": "{broken", "rules_edition_id": "Bad ID!", "rules_edition_sha256": "abc"])
        #expect(p.cloudModelItem == d.cloudModelItem && p.cloudModelText == d.cloudModelText)
        #expect(p.secondLookPolicyJSON == d.secondLookPolicyJSON && p.rulesEditionId == "" && p.rulesEditionSha256 == "")
        #expect(RemoteConfigValues.parse(["second_look_policy_json": #"{"whMismatch":true}"#]).secondLookPolicyJSON == d.secondLookPolicyJSON)
        #expect(RemoteConfigValues.parse(["rules_edition_id": "byt-abc", "rules_edition_sha256": "zz"]).rulesEditionId == "")
    }

    @Test func goodValuesAreRead() {
        let off = #"{"identity":false,"whMismatch":false,"batteryNumbers":false,"notSure":false,"hazardNoLabel":false,"extra":1}"#
        let p = RemoteConfigValues.parse(["cloud_model_item": " gemini-3.8-flash ", "cloud_model_item_fallback": "", "kill_cloud": "true",
                                          "rules_edition_id": " byt-abc123 ", "rules_edition_sha256": sha, "minimum_version_ios": "1.2.0",
                                          "second_look_policy_json": off])
        #expect(p.cloudModelItem == "gemini-3.8-flash" && p.cloudModelItemFallback == "" && p.killCloud)
        #expect(p.rulesEditionId == "byt-abc123" && p.rulesEditionSha256 == sha.lowercased() && p.minimumVersionIOS == "1.2.0")
        #expect(p.secondLookPolicyJSON == #"{"whMismatch":false,"batteryNumbers":false,"notSure":false,"hazardNoLabel":false,"identity":false}"#)
    }

    @Test func booleansReadLikeRemoteConfig() {
        for yes in ["1", "true", "TRUE", "t", "yes", "y", "on"] { #expect(RemoteConfigValues.parse(["kill_cloud": yes]).killCloud, "\(yes)") }
        for no in ["0", "false", "FALSE", "f", "no", "n", "off", " false "] { #expect(!RemoteConfigValues.parse(["kill_cloud": no]).killCloud, "\(no)") }
        // A value that cannot be read keeps the cloud paused: the switch fails closed.
        for unreadable in ["", " ", "maybe", "2", "tru"] { #expect(RemoteConfigValues.parse(["kill_cloud": unreadable]).killCloud, "\(unreadable)") }
        // No value at all (only in a test; the app always passes the template's default) is the default.
        #expect(!RemoteConfigValues.parse([:]).killCloud)
    }

    @Test func theModelAllowListIsTheWebAppsList() throws {
        let web = try String(contentsOf: BoxStoreTests.repo.appendingPathComponent("src/config/models.ts"), encoding: .utf8)
        let names = web.components(separatedBy: "{ name: \"").dropFirst().compactMap { $0.split(separator: "\"").first.map(String.init) }
        #expect(names == RemoteConfigValues.allowedCloudModels)
        #expect(!names.isEmpty)
    }

    @Test func versionsCompareByNumberNotText() {
        #expect(RemoteConfigValues.isBelowMinimum(current: "0.9.0", minimum: "0.10.0"))
        #expect(!RemoteConfigValues.isBelowMinimum(current: "0.10.0", minimum: "0.9.0"))
        #expect(!RemoteConfigValues.isBelowMinimum(current: "1.0", minimum: "1.0.0"))
        #expect(RemoteConfigValues.isBelowMinimum(current: "1.0.0", minimum: "1.0.1"))
        #expect(!RemoteConfigValues.isBelowMinimum(current: "0.1.0", minimum: "0.0.0"))
        // A version that cannot be read never locks the app.
        #expect(!RemoteConfigValues.isBelowMinimum(current: "", minimum: "9.0.0"))
        #expect(!RemoteConfigValues.isBelowMinimum(current: "1.0.0", minimum: "next"))
    }
}
