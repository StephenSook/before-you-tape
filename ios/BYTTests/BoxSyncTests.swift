import BYTCore
import Foundation
import Testing
@testable import BYT

/// A remote that records writes and can be made to fail, like a phone out of signal.
@MainActor
final class FakeBoxRemote: BoxRemote {
    var writes: [(path: String, doc: JSONValue?)] = []
    var boxes: [String: JSONValue] = [:]
    var failing = false
    struct Offline: Error {}
    func write(boxId: String, itemId: String, doc: JSONValue?) async throws {
        if failing { throw Offline() }
        writes.append(("boxes/\(boxId)/items/\(itemId)", doc))
    }
    var boxUpdates: [JSONValue] = []
    func createBox(boxId: String, doc: JSONValue) async throws {
        if failing { throw Offline() }
        boxes[boxId] = doc
    }
    func updateBox(boxId: String, fields: JSONValue) async throws {
        if failing { throw Offline() }
        boxUpdates.append(fields)
    }
    var watchCalls = 0
    func watch(boxId: String, onItem: @escaping @MainActor (JSONValue) -> Void) -> (() -> Void)? {
        watchCalls += 1
        return nil
    }
}

@MainActor
@Suite struct BoxSyncTests {
    func store(_ sync: BoxSync) throws -> BoxStore {
        let engine = try RulesEngine()
        _ = try engine.setEdition(String(contentsOf: BoxStoreTests.repo.appendingPathComponent("rules/edition.json"), encoding: .utf8))
        var n = 0
        return BoxStore(engine: engine, persistence: SyncingPersistence(local: MemoryBoxPersistence(), sync: sync), today: { "2026-11-20" },
                        newId: { n += 1; return "id-\(n)" }, now: { 1000 }, boxId: "box-1")
    }

    func outcome(_ read: JSONValue, _ source: ReadPath) -> ReadOutcome {
        ReadOutcome(read: read, source: source, route: .hybrid, failure: nil, records: [])
    }

    @Test func itemsAreWrittenOnceUnderTheirOwnIdWithNoLabelText() async throws {
        let remote = FakeBoxRemote()
        let sync = BoxSync(remote: remote, uid: { "u1" })
        let s = try store(sync)
        let id = try #require(s.addRead(outcome(BoxStoreTests.perfume, .onDevice), cropFile: nil))
        s.setConsent(true)
        await sync.flush()
        let mine = remote.writes.filter { $0.path == "boxes/box-1/items/\(id)" }
        #expect(mine.count == 1)
        let doc = try #require(mine.first?.doc)
        #expect(doc["read"]?["labelText"] == .string("") && doc["readSource"] == .string("phone_on_device"))
        #expect(doc["labelTags"].map { if case let .array(a) = $0 { a.contains(.string("alcohol")) } else { false } } == true)
        await sync.flush()
        #expect(remote.writes.count == 1)
    }

    @Test func aCloudReadIsWrittenAsPhoneCloudAndARemovedItemIsDeleted() async throws {
        let remote = FakeBoxRemote()
        let sync = BoxSync(remote: remote, uid: { "u1" })
        let s = try store(sync)
        let id = try #require(s.addRead(outcome(BoxStoreTests.shirt, .cloud), cropFile: nil))
        await sync.flush()
        #expect(remote.writes.last?.doc?["readSource"] == .string("phone_cloud"))
        s.remove(id)
        await sync.flush()
        #expect(remote.writes.last?.path == "boxes/box-1/items/\(id)" && remote.writes.last?.doc == nil)
    }

    @Test func anItemAddedOfflineIsWrittenWhenTheNetworkReturns() async throws {
        let remote = FakeBoxRemote()
        remote.failing = true
        let sync = BoxSync(remote: remote, uid: { "u1" })
        let s = try store(sync)
        let id = s.addManual(BoxStoreTests.lotion)
        await sync.flush()
        #expect(remote.writes.isEmpty && sync.pendingCount == 1)
        remote.failing = false
        await sync.flush()
        #expect(remote.writes.map(\.path) == ["boxes/box-1/items/\(id)"] && sync.pendingCount == 0)
    }

    @Test func thePhoneCreatesItsOwnBoxOnceAsItsOwner() async throws {
        let remote = FakeBoxRemote()
        let sync = BoxSync(remote: remote, uid: { "u1" })
        let s = try store(sync)
        s.addManual(BoxStoreTests.lotion)
        await sync.flush()
        let box = try #require(remote.boxes["box-1"])
        #expect(box["ownerUid"] == .string("u1") && box["memberUids"] == .array([.string("u1")]) && box["joinKeyHash"] == .string(""))
        #expect(box["destinationCode"] == .string("CA") && box["cloudConsent"] == .null)
        // Later changes update the box's own fields only, never who owns it.
        s.setDestination("PH")
        await sync.flush()
        let update = try #require(sync.lastBoxUpdate)
        #expect(update["destinationCode"] == .string("PH") && update["ownerUid"] == nil && update["memberUids"] == nil)
        #expect(remote.boxUpdates.count == 1)
    }

    @Test func aRemoteItemFromTheLaptopAppearsOnceAndSaysWhereItWasRead() throws {
        let sync = BoxSync(remote: FakeBoxRemote(), uid: { "u1" })
        let s = try store(sync)
        let laptop = ItemDoc(itemId: "laptop-1", read: BoxStoreTests.shirt, readSource: "on_device", readMs: 800)
        sync.receive(laptop.document, into: s)
        sync.receive(laptop.document, into: s)
        #expect(s.items.map(\.itemId) == ["laptop-1"])
        #expect(SourceGlyph.text(s.items[0].readSource) == "Read on a laptop")
        // Received, not written back.
        #expect(sync.pendingCount == 0)
    }

    /// In the app, a change to the box reaches the shared box with no extra step, and whole numbers
    /// are sent as integers (the rules want an integer quantity).
    @Test func theAppSyncsItsBoxAfterEachChange() async throws {
        let remote = FakeBoxRemote()
        let model = AppModel(signIn: SignIn(isSignedIn: { true }, attempt: { true }), persistence: MemoryBoxPersistence(),
                             remote: remote, uid: { "u1" })
        let id = try #require(model.box).addManual(BoxStoreTests.lotion)
        await model.syncNow()
        #expect(remote.writes.map(\.path).contains { $0.hasSuffix("/items/\(id)") })
        #expect(JSONValue.number(3).firestoreValue as? Int64 == 3 && JSONValue.number(2.5).firestoreValue as? Double == 2.5)
    }

    @Test func withNoRemoteTheBoxStaysOnThisIPhone() async throws {
        let model = AppModel(signIn: SignIn(isSignedIn: { true }, attempt: { true }), persistence: MemoryBoxPersistence())
        model.box?.addManual(BoxStoreTests.lotion)
        await model.syncNow()
        #expect(model.syncProblem == nil)
    }

    /// The rules let only members read a box, so the app listens only once its box exists.
    @Test func theAppListensForOtherDevicesOnlyOnceItsBoxExists() async throws {
        let remote = FakeBoxRemote()
        let model = AppModel(signIn: SignIn(isSignedIn: { true }, attempt: { true }), persistence: MemoryBoxPersistence(),
                             remote: remote, uid: { "u1" })
        await model.syncNow()
        #expect(remote.boxes.isEmpty && remote.watchCalls == 0)
        model.box?.addManual(BoxStoreTests.lotion)
        await model.syncNow()
        #expect(remote.boxes.count == 1 && remote.watchCalls == 1)
        await model.syncNow()
        #expect(remote.watchCalls == 1)
    }
}
