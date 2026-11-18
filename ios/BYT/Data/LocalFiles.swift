import Foundation

/// The box on this iPhone: one JSON file per box in Application Support, readable only while the
/// iPhone is unlocked. What is saved never holds label text or a verdict (see `BoxItem.forStorage`).
final class BoxFiles: BoxPersistence, @unchecked Sendable {
    let folder: URL
    /// The last save or load that failed, in words; nil when the last one worked.
    private(set) var problem: String?

    static var defaultFolder: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("boxes")
    }

    /// A saved box is a few kilobytes; a larger file is damaged and is not read.
    static let maxFileBytes = 2_000_000

    /// Atomic, and readable only while the iPhone is unlocked.
    static let writeOptions: Data.WritingOptions = [.atomic, .completeFileProtection]

    init(folder: URL = BoxFiles.defaultFolder) { self.folder = folder }

    /// Box ids are letters, digits, "-" and "_" only, so an id can never name a file elsewhere.
    func url(boxId: String) -> URL? {
        let allowed = boxId.unicodeScalars.allSatisfy { $0.isASCII && (CharacterSet.alphanumerics.contains($0) || $0 == "-" || $0 == "_") }
        guard !boxId.isEmpty, allowed else { return nil }
        return folder.appendingPathComponent(boxId + ".json")
    }

    func save(_ snapshot: BoxSnapshot) {
        guard let url = url(boxId: snapshot.boxId) else { problem = "The box id is not a safe file name."; return }
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            let data = try JSONEncoder().encode(snapshot)
            // Never replace the last good file with one the loader would refuse.
            guard data.count <= Self.maxFileBytes else {
                problem = "The box is too large to save (\(data.count) bytes). The last saved box is kept."
                return
            }
            try data.write(to: url, options: Self.writeOptions)
            problem = nil
        } catch {
            problem = "The box could not be saved: \(error.localizedDescription)"
        }
    }

    func load(boxId: String) -> BoxSnapshot? {
        guard let url = url(boxId: boxId), FileManager.default.fileExists(atPath: url.path) else { return nil }
        do {
            let size = (try FileManager.default.attributesOfItem(atPath: url.path)[.size] as? NSNumber)?.intValue ?? 0
            guard size <= Self.maxFileBytes else {
                problem = "The saved box is too large to be a box (\(size) bytes), so it was not read."
                return nil
            }
            let snapshot = try JSONDecoder().decode(BoxSnapshot.self, from: Data(contentsOf: url))
            problem = nil
            return snapshot
        } catch {
            problem = "The saved box could not be read: \(error.localizedDescription)"
            return nil
        }
    }
}
