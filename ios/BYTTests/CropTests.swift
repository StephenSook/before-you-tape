import CoreGraphics
import Foundation
import ImageIO
import Testing
import UniformTypeIdentifiers
@testable import BYT

/// Test images, painted with a top-left origin, and pixel reads.
enum Pictures {
    struct RGB: Equatable { var r: UInt8, g: UInt8, b: UInt8 }
    static let red = RGB(r: 255, g: 0, b: 0), blue = RGB(r: 0, g: 0, b: 255), green = RGB(r: 0, g: 255, b: 0)

    static func image(width: Int, height: Int, paint: [(CGRect, RGB)]) -> CGImage {
        let ctx = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
                            space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
        ctx.translateBy(x: 0, y: CGFloat(height))
        ctx.scaleBy(x: 1, y: -1)
        for (rect, c) in paint {
            ctx.setFillColor(red: CGFloat(c.r) / 255, green: CGFloat(c.g) / 255, blue: CGFloat(c.b) / 255, alpha: 1)
            ctx.fill(rect)
        }
        return ctx.makeImage()!
    }

    static func pixel(_ image: CGImage, x: Int, y: Int) -> RGB {
        var data = [UInt8](repeating: 0, count: 4)
        let ctx = CGContext(data: &data, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4,
                            space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
        ctx.draw(image, in: CGRect(x: -x, y: y - image.height + 1, width: image.width, height: image.height))
        return RGB(r: data[0], g: data[1], b: data[2])
    }

    static func near(_ a: RGB, _ b: RGB) -> Bool {
        abs(Int(a.r) - Int(b.r)) < 40 && abs(Int(a.g) - Int(b.g)) < 40 && abs(Int(a.b) - Int(b.b)) < 40
    }

    /// Upright 1000 by 2000: red top half, blue bottom half, a green strip down the left 250 columns.
    static let upright = image(width: 1000, height: 2000, paint: [
        (CGRect(x: 0, y: 0, width: 1000, height: 1000), red), (CGRect(x: 0, y: 1000, width: 1000, height: 1000), blue),
        (CGRect(x: 0, y: 0, width: 250, height: 2000), green),
    ])
    /// The same picture as a camera sensor stores it for a portrait photo (orientation .right):
    /// 2000 by 1000, its left half is the picture's top, its bottom rows are the picture's left side.
    static let sensor = image(width: 2000, height: 1000, paint: [
        (CGRect(x: 0, y: 0, width: 1000, height: 1000), red), (CGRect(x: 1000, y: 0, width: 1000, height: 1000), blue),
        (CGRect(x: 0, y: 750, width: 2000, height: 250), green),
    ])
}

@Suite struct CropTests {
    @Test func theHoldZoneAndLimitsAreTheWebAppsValues() throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let stage = try String(contentsOf: root.appendingPathComponent("src/ui/CameraStage.tsx"), encoding: .utf8)
        #expect(stage.contains("export const HOLD_ZONE: Box = { x: 0.25, y: 0.15, w: 0.5, h: 0.7 };"))
        #expect(HoldZone.standard == CGRect(x: 0.25, y: 0.15, width: 0.5, height: 0.7))
        let limits = try String(contentsOf: root.appendingPathComponent("src/shared/cropLimits.ts"), encoding: .utf8)
        #expect(limits.contains("maxSide: 768,") && CropLimits.maxSide == 768)
        #expect(limits.contains("jpegQuality: 0.85,") && CropLimits.jpegQuality == 0.85)
        #expect(limits.contains("maxBytes: 500_000,") && CropLimits.maxBytes == 500_000)
    }

    @Test func thePlanMatchesTheWebAppsRounding() throws {
        let p = try Crop.plan(width: 1000, height: 2000, zone: HoldZone.standard, maxSide: 768)
        #expect(p == Crop.Plan(sx: 250, sy: 300, sw: 500, sh: 1400, dw: 274, dh: 768))
        #expect(throws: CropError.emptyBox) { try Crop.plan(width: 1000, height: 2000, zone: CGRect(x: 1, y: 0, width: 0.5, height: 1), maxSide: 768) }
    }

    @Test func theCropIsExactlyTheHoldZoneOfTheFrame() throws {
        let crop = try Crop.holdZone(of: Pictures.upright, zone: HoldZone.standard, orientation: .up)
        #expect(crop.width == 500 && crop.height == 1400)
        #expect(Pictures.near(Pictures.pixel(crop, x: 0, y: 0), Pictures.red))
        #expect(Pictures.near(Pictures.pixel(crop, x: 0, y: 1399), Pictures.blue))
    }

    @Test func theCropRespectsOrientation() throws {
        let crop = try Crop.holdZone(of: Pictures.sensor, zone: HoldZone.standard, orientation: .right)
        #expect(crop.width == 500 && crop.height == 1400)
        #expect(Pictures.near(Pictures.pixel(crop, x: 0, y: 0), Pictures.red))
        #expect(Pictures.near(Pictures.pixel(crop, x: 499, y: 0), Pictures.red))
        #expect(Pictures.near(Pictures.pixel(crop, x: 0, y: 1399), Pictures.blue))
    }

    @Test func theJPEGLongSideIsTheSharedLimit() throws {
        let crop = try Crop.holdZone(of: Pictures.upright, zone: HoldZone.standard, orientation: .up)
        let jpeg = try Crop.jpeg(crop)
        let src = try #require(CGImageSourceCreateWithData(jpeg as CFData, nil))
        let props = try #require(CGImageSourceCopyPropertiesAtIndex(src, 0, nil) as? [CFString: Any])
        #expect(props[kCGImagePropertyPixelWidth] as? Int == 274 && props[kCGImagePropertyPixelHeight] as? Int == 768)
        #expect(CGImageSourceGetType(src) as String? == UTType.jpeg.identifier)
    }

    @Test func aCropOverTheByteCapIsRefused() throws {
        let crop = try Crop.holdZone(of: Pictures.upright, zone: HoldZone.standard, orientation: .up)
        #expect(throws: CropError.self) { try Crop.jpeg(crop, maxBytes: 100) }
    }

    @Test func aPickedPhotoComesOutUprightWithNoLocation() throws {
        // A JPEG that carries a GPS position and a .right orientation, as a phone photo does.
        let data = NSMutableData()
        let dest = try #require(CGImageDestinationCreateWithData(data, UTType.jpeg.identifier as CFString, 1, nil))
        let gps: [CFString: Any] = [kCGImagePropertyGPSLatitude: 33.749, kCGImagePropertyGPSLatitudeRef: "N",
                                    kCGImagePropertyGPSLongitude: 84.388, kCGImagePropertyGPSLongitudeRef: "W"]
        CGImageDestinationAddImage(dest, Pictures.sensor, [kCGImagePropertyGPSDictionary: gps, kCGImagePropertyOrientation: 6] as CFDictionary)
        #expect(CGImageDestinationFinalize(dest))
        let inProps = CGImageSourceCopyPropertiesAtIndex(CGImageSourceCreateWithData(data, nil)!, 0, nil) as? [CFString: Any]
        #expect(inProps?[kCGImagePropertyGPSDictionary] != nil)

        let out = try PhotoPick.jpeg(fromFile: data as Data)
        let src = try #require(CGImageSourceCreateWithData(out as CFData, nil))
        let props = try #require(CGImageSourceCopyPropertiesAtIndex(src, 0, nil) as? [CFString: Any])
        #expect(props[kCGImagePropertyGPSDictionary] == nil)
        #expect(props[kCGImagePropertyPixelWidth] as? Int == 384 && props[kCGImagePropertyPixelHeight] as? Int == 768)
        let image = try #require(CGImageSourceCreateImageAtIndex(src, 0, nil))
        #expect(Pictures.near(Pictures.pixel(image, x: 300, y: 10), Pictures.red))
        #expect(Pictures.near(Pictures.pixel(image, x: 300, y: 760), Pictures.blue))
    }
}
