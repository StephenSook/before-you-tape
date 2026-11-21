import Foundation
import Testing
@testable import BYT

@Suite struct ReadyCheckTests {
    func status(_ unavailable: OnDeviceStatus.Unavailable?) -> OnDeviceStatus {
        OnDeviceStatus(unavailable: unavailable, localeSupported: true, contextSize: 4096, variant: "test", vision: false)
    }

    @Test func saysTheIPhoneCanCheckItemsWhenTheModelIsReady() {
        #expect(ReadyCheck.modelLine(status(nil)) == "This iPhone can check items with no network.")
    }

    @Test func saysWhyWhenTheModelIsNotReady() {
        #expect(ReadyCheck.modelLine(status(.deviceNotEligible)) == "This iPhone cannot run Apple's on-device model.")
        #expect(ReadyCheck.modelLine(status(.appleIntelligenceOff)) == "Apple Intelligence is turned off in Settings.")
        #expect(ReadyCheck.modelLine(status(.modelNotReady)) == "The on-device model is still downloading. Keep the iPhone on Wi-Fi.")
    }

    /// Whether label photos are read on this iPhone, and what to do when they are not.
    @Test func saysWhetherLabelPhotosAreReadOnThisIPhone() {
        #expect(ReadyCheck.photoLine(.wordsAndPhotos) == "Label photos are read on this iPhone, with no network.")
        #expect(ReadyCheck.photoLine(.wordsOnly) == "This iPhone's model does not read photos. Type the label's words instead.")
        for off in [status(.appleIntelligenceOff), status(.modelNotReady), status(.deviceNotEligible),
                    OnDeviceStatus(unavailable: nil, localeSupported: false, contextSize: 4096, variant: "test", vision: true)] {
            #expect(ReadyCheck.photoLine(off) == "Without Apple's on-device model, photos are checked only in the cloud, when you allow it.")
        }
    }

    @Test func anUnsupportedLanguageIsSaid() {
        let s = OnDeviceStatus(unavailable: nil, localeSupported: false, contextSize: 4096, variant: "test", vision: false)
        #expect(ReadyCheck.modelLine(s) == "Apple's on-device model does not support this iPhone's language yet.")
    }
}

@Suite struct RemoteConfigDefaultsTests {
    /// The in-app defaults must equal the defaults in remoteconfig.template.json.
    @Test func inAppDefaultsEqualTheTemplate() throws {
        let template = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().appendingPathComponent("remoteconfig.template.json")
        let json = try JSONSerialization.jsonObject(with: Data(contentsOf: template)) as! [String: Any]
        let params = json["parameters"] as! [String: [String: Any]]
        func value(_ key: String) -> String? { (params[key]?["defaultValue"] as? [String: Any])?["value"] as? String }
        let d = RemoteConfigValues.defaults.asStrings
        #expect(!d.isEmpty)
        for (key, v) in d { #expect(value(key) == v, "\(key)") }
    }
}
