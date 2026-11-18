import Foundation

/// What this iPhone's on-device model can do, read once from Apple's model (in
/// `ModelSessionFactory`), kept as plain values so the screens and tests need no model.
struct OnDeviceStatus: Equatable, Sendable {
    enum Unavailable: Equatable, Sendable { case deviceNotEligible, appleIntelligenceOff, modelNotReady, other }

    var unavailable: Unavailable?
    var localeSupported: Bool
    var contextSize: Int
    var variant: String
    /// Whether Apple reports image understanding for the on-device model.
    var vision: Bool

    var available: Bool { unavailable == nil && localeSupported }
}

/// The Ready check's words, from the status alone.
enum ReadyCheck {
    static func modelLine(_ s: OnDeviceStatus) -> String {
        switch s.unavailable {
        case .deviceNotEligible?: return "This iPhone cannot run Apple's on-device model."
        case .appleIntelligenceOff?: return "Apple Intelligence is turned off in Settings."
        case .modelNotReady?: return "The on-device model is still downloading. Keep the iPhone on Wi-Fi."
        case .other?: return "Apple's on-device model is not available."
        case nil:
            return s.localeSupported ? "This iPhone can check items with no network."
                                     : "Apple's on-device model does not support this iPhone's language yet."
        }
    }
}
