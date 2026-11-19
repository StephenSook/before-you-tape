import CoreGraphics
import CoreImage
import Foundation
import ImageIO
import UniformTypeIdentifiers

enum CropError: Error, Equatable {
    case emptyBox
    case notDrawable
    case overCap(bytes: Int)
}

/// Crops the hold zone out of a frame and encodes it as a JPEG. Only this crop ever leaves the
/// phone, never the whole frame, never one over the shared byte cap, and never with metadata.
enum Crop {
    struct Plan: Equatable {
        var sx: Int, sy: Int, sw: Int, sh: Int, dw: Int, dh: Int
    }

    /// The web app's crop plan (src/capture/crop.ts), same rounding and clamping.
    static func plan(width: Int, height: Int, zone: CGRect, maxSide: Int) throws -> Plan {
        func clamp(_ v: Double, _ limit: Int) -> Int { min(limit, max(0, Int(v.rounded()))) }
        let w = Double(width), h = Double(height)
        let sx = clamp(zone.minX * w, width), sy = clamp(zone.minY * h, height)
        let sw = clamp((zone.minX + zone.width) * w, width) - sx
        let sh = clamp((zone.minY + zone.height) * h, height) - sy
        guard sw > 0, sh > 0 else { throw CropError.emptyBox }
        let scale = min(1, Double(maxSide) / Double(max(sw, sh)))
        return Plan(sx: sx, sy: sy, sw: sw, sh: sh,
                    dw: max(1, Int((Double(sw) * scale).rounded())), dh: max(1, Int((Double(sh) * scale).rounded())))
    }

    private static let context = CIContext()

    /// The zone of the frame as the sender saw it: the orientation is applied first.
    static func holdZone(of image: CGImage, zone: CGRect, orientation: CGImagePropertyOrientation) throws -> CGImage {
        let upright = CIImage(cgImage: image).oriented(orientation)
        let e = upright.extent
        let p = try plan(width: Int(e.width), height: Int(e.height), zone: zone, maxSide: Int.max)
        // Core Image counts y from the bottom.
        let rect = CGRect(x: e.minX + CGFloat(p.sx), y: e.minY + e.height - CGFloat(p.sy + p.sh), width: CGFloat(p.sw), height: CGFloat(p.sh))
        guard let out = context.createCGImage(upright, from: rect) else { throw CropError.notDrawable }
        return out
    }

    /// Scales to the shared long side and encodes, stepping the quality down until it fits under
    /// the byte cap; refuses it if it never does. The JPEG carries no metadata.
    static func jpeg(_ image: CGImage, maxSide: Int = CropLimits.maxSide, quality: Double = CropLimits.jpegQuality,
                     maxBytes: Int = CropLimits.maxBytes) throws -> Data {
        let p = try plan(width: image.width, height: image.height, zone: HoldZone.wholeFrame, maxSide: maxSide)
        let scaled = try scale(image, width: p.dw, height: p.dh)
        var size = 0
        var q = quality
        while q >= 0.4 - 1e-9 {
            let data = try encode(scaled, quality: q)
            size = data.count
            if size <= maxBytes { return data }
            q -= 0.15
        }
        throw CropError.overCap(bytes: size)
    }

    private static func scale(_ image: CGImage, width: Int, height: Int) throws -> CGImage {
        if image.width == width && image.height == height { return image }
        guard let ctx = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
                                  space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else {
            throw CropError.notDrawable
        }
        ctx.interpolationQuality = .high
        ctx.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
        guard let out = ctx.makeImage() else { throw CropError.notDrawable }
        return out
    }

    private static func encode(_ image: CGImage, quality: Double) throws -> Data {
        let data = NSMutableData()
        guard let dest = CGImageDestinationCreateWithData(data, UTType.jpeg.identifier as CFString, 1, nil) else { throw CropError.notDrawable }
        CGImageDestinationAddImage(dest, image, [kCGImageDestinationLossyCompressionQuality: quality] as CFDictionary)
        guard CGImageDestinationFinalize(dest) else { throw CropError.notDrawable }
        return data as Data
    }
}
