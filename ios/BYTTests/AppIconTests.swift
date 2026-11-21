import CoreGraphics
import Foundation
import ImageIO
import Testing
@testable import BYT

/// App Store Connect refuses a build with no app icon (errors 90022 and 90713). The icon comes from
/// the asset catalog, which names it in the built Info.plist; its one 1024 by 1024 source must be
/// opaque, as Apple refuses an App Store icon with an alpha channel.
@MainActor
@Suite struct AppIconTests {
    static let source = BoxStoreTests.repo
        .appendingPathComponent("ios/BYT/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png")

    @Test func theBuiltAppNamesItsIcon() {
        #expect(Bundle.main.object(forInfoDictionaryKey: "CFBundleIconName") as? String == "AppIcon")
        let icons = Bundle.main.object(forInfoDictionaryKey: "CFBundleIcons") as? [String: Any]
        let primary = icons?["CFBundlePrimaryIcon"] as? [String: Any]
        #expect(primary?["CFBundleIconName"] as? String == "AppIcon")
    }

    @Test func theIconSourceIsAnOpaque1024Square() throws {
        let image = try #require(CGImageSourceCreateWithURL(Self.source as CFURL, nil)
            .flatMap { CGImageSourceCreateImageAtIndex($0, 0, nil) })
        #expect(image.width == 1024 && image.height == 1024)
        let opaque: [CGImageAlphaInfo] = [.none, .noneSkipFirst, .noneSkipLast]
        #expect(opaque.contains(image.alphaInfo), "alpha: \(image.alphaInfo.rawValue)")
    }
}
