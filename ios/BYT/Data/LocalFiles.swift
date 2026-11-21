import Foundation

/// The box on this iPhone: one JSON file per box in Application Support, readable only while the
/// iPhone is unlocked. What is saved never holds label text or a verdict (see `BoxItem.forStorage`).
final class BoxFiles: BoxPersistence, @unchecked Sendable {
    let folder: URL
    /// The last save or load that failed, in words; nil when the last one worked.
    private(set) var problem: String?
    /// Boxes whose file is there but could not be read (or moved aside): no save replaces them.
    private var held: Set<String> = []

    static var defaultFolder: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("boxes")
    }

    /// A saved box is a few kilobytes; a larger file is damaged and is not read.
    static let maxFileBytes = 2_000_000

    /// Why a save did not happen, in the words the box shows.
    struct SaveError: Error, Equatable, LocalizedError {
        let message: String
        /// The saved box is there but could not be read yet: read it before trying again.
        let savedBoxUnread: Bool
        init(_ message: String, savedBoxUnread: Bool = false) {
            self.message = message
            self.savedBoxUnread = savedBoxUnread
        }
        var errorDescription: String? { message }
    }

    static let tooLarge = "This change is not saved: the box is too large. The last saved box is kept."
    static let notReadYet = "This change is not saved: the saved box could not be read yet, so it is kept as it is."

    /// Atomic, and readable only while the iPhone is unlocked.
    static let writeOptions: Data.WritingOptions = [.atomic, .completeFileProtection]

    init(folder: URL = BoxFiles.defaultFolder) { self.folder = folder }

    /// The cloud choice's own file, `<id>.consent` beside the box (a box id has no dot, so it is never a box).
    func consentURL(boxId: String) -> URL? {
        url(boxId: boxId).map { $0.deletingPathExtension().appendingPathExtension("consent") }
    }

    /// Written at once and atomically, apart from the box file, so the choice is on disk when this
    /// returns even when the box cannot be saved. A write that fails is said in `problem`.
    func recordConsent(_ choice: String, boxId: String) {
        guard let url = consentURL(boxId: boxId) else { return }
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            try Data(choice.utf8).write(to: url, options: Self.writeOptions)
        } catch {
            problem = "The cloud choice is not saved: \(error.localizedDescription)"
        }
    }

    func recordedConsent(boxId: String) -> String? {
        guard let url = consentURL(boxId: boxId), let data = try? Data(contentsOf: url) else { return nil }
        return String(decoding: data, as: UTF8.self)
    }

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
        guard !held.contains(snapshot.boxId) else {
            problem = Self.notReadYet
            throw SaveError(Self.notReadYet, savedBoxUnread: true)
        }
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

    /// Reads the box. A file that cannot be read right now (the iPhone is locked, a read error)
    /// stays where it is and holds the box, so no save replaces it. A file that was read but is not
    /// a box (damaged, or too large) is moved aside to its own copy, so a new box can start.
    func load(boxId: String) -> BoxSnapshot? {
        guard let url = url(boxId: boxId), FileManager.default.fileExists(atPath: url.path) else {
            held.remove(boxId)
            return nil
        }
        let size = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? NSNumber)?.intValue ?? 0
        guard size <= Self.maxFileBytes else {
            problem = "The saved box is too large to be a box (\(size) bytes), so it was not read."
            keepAside(url, boxId: boxId)
            return nil
        }
        let data: Data
        do {
            data = try Data(contentsOf: url)
        } catch {
            problem = "The saved box could not be read yet: \(error.localizedDescription) It is kept as it is."
            held.insert(boxId)
            return nil
        }
        do {
            let snapshot = try JSONDecoder().decode(BoxSnapshot.self, from: data)
            problem = nil
            held.remove(boxId)
            return snapshot
        } catch {
            problem = "The saved box is damaged: \(error.localizedDescription)"
            keepAside(url, boxId: boxId)
            return nil
        }
    }

    /// Moves a box file that is not a box to its own `<id>.unreadable-<time>-<tag>.json` (a box id
    /// has no dot, so that name is never a box), so it can still be recovered and no earlier copy is
    /// touched. If the move fails, the file stays and holds the box.
    private func keepAside(_ url: URL, boxId: String) {
        let stamp = Int(Date().timeIntervalSince1970)
        let aside = folder.appendingPathComponent("\(boxId).unreadable-\(stamp)-\(UUID().uuidString.prefix(8)).json")
        do {
            try FileManager.default.moveItem(at: url, to: aside)
            held.remove(boxId)
            problem = (problem ?? "The saved box could not be read.") + " It is kept aside."
        } catch {
            held.insert(boxId)
            problem = (problem ?? "The saved box could not be read.") + " It could not be moved aside, so it is kept as it is."
        }
    }
}
