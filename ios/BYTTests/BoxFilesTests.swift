import BYTCore
import Foundation
import Testing
@testable import BYT

/// The box on disk: one JSON file per box, readable only while the iPhone is unlocked.
@Suite struct BoxFilesTests {
    func folder() -> URL { FileManager.default.temporaryDirectory.appendingPathComponent("boxes-\(UUID().uuidString)") }

    @Test func aSavedBoxLoadsBackTheSame() throws {
        let files = BoxFiles(folder: folder())
        let item = BoxItem(itemId: "i1", read: .object(["labelText": .string("")]), labelTags: ["alcohol"], readSource: "phone_cloud", readMs: 900)
        let snap = BoxSnapshot(boxId: "b1", destinationCode: "PH", items: [item], cloudConsent: true, sources: BoxSources(inCloud: 1))
        try files.save(snap)
        #expect(files.load(boxId: "b1") == snap)
        #expect(files.load(boxId: "other") == nil)
    }

    /// The simulator does not report file protection, so the written options are pinned here and
    /// the protection itself is read back on the iPhone.
    @Test func theFileIsWrittenWithCompleteProtection() {
        #expect(BoxFiles.writeOptions.contains(.completeFileProtection))
        #expect(BoxFiles.writeOptions.contains(.atomic))
    }

    @Test func aBoxIdCannotLeaveTheFolder() {
        let files = BoxFiles(folder: folder())
        #expect(files.url(boxId: "../../secrets") == nil)
        #expect(files.url(boxId: "") == nil)
        #expect(files.url(boxId: "a1-B2_c3") != nil)
    }

    @Test func anOversizedFileIsRefusedAndSaid() throws {
        let dir = folder()
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try Data(count: BoxFiles.maxFileBytes + 1).write(to: dir.appendingPathComponent("big.json"))
        let files = BoxFiles(folder: dir)
        #expect(files.load(boxId: "big") == nil)
        #expect(files.problem != nil)
    }

    func asides(_ dir: URL, _ boxId: String) throws -> [URL] {
        try FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)
            .filter { $0.lastPathComponent.hasPrefix(boxId + ".unreadable-") }
    }

    /// A saved box that cannot be read is moved aside, whole, so a later save never replaces it.
    @Test func anUnreadableBoxIsKeptAsideForRecovery() throws {
        let dir = folder()
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let damaged = Data("{ not a box".utf8)
        try damaged.write(to: dir.appendingPathComponent("b4.json"))
        let files = BoxFiles(folder: dir)
        #expect(files.load(boxId: "b4") == nil && files.problem != nil)
        let aside = try #require(try asides(dir, "b4").first)
        #expect(try Data(contentsOf: aside) == damaged)
        try files.save(BoxSnapshot(boxId: "b4", destinationCode: "CA", items: [], cloudConsent: nil, sources: BoxSources()))
        #expect(try Data(contentsOf: aside) == damaged)
        #expect(files.load(boxId: "b4")?.destinationCode == "CA")
    }

    /// A second unreadable file for the same box gets its own copy; the first is never deleted.
    @Test func aSecondUnreadableBoxKeepsTheFirstCopy() throws {
        let dir = folder()
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let files = BoxFiles(folder: dir)
        try Data("{ first".utf8).write(to: dir.appendingPathComponent("b6.json"))
        #expect(files.load(boxId: "b6") == nil)
        try Data("{ second".utf8).write(to: dir.appendingPathComponent("b6.json"))
        #expect(files.load(boxId: "b6") == nil)
        let kept = try Set(asides(dir, "b6").map { try Data(contentsOf: $0) })
        #expect(kept == [Data("{ first".utf8), Data("{ second".utf8)])
    }

    /// A file that cannot be read right now (here a folder in its place; on the iPhone, a locked
    /// phone) stays where it is, and no save replaces it until it reads.
    @Test func aBoxThatCannotBeReadYetStaysAndBlocksSaves() throws {
        let dir = folder()
        let path = dir.appendingPathComponent("b5.json")
        try FileManager.default.createDirectory(at: path, withIntermediateDirectories: true)
        let files = BoxFiles(folder: dir)
        #expect(files.load(boxId: "b5") == nil && files.problem != nil)
        #expect(try asides(dir, "b5").isEmpty)
        #expect(throws: BoxFiles.SaveError(BoxFiles.notReadYet)) {
            try files.save(BoxSnapshot(boxId: "b5", destinationCode: "CA", items: [], cloudConsent: nil, sources: BoxSources()))
        }
        var isDir: ObjCBool = false
        #expect(FileManager.default.fileExists(atPath: path.path, isDirectory: &isDir) && isDir.boolValue)
    }

    /// A snapshot too large to load again is not written, so the last good file stays.
    @Test func aSnapshotTooLargeToReopenNeverReplacesTheGoodFile() throws {
        let files = BoxFiles(folder: folder())
        let good = BoxSnapshot(boxId: "b3", destinationCode: "CA", items: [], cloudConsent: nil, sources: BoxSources())
        try files.save(good)
        let huge = BoxItem(itemId: "i1", read: .object(["itemName": .string(String(repeating: "x", count: BoxFiles.maxFileBytes))]),
                           readSource: "manual", readMs: 0)
        // The save says so: the change on screen is not on disk.
        #expect(throws: BoxFiles.SaveError(BoxFiles.tooLarge)) {
            try files.save(BoxSnapshot(boxId: "b3", destinationCode: "PH", items: [huge], cloudConsent: nil, sources: BoxSources()))
        }
        #expect(files.load(boxId: "b3") == good)
    }
}
