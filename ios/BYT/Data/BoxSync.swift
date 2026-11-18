import BYTCore
import Foundation

/// Where the shared box lives (Firestore in the app, a fake in tests).
@MainActor
protocol BoxRemote: AnyObject {
    /// Writes one item document at `boxes/{boxId}/items/{itemId}`, or deletes it when `doc` is nil.
    func write(boxId: String, itemId: String, doc: JSONValue?) async throws
    /// Creates the box this iPhone owns.
    func createBox(boxId: String, doc: JSONValue) async throws
    /// Updates the box's own fields (country, cloud answer, counts), never who owns it.
    func updateBox(boxId: String, fields: JSONValue) async throws
}

extension BoxItem {
    /// The item as the shared document: label text emptied and left out of the corrections.
    var itemDoc: ItemDoc {
        let saved = forStorage
        var secondLook: ItemDoc.SecondLook?
        if case let .number(ms)? = self.secondLook?["ms"], case let .string(reason)? = self.secondLook?["reason"] {
            secondLook = ItemDoc.SecondLook(ms: ms, reason: reason)
        }
        return ItemDoc(itemId: itemId, read: saved.read, overrides: saved.overrides, answers: answers, quantity: quantity,
                       identityConfirmedBy: identityConfirmedBy, labelTags: labelTags, readSource: readSource, readMs: readMs,
                       secondLook: secondLook,
                       readFallback: readFallback.map { ItemDoc.Fallback(after: $0.rawValue, route: readFallbackRoute ?? "cloud_only") },
                       cropKey: cropKey, customs: customs ?? ItemDoc.emptyCustoms)
    }

    init(doc: ItemDoc) {
        self.init(itemId: doc.itemId, read: doc.read, overrides: doc.overrides, answers: doc.answers, quantity: doc.quantity,
                  identityConfirmedBy: doc.identityConfirmedBy, labelTags: doc.labelTags, readSource: doc.readSource, readMs: doc.readMs,
                  readFallback: doc.readFallback.flatMap { FallbackAfter(rawValue: $0.after) }, readFallbackRoute: doc.readFallback?.route,
                  secondLook: doc.secondLook.map { .object(["ms": .number($0.ms), "reason": .string($0.reason)]) },
                  customs: doc.customs, cropKey: doc.cropKey)
    }
}

/// Saves go to this iPhone's file first, then to the shared box.
final class SyncingPersistence: BoxPersistence, @unchecked Sendable {
    let local: BoxPersistence
    let sync: BoxSync

    init(local: BoxPersistence, sync: BoxSync) {
        self.local = local
        self.sync = sync
    }

    func save(_ snapshot: BoxSnapshot) {
        local.save(snapshot)
        MainActor.assumeIsolated { sync.snapshotSaved(snapshot) }
    }

    func load(boxId: String) -> BoxSnapshot? { local.load(boxId: boxId) }
}

/// Keeps the shared box in step with this iPhone: each changed item is written once under its own
/// id, a removed one is deleted, and writes that fail (no signal) wait for the next flush. The box
/// is created once with this iPhone as its owner; later only its own fields are updated.
@MainActor
final class BoxSync {
    private let remote: BoxRemote
    private let uid: () -> String?
    /// The rule edition the box's verdicts come from, written with the box.
    var editionId: () -> String = { "" }

    private var boxId: String?
    private var boxFields: [String: JSONValue] = [:]
    private var createdBox = false
    private var writtenBoxFields: JSONValue?
    private var written: [String: JSONValue] = [:]
    private var pending: [String: JSONValue?] = [:]
    private(set) var lastBoxUpdate: JSONValue?

    init(remote: BoxRemote, uid: @escaping () -> String?) {
        self.remote = remote
        self.uid = uid
    }

    var pendingCount: Int { pending.count }

    func snapshotSaved(_ s: BoxSnapshot) {
        boxId = s.boxId
        boxFields = ["destinationCode": .string(s.destinationCode), "editionId": .string(editionId()),
                     "cloudConsent": s.cloudConsent.map { .bool($0) } ?? .null,
                     "sources": .object(["onDevice": .number(Double(s.sources.onDevice)), "inCloud": .number(Double(s.sources.inCloud)),
                                         "secondLooks": .number(Double(s.sources.secondLooks)),
                                         "rulesOnlyRechecks": .number(Double(s.sources.rulesOnlyRechecks)),
                                         "cloudFallbacks": .number(Double(s.sources.cloudFallbacks))])]
        var current: [String: JSONValue] = [:]
        for item in s.items { current[item.itemId] = item.itemDoc.document }
        for (id, doc) in current where written[id] != doc { pending[id] = .some(doc) }
        for id in Set(written.keys).union(pending.keys) where current[id] == nil {
            if written[id] != nil { pending[id] = .some(nil) } else { pending[id] = nil }
        }
    }

    /// Sends what is waiting. Stops at the first failure, keeping the rest for the next flush.
    func flush() async {
        guard let boxId, let uid = uid() else { return }
        do {
            if !createdBox {
                var doc = boxFields
                doc["ownerUid"] = .string(uid)
                doc["memberUids"] = .array([.string(uid)])
                doc["joinKeyHash"] = .string("")
                try await remote.createBox(boxId: boxId, doc: .object(doc))
                createdBox = true
                writtenBoxFields = .object(boxFields)
            } else if writtenBoxFields != .object(boxFields) {
                try await remote.updateBox(boxId: boxId, fields: .object(boxFields))
                writtenBoxFields = .object(boxFields)
                lastBoxUpdate = .object(boxFields)
            }
            for id in pending.keys.sorted() {
                guard let doc = pending[id] else { continue }
                try await remote.write(boxId: boxId, itemId: id, doc: doc)
                if let doc { written[id] = doc } else { written[id] = nil }
                pending[id] = nil
            }
        } catch {
            // No signal or refused: everything not yet sent waits for the next flush.
        }
    }

    /// An item another device wrote: added to the box once, and not written back.
    func receive(_ doc: JSONValue, into store: BoxStore) {
        guard let item = try? ItemDoc(document: doc), !item.itemId.isEmpty else { return }
        written[item.itemId] = item.document
        store.mergeRemote(BoxItem(doc: item))
    }
}
