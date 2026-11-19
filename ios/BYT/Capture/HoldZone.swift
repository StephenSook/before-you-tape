import CoreGraphics

/// The frame the sender holds the label inside, as a unit rectangle with a top-left origin. The
/// web app's value (src/ui/CameraStage.tsx, a test compares).
enum HoldZone {
    static let standard = CGRect(x: 0.25, y: 0.15, width: 0.5, height: 0.7)
    /// A picked photo is used whole, as on the web.
    static let wholeFrame = CGRect(x: 0, y: 0, width: 1, height: 1)
}

/// The one size limit for a crop that leaves the phone, shared with the web app and the server
/// (src/shared/cropLimits.ts, a test compares).
enum CropLimits {
    static let maxSide = 768
    static let jpegQuality = 0.85
    static let maxBytes = 500_000
}
