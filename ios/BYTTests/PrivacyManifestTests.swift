import Foundation
import Testing
@testable import BYT

/// Apple refuses an upload whose code uses a "required reason" API without declaring it in the
/// app's own privacy manifest. The app's code reads UserDefaults (the box id and the cloud choice) and file metadata (the
/// saved box's size). Its own data collection, the crop and the label words sent for a cloud check
/// after the sender taps Allow, is declared there too; Firebase's own bundles declare theirs.
@Suite struct PrivacyManifestTests {
    func manifest() throws -> [String: Any] {
        let url = try #require(Bundle.main.url(forResource: "PrivacyInfo", withExtension: "xcprivacy"),
                               "BYT.app carries no PrivacyInfo.xcprivacy")
        return try #require(try PropertyListSerialization.propertyList(from: Data(contentsOf: url), format: nil) as? [String: Any])
    }

    @Test func theAppDoesNotTrack() throws {
        let m = try manifest()
        #expect(m["NSPrivacyTracking"] as? Bool == false)
        #expect((m["NSPrivacyTrackingDomains"] as? [String])?.isEmpty == true)
    }

    @Test func theAppDeclaresItsOwnRequiredReasonAPIs() throws {
        let apis = try #require(try manifest()["NSPrivacyAccessedAPITypes"] as? [[String: Any]])
        let reasons = Dictionary(uniqueKeysWithValues: apis.map {
            ($0["NSPrivacyAccessedAPIType"] as? String ?? "", $0["NSPrivacyAccessedAPITypeReasons"] as? [String] ?? [])
        })
        #expect(reasons == ["NSPrivacyAccessedAPICategoryUserDefaults": ["CA92.1"],
                            "NSPrivacyAccessedAPICategoryFileTimestamp": ["C617.1"]])
    }

    /// Firebase Performance collects by itself once it is linked, and Functions is never called, so
    /// neither is in the app: nothing leaves the phone for a feature the app does not use.
    @Test func theAppLinksNoFirebaseLibraryItNeverCalls() {
        #expect(NSClassFromString("FIRPerformance") == nil)
        #expect(NSClassFromString("FIRFunctions") == nil)
    }

    /// What the app's own use sends: the crop and the label words of a cloud check (linked: the
    /// request carries the anonymous sign-in), and the installation ID Remote Config receives on every
    /// settings fetch (declared as a Device ID, not linked). All for App Functionality, none for tracking.
    @Test func theAppDeclaresWhatItSends() throws {
        let types = try #require(try manifest()["NSPrivacyCollectedDataTypes"] as? [[String: Any]])
        let byType = Dictionary(uniqueKeysWithValues: types.map { ($0["NSPrivacyCollectedDataType"] as? String ?? "", $0) })
        let linked = ["NSPrivacyCollectedDataTypePhotosorVideos": true, "NSPrivacyCollectedDataTypeOtherUserContent": true,
                      "NSPrivacyCollectedDataTypeDeviceID": false]
        #expect(Set(byType.keys) == Set(linked.keys))
        for (type, entry) in byType {
            #expect(entry["NSPrivacyCollectedDataTypeTracking"] as? Bool == false, "\(type)")
            #expect(entry["NSPrivacyCollectedDataTypeLinked"] as? Bool == linked[type], "\(type)")
            #expect(entry["NSPrivacyCollectedDataTypePurposes"] as? [String] == ["NSPrivacyCollectedDataTypePurposeAppFunctionality"], "\(type)")
        }
    }
}
