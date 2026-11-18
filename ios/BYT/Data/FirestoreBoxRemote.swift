import BYTCore
import FirebaseFirestore
import Foundation

extension JSONValue {
    /// The value as Firestore wants it: a whole number becomes an integer (the rules require an
    /// integer quantity), a fraction a double, null `NSNull`.
    var firestoreValue: Any {
        switch self {
        case .null: return NSNull()
        case let .bool(b): return b
        case let .number(n):
            if n.isFinite, n.rounded() == n, abs(n) < 9_007_199_254_740_992 { return Int64(n) }
            return n
        case let .string(s): return s
        case let .array(a): return a.map(\.firestoreValue)
        case let .object(o): return o.mapValues(\.firestoreValue)
        }
    }

    /// A Firestore value as JSON; anything without a JSON form (a timestamp, a reference) is left out.
    init?(firestore value: Any) {
        switch value {
        case is NSNull: self = .null
        case let n as NSNumber:
            self = CFGetTypeID(n) == CFBooleanGetTypeID() ? .bool(n.boolValue) : .number(n.doubleValue)
        case let s as String: self = .string(s)
        case let a as [Any]: self = .array(a.compactMap { JSONValue(firestore: $0) })
        case let o as [String: Any]: self = .object(o.compactMapValues { JSONValue(firestore: $0) })
        default: return nil
        }
    }
}

/// The shared box in Firestore. Writes go into Firestore's offline cache and return at once, so a
/// phone out of signal never waits; the cache sends them when the network returns. A write the
/// server refuses is reported through `onProblem`.
@MainActor
final class FirestoreBoxRemote: BoxRemote {
    private let db: Firestore
    var onProblem: ((String) -> Void)?

    init(db: Firestore = Firestore.firestore()) { self.db = db }

    private func box(_ id: String) -> DocumentReference { db.collection("boxes").document(id) }

    private func report(_ error: (any Error)?) {
        guard let error else { return }
        let text = "The shared box refused a change: \(error.localizedDescription)"
        Task { @MainActor [weak self] in self?.onProblem?(text) }
    }

    func write(boxId: String, itemId: String, doc: JSONValue?) async throws {
        let ref = box(boxId).collection("items").document(itemId)
        if case let .object(o)? = doc {
            ref.setData(o.mapValues(\.firestoreValue)) { [weak self] in self?.report($0) }
        } else {
            ref.delete { [weak self] in self?.report($0) }
        }
    }

    func createBox(boxId: String, doc: JSONValue) async throws {
        guard case let .object(o) = doc else { return }
        box(boxId).setData(o.mapValues(\.firestoreValue)) { [weak self] in self?.report($0) }
    }

    func updateBox(boxId: String, fields: JSONValue) async throws {
        guard case let .object(o) = fields else { return }
        box(boxId).setData(o.mapValues(\.firestoreValue), merge: true) { [weak self] in self?.report($0) }
    }

    func watch(boxId: String, onItem: @escaping @MainActor (JSONValue) -> Void) -> (() -> Void)? {
        let registration = box(boxId).collection("items").addSnapshotListener { snapshot, _ in
            guard let snapshot else { return }
            let docs = snapshot.documentChanges.filter { $0.type != .removed }.compactMap { JSONValue(firestore: $0.document.data()) }
            Task { @MainActor in docs.forEach(onItem) }
        }
        return { registration.remove() }
    }
}
