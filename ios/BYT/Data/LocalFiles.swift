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

    /// Why a save did not happen, in the words the box shows.
    struct SaveError: Error, Equatable, LocalizedError {
        let message: String
        init(_ message: String) { self.message = message }
        var errorDescription: String? { message }
    }

    static let tooLarge = "This change is not saved: the box is too large. The last saved box is kept."

    /// Atomic, and readable only while the iPhone is unlocked.
    static let writeOptions: Data.WritingOptions = [.atomic, .completeFileProtection]

    init(folder: URL = BoxFiles.defaultFolder) { self.folder = folder }

    /// Box ids are letters, digits, "-" and "_" only, so an id can never name a file elsewhere.
    func url(boxId: String) -> URL? {
        let allowed = boxId.unicodeScalars.allSatisfy { $0.isASCII && (CharacterSet.alphanumerics.contains($0) || $0 == "-" || $0 == "_") }
        guard !boxId.isEmpty, allowed else { return nil }
        return folder.appendingPathComponent(boxId + ".json")
    }

    /// Writes the box, or throws why not, so the change on screen is never silently unsaved.
    func save(_ snapshot: BoxSnapshot) throws {
        func fail(_ message: String) -> SaveError {
            problem = message
            return SaveError(message)
        }
        guard let url = url(boxId: snapshot.boxId) else { throw fail("This change is not saved: the box id is not a safe file name.") }
        let data: Data
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            data = try JSONEncoder().encode(snapshot)
        } catch {
            throw fail("This change is not saved: \(error.localizedDescription)")
        }
        // Never replace the last good file with one the loader would refuse.
        guard data.count <= Self.maxFileBytes else { throw fail(Self.tooLarge) }
        do {
            try data.write(to: url, options: Self.writeOptions)
        } catch {
            throw fail("This change is not saved: \(error.localizedDescription)")
        }
        problem = nil
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
