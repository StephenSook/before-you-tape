import Foundation
import FoundationModels

/// The only file that names Apple's session API (the iOS guard enforces it).
enum ModelSessionFactory {
    static func onDeviceStatus() -> OnDeviceStatus {
        let model = SystemLanguageModel.default
        var unavailable: OnDeviceStatus.Unavailable?
        switch model.availability {
        case .available: unavailable = nil
        case let .unavailable(reason):
            switch reason {
            case .deviceNotEligible: unavailable = .deviceNotEligible
            case .appleIntelligenceNotEnabled: unavailable = .appleIntelligenceOff
            case .modelNotReady: unavailable = .modelNotReady
            @unknown default: unavailable = .other
            }
        }
        return OnDeviceStatus(unavailable: unavailable, localeSupported: model.supportsLocale(),
                              contextSize: model.contextSize, variant: "Apple on-device model",
                              vision: model.capabilities.contains(.vision))
    }
}
