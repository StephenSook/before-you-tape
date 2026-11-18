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
