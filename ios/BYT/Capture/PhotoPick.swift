import CoreGraphics
import Foundation
import ImageIO

/// A photo the sender picked (any format ImageIO reads, HEIC included), cut to the hold zone like a
/// camera photo, upright, at the shared size: only that part is ever sent, and the sender is shown
/// it. Decoding and re-encoding drops every bit of metadata, so a photo's location never leaves the phone.
enum PhotoPick {
    static func jpeg(fromFile data: Data) throws -> Data {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else { throw CropError.notDrawable }
        let props = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
        let raw = (props?[kCGImagePropertyOrientation] as? NSNumber)?.uint32Value ?? 1
        let upright = try Crop.holdZone(of: image, zone: HoldZone.standard, orientation: CGImagePropertyOrientation(rawValue: raw) ?? .up)
        return try Crop.jpeg(upright)
    }
}
