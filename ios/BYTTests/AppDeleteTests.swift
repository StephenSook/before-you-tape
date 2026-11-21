import BYTCore
import Foundation
import Testing
@testable import BYT

/// "Delete everything on this iPhone": the box (its file, its cloud choice, its id and every photo held in
/// memory), then the anonymous sign-in, in that order. The first step that fails stops the rest and is
/// named, and a retry starts there.
@MainActor
@Suite struct AppDeleteTests {
    let jpeg = Data([0xFF, 0xD8, 0xFF, 0xD9])

    /// The sign-in, with a scripted answer to deleting it.
    @MainActor final class FakeSignIn {
        var answers: [SignInDeletion]
        var deletes = 0
        init(_ answers: [SignInDeletion]) { self.answers = answers }
        var signIn: SignIn {
            SignIn(isSignedIn: { true }, attempt: { true }, delete: {
                self.deletes += 1
                return self.answers.isEmpty ? .deleted : self.answers.removeFirst()
            })
        }
    }

    func model(_ p: MemoryBoxPersistence, _ signIn: FakeSignIn, _ defaults: UserDefaults, reader: ItemReader? = nil,
               status: OnDeviceStatus = .wordsAndPhotos) -> AppModel {
        let j = FakeItemRunner.Journal()
        let reader = reader ?? ItemReader(device: FakeItemRunner("device", journal: j, results: [.success(ItemReply(read: AppSecondLookTests.powerBank, tokens: nil))]),
                                          makeCloud: { _ in FakeItemRunner("cloud", journal: j, results: []) }, parse: { ParsedRead(read: $0) })
        let m = AppModel(signIn: signIn.signIn, onDeviceStatus: { status }, persistence: p, reader: reader,
                         defaults: defaults, config: .defaults)
        m.network.pathChanged(satisfied: true)
        return m
    }

    /// A reader whose calls wait until the test lets them go.
    final class HeldRunner: ItemModelRunner, @unchecked Sendable {
        let name: String
        let journal: FakeItemRunner.Journal
        let reply: JSONValue
        private let lock = NSLock()
        private var waiting: [CheckedContinuation<Void, Never>] = []
        private var open = false
        init(_ name: String, _ journal: FakeItemRunner.Journal, reply: JSONValue) {
            self.name = name
            self.journal = journal
            self.reply = reply
        }
        func read(_ input: ItemInput) async -> Result<ItemReply, ReadError> {
            journal.add("\(name) start")
            await withCheckedContinuation { c in
                lock.lock()
                if open { lock.unlock(); c.resume() } else { waiting.append(c); lock.unlock() }
            }
            journal.add("\(name) end")
            return .success(ItemReply(read: reply, tokens: nil))
        }
        func letGo() {
            let all = lock.withLock { open = true; let w = waiting; waiting = []; return w }
            all.forEach { $0.resume() }
        }
    }

    /// A photo read on the iPhone that ends after everything was deleted lands nothing: no item, no crop,
    /// nothing saved under the new box.
    @Test func aReadThatEndsAfterTheDeleteLandsNothing() async throws {
        let j = FakeItemRunner.Journal()
        let device = HeldRunner("device", j, reply: AppSecondLookTests.powerBank)
        let reader = ItemReader(device: device, makeCloud: { _ in FakeItemRunner("cloud", journal: j, results: []) }, parse: { ParsedRead(read: $0) })
        let p = MemoryBoxPersistence()
        let m = model(p, FakeSignIn([.deleted]), try defaults(), reader: reader)
        let read = Task { await m.readPhoto(jpeg) }
        while !j.events.contains("device start") { await Task.yield() }
        #expect(await m.deleteEverything() == .done(signIn: .deleted))
        device.letGo()
        await read.value
        #expect(m.box?.items.isEmpty == true && m.lastCrop == nil && m.lastItemId == nil)
        #expect(!p.saved.contains { $0.boxId == m.box?.boxId })
    }

    /// A photo waiting for the cloud behind a slow read, from before the delete, never uploads, even after
    /// cloud checks are allowed again for the new box.
    @Test func aCloudReadQueuedBeforeTheDeleteNeverUploads() async throws {
        let j = FakeItemRunner.Journal()
        let powerBank = AppSecondLookTests.powerBank
        let device = HeldRunner("device", j, reply: powerBank)
        let reader = ItemReader(device: device,
                                makeCloud: { _ in FakeItemRunner("cloud", journal: j, results: [.success(ItemReply(read: powerBank, tokens: nil))]) },
                                parse: { ParsedRead(read: $0) })
        let m = model(MemoryBoxPersistence(), FakeSignIn([.deleted]), try defaults(), reader: reader, status: .wordsOnly)
        m.box?.setConsent(true)
        let words = Task { await m.readWords("LI-ION 3.7V 5000mAh") }
        while !j.events.contains("device start") { await Task.yield() }
        let photo = Task { await m.readPhoto(jpeg) }
        for _ in 0..<50 { await Task.yield() }
        #expect(await m.deleteEverything() == .done(signIn: .deleted))
        await m.answerConsent(true)
        device.letGo()
        await words.value
        await photo.value
        #expect(!j.events.contains("cloud start") && m.box?.items.isEmpty == true, "\(j.events)")
    }

    func defaults() throws -> UserDefaults { try #require(UserDefaults(suiteName: "delete-\(UUID().uuidString)")) }

    @Test func everythingIsDeletedInOrderAndANewBoxStarts() async throws {
        let p = MemoryBoxPersistence()
        let signIn = FakeSignIn([.deleted])
        let d = try defaults()
        let m = model(p, signIn, d)
        m.box?.setConsent(true)
        await m.readPhoto(jpeg)
        let oldId = try #require(m.box?.boxId)
        #expect(m.box?.items.count == 1 && d.string(forKey: AppModel.boxIdKey) == oldId)
        let result = await m.deleteEverything()
        #expect(result == .done(signIn: .deleted))
        #expect(p.deleted == [oldId] && signIn.deletes == 1)
        #expect(m.box?.items.isEmpty == true && m.box?.cloudConsent == nil && m.box?.boxId != oldId)
        #expect(d.string(forKey: AppModel.boxIdKey) == m.box?.boxId)
        #expect(m.pendingLookCount == 0 && m.lastCrop == nil && !m.signedIn)
    }

    /// An anonymous sign-in too old to delete without signing in again is signed out instead, as on the web.
    @Test func aSignInThatCannotBeDeletedNowIsSignedOut() async throws {
        let m = model(MemoryBoxPersistence(), FakeSignIn([.signedOut]), try defaults())
        #expect(await m.deleteEverything() == .done(signIn: .signedOut))
    }

    /// The box could not be deleted: nothing else is touched, the sign-in stays, and the items stay.
    @Test func aBoxThatCannotBeDeletedStopsBeforeTheSignIn() async throws {
        let p = MemoryBoxPersistence()
        p.failDeletes = true
        let signIn = FakeSignIn([])
        let m = model(p, signIn, try defaults())
        await m.readPhoto(jpeg)
        #expect(await m.deleteEverything() == .stopped(at: .box))
        #expect(signIn.deletes == 0 && m.box?.items.count == 1)
    }

    /// The sign-in could not be deleted: the box is already gone, and a retry starts at the sign-in.
    @Test func aSignInThatFailsIsTriedAgainFromThere() async throws {
        let p = MemoryBoxPersistence()
        let signIn = FakeSignIn([.failed, .deleted])
        let m = model(p, signIn, try defaults())
        await m.readPhoto(jpeg)
        #expect(await m.deleteEverything() == .stopped(at: .signIn))
        #expect(p.deleted.count == 1 && m.box?.items.isEmpty == true)
        #expect(await m.deleteEverything(from: .signIn) == .done(signIn: .deleted))
        #expect(p.deleted.count == 1 && signIn.deletes == 2)
    }

    /// The words, the web app's where it has them (src/pages/PackPage.tsx, src/ui/DeleteBoxPanel.tsx).
    @Test func theWordsSayWhatWasDeletedAndWhatIsLeft() throws {
        let web = try String(contentsOf: BoxStoreTests.repo.appendingPathComponent("src/pages/PackPage.tsx"), encoding: .utf8)
        #expect(web.contains(DeleteEverything.signedOutLine) && web.contains(DeleteEverything.signInDeletedLine))
        #expect(DeleteEverything.done(.deleted) == "Everything on this iPhone is deleted. So is your anonymous sign-in.")
        #expect(DeleteEverything.left(.box) == "Your box could not be fully deleted. Try again.")
        #expect(DeleteEverything.left(.signIn) == "Your box is deleted, but your anonymous sign-in could not be. Try again.")
    }
}
