import Foundation

/// One box item as the shared Firestore document `boxes/{boxId}/items/{itemId}`
/// (tests/contracts/box-docs.json), the shape the web app writes and firestore.rules enforces.
/// The document never holds label text: the read's is emptied and a corrected one is left out.
public struct ItemDoc: Equatable, Sendable {
    public struct SecondLook: Equatable, Sendable {
        public var ms: Double
        public var reason: String
        public init(ms: Double, reason: String) { self.ms = ms; self.reason = reason }
    }

    /// The fallback model's read: the status that sent the read there, and its route.
    public struct Fallback: Equatable, Sendable {
        public var after: String
        public var route: String
        public init(after: String, route: String) { self.after = after; self.route = route }
    }

    public enum DecodeError: Error, Equatable { case field(String) }

    public var itemId: String
    public var read: JSONValue
    public var overrides: [String: JSONValue]
    public var answers: [String: String]
    public var quantity: Int
    public var identityConfirmedBy: String?
    public var labelTags: [String]
    public var readSource: String
    public var readMs: Double
    public var secondLook: SecondLook?
    public var readFallback: Fallback?
    public var cropKey: String?
    public var customs: JSONValue

    /// The web app's empty customs line.
    public static let emptyCustoms: JSONValue = .object([
        "description": .string(""), "lintOk": .bool(false), "weightOz": .null, "valueUsd": .null, "countryOfOrigin": .null, "upc": .null,
    ])

    public init(itemId: String, read: JSONValue, overrides: [String: JSONValue] = [:], answers: [String: String] = [:], quantity: Int = 1,
                identityConfirmedBy: String? = nil, labelTags: [String] = [], readSource: String, readMs: Double,
                secondLook: SecondLook? = nil, readFallback: Fallback? = nil, cropKey: String? = nil, customs: JSONValue = ItemDoc.emptyCustoms) {
        (self.itemId, self.read, self.overrides, self.answers, self.quantity) = (itemId, read, overrides, answers, quantity)
        (self.identityConfirmedBy, self.labelTags, self.readSource, self.readMs) = (identityConfirmedBy, labelTags, readSource, readMs)
        (self.secondLook, self.readFallback, self.cropKey, self.customs) = (secondLook, readFallback, cropKey, customs)
    }

    /// The document as stored.
    public var document: JSONValue {
        var r: [String: JSONValue] = [:]
        if case let .object(o) = read { r = o }
        r["labelText"] = .string("")
        var fixes = overrides
        fixes["labelText"] = nil
        var d: [String: JSONValue] = [
            "itemId": .string(itemId), "read": .object(r), "overrides": .object(fixes),
            "answers": .object(answers.mapValues { .string($0) }), "quantity": .number(Double(quantity)),
            "identityConfirmedBy": identityConfirmedBy.map { .string($0) } ?? .null,
            "labelTags": .array(labelTags.map { .string($0) }), "readSource": .string(readSource), "readMs": .number(readMs),
            "secondLook": secondLook.map { .object(["ms": .number($0.ms), "reason": .string($0.reason)]) } ?? .null,
            "cropKey": cropKey.map { .string($0) } ?? .null, "customs": customs,
        ]
        if let f = readFallback { d["readFallback"] = .object(["after": .string(f.after), "route": .string(f.route)]) }
        return .object(d)
    }

    public init(document doc: JSONValue) throws {
        func string(_ k: String) throws -> String {
            guard case let .string(s)? = doc[k] else { throw DecodeError.field(k) }
            return s
        }
        guard case let .object(o) = doc else { throw DecodeError.field("document") }
        guard let read = o["read"], case .object = read else { throw DecodeError.field("read") }
        guard case let .object(fixes)? = o["overrides"] else { throw DecodeError.field("overrides") }
        guard case let .object(rawAnswers)? = o["answers"] else { throw DecodeError.field("answers") }
        var answers: [String: String] = [:]
        for (k, v) in rawAnswers {
            guard case let .string(s) = v else { throw DecodeError.field("answers") }
            answers[k] = s
        }
        guard case let .number(q)? = o["quantity"], let quantity = Int(exactly: q) else { throw DecodeError.field("quantity") }
        var confirmed: String?
        switch o["identityConfirmedBy"] {
        case .null?, nil: confirmed = nil
        case let .string(s)?: confirmed = s
        default: throw DecodeError.field("identityConfirmedBy")
        }
        guard case let .array(rawTags)? = o["labelTags"] else { throw DecodeError.field("labelTags") }
        let tags = try rawTags.map { v -> String in
            guard case let .string(s) = v else { throw DecodeError.field("labelTags") }
            return s
        }
        var readMs = 0.0
        if let v = o["readMs"] {
            guard case let .number(n) = v else { throw DecodeError.field("readMs") }
            readMs = n
        }
        var secondLook: SecondLook?
        if case let .object(s)? = o["secondLook"] {
            guard case let .number(ms)? = s["ms"], case let .string(reason)? = s["reason"] else { throw DecodeError.field("secondLook") }
            secondLook = SecondLook(ms: ms, reason: reason)
        }
        var fallback: Fallback?
        if let v = o["readFallback"] {
            guard case let .string(after)? = v["after"], case let .string(route)? = v["route"] else { throw DecodeError.field("readFallback") }
            fallback = Fallback(after: after, route: route)
        }
        var cropKey: String?
        if case let .string(k)? = o["cropKey"] { cropKey = k }
        self.init(itemId: o["itemId"].flatMap { if case let .string(s) = $0 { s } else { nil } } ?? "", read: read, overrides: fixes,
                  answers: answers, quantity: quantity, identityConfirmedBy: confirmed, labelTags: tags, readSource: try string("readSource"),
                  readMs: readMs, secondLook: secondLook, readFallback: fallback, cropKey: cropKey, customs: o["customs"] ?? ItemDoc.emptyCustoms)
    }
}
