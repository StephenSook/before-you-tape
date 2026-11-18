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
            try JSONEncoder().encode(snapshot).write(to: url, options: Self.writeOptions)
            problem = nil
        } catch {
            problem = "The box could not be saved: \(error.localizedDescription)"
        }
    }

    func load(boxId: String) -> BoxSnapshot? {
        guard let url = url(boxId: boxId), FileManager.default.fileExists(atPath: url.path) else { return nil }
        do {
            let snapshot = try JSONDecoder().decode(BoxSnapshot.self, from: Data(contentsOf: url))
            problem = nil
            return snapshot
        } catch {
            problem = "The saved box could not be read: \(error.localizedDescription)"
            return nil
        }
    }
}
