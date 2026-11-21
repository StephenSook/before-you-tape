import Foundation
import JavaScriptCore

public enum EngineError: Error, Equatable, Sendable {
    /// The bundled script is missing from the package.
    case noBundle
    /// The script did not load, or it defines no `BYT` global.
    case notLoaded(String)
    /// The engine answered `{"ok":false,"error":{name,message}}`.
    case engine(name: String, message: String)
    /// The engine's answer was not the expected JSON envelope.
    case badReply(String)
}

/// The web app's own rules engine, run in JavaScriptCore. The bundled script defines one global,
/// `BYT`, whose functions take and return JSON text and never throw; every answer is
/// `{"ok":true,"value":...}` or `{"ok":false,"error":{"name","message"}}`. A model never
/// decides a verdict: every verdict on the phone comes from here.
public final class RulesEngine: @unchecked Sendable {
    public struct LoadedEdition: Sendable, Equatable {
        public let editionId: String
        public let destinationCodes: [String]
    }

    public let bridgeVersion: Int
    /// The bridge's function names, sorted.
    public let functionNames: [String]

    private let context: JSContext
    private let bridge: JSValue
    private let lock = NSLock()
    private let errors = ErrorBox()
    private let loaded = LoadedBox()

    final class LoadedBox: @unchecked Sendable { var id: String? }

    /// The id of the edition in force: nil before the first edition loads; a refused edition leaves it as it was.
    public var editionId: String? { lock.withLock { loaded.id } }

    final class ErrorBox: @unchecked Sendable { var last: String? }

    public init(script: String? = nil) throws {
        let source: String
        if let script { source = script } else {
            guard let url = Bundle.module.url(forResource: "byt-engine", withExtension: "js"),
                  let text = try? String(contentsOf: url, encoding: .utf8) else { throw EngineError.noBundle }
            source = text
        }
        guard let context = JSContext() else { throw EngineError.notLoaded("JavaScriptCore gave no context") }
        let errors = errors
        context.exceptionHandler = { _, exception in errors.last = exception?.toString() ?? "unknown exception" }
        context.evaluateScript(source)
        if let thrown = errors.last { throw EngineError.notLoaded(thrown) }
        guard let bridge = context.objectForKeyedSubscript("BYT"), bridge.isObject else {
            throw EngineError.notLoaded("the script defines no BYT global")
        }
        let names = context.evaluateScript("Object.keys(BYT).filter(function (k) { return typeof BYT[k] === 'function'; }).sort()")
        self.context = context
        self.bridge = bridge
        self.bridgeVersion = Int(bridge.forProperty("BRIDGE_VERSION")?.toInt32() ?? 0)
        self.functionNames = (names?.toArray() as? [String]) ?? []
    }

    // MARK: The bridge's functions

    public func setEdition(_ editionJson: String) throws -> LoadedEdition {
        let v = try call("setEdition", editionJson)
        guard case let .string(id)? = v["editionId"], case let .array(destinations)? = v["destinations"] else {
            throw EngineError.badReply("setEdition: \(v)")
        }
        let codes = destinations.compactMap { d -> String? in if case let .string(c)? = d["code"] { c } else { nil } }
        lock.withLock { loaded.id = id }
        return LoadedEdition(editionId: id, destinationCodes: codes)
    }

    public func canonicalEdition() throws -> String { try string(call("canonicalEdition")) }
    public func editionBodyCanonical() throws -> String { try string(call("editionBodyCanonical")) }

    /// Input `{ items, code, today, live? }`; value: the box result.
    public func evaluateBox(_ input: JSONValue) throws -> JSONValue { try call("evaluateBoxJson", json(input)) }
    /// Input `{ facts, answers, code }`; value: the rule hits.
    public func destinationHits(_ input: JSONValue) throws -> JSONValue { try call("destinationHitsJson", json(input)) }
    /// The engine's tags for one label text (the argument is the text itself).
    public func labelTags(_ labelText: String) throws -> JSONValue { try call("labelTagsJson", labelText) }
    /// A model's reply checked by the same parser the web app uses.
    public func parseItemRead(_ replyText: String) throws -> JSONValue { try call("parseItemReadJson", replyText) }
    /// The same parser, with the engine's tags for the reply's whole label: the read keeps clipped label
    /// text, and the tags come from the text before the cut. Save these as the item's labelTags; never tag
    /// the clipped text.
    public func parseItemReadTagged(_ replyText: String) throws -> (read: JSONValue, labelTags: [String]) {
        let value = try call("parseItemReadTaggedJson", replyText)
        guard let read = value["read"], case let .array(tags)? = value["labelTags"] else {
            throw EngineError.badReply("parseItemReadTaggedJson: no read or tags")
        }
        let strings = tags.compactMap { if case let .string(s) = $0 { s } else { nil } }
        guard strings.count == tags.count else { throw EngineError.badReply("parseItemReadTaggedJson: a tag is not a string") }
        return (read, strings)
    }
    /// The item-read fields, their JSON schema and the label text cap.
    public func itemReadContract() throws -> JSONValue { try call("itemReadContract") }
    /// True for a read of no item (a camera pointed at a room), by the web app's own check; a read
    /// that is not a whole item read is an engine error.
    public func isNoItem(_ read: JSONValue) throws -> Bool {
        guard case let .bool(answer) = try call("isNoItemJson", json(read)) else { throw EngineError.badReply("isNoItemJson: not a bool") }
        return answer
    }

    /// Whether an item just added from a read gets a cloud second look, by the web app's own rule on the
    /// edition in force. `source` is the read's path ("on_device" qualifies; any other does not). A nil
    /// policy means every reason on, the web app's default. Nil when no reason applies.
    public func secondLookReason(item: JSONValue, source: String, policy: JSONValue? = nil) throws -> String? {
        var input: [String: JSONValue] = ["item": item, "source": .string(source)]
        if let policy { input["policy"] = policy }
        switch try call("secondLookReasonJson", json(.object(input)))["reason"] {
        case let .string(reason)?: return reason
        case .null?: return nil
        default: throw EngineError.badReply("secondLookReasonJson: no reason")
        }
    }

    /// A cloud second look of the same photo merged with the on-device read, by the web app's rule: the
    /// cautious merge, the facts the two reads dispute (label words are the caller's to compare, from each
    /// read's tags), and whether both reads saw the same category.
    public func mergeSecondLook(device: JSONValue, cloud: JSONValue) throws -> (merged: JSONValue, disputes: JSONValue, sameCategory: Bool) {
        let value = try call("mergeSecondLookJson", json(.object(["device": device, "cloud": cloud])))
        guard let merged = value["merged"], let disputes = value["disputes"], case let .bool(same)? = value["sameCategory"] else {
            throw EngineError.badReply("mergeSecondLookJson: no merge, disputes or sameCategory")
        }
        return (merged, disputes, same)
    }

    // MARK: Plumbing

    private func call(_ name: String, _ argument: String? = nil) throws -> JSONValue {
        lock.lock()
        defer { lock.unlock() }
        errors.last = nil
        guard let fn = bridge.forProperty(name), fn.isObject else { throw EngineError.badReply("no function \(name)") }
        let result = fn.call(withArguments: argument.map { [$0] } ?? [])
        if let thrown = errors.last { throw EngineError.badReply("\(name) threw: \(thrown)") }
        guard let text = result?.toString(), let envelope = try? JSONDecoder().decode(JSONValue.self, from: Data(text.utf8)) else {
            throw EngineError.badReply("\(name) returned no JSON")
        }
        switch envelope["ok"] {
        case .bool(true)?:
            return envelope["value"] ?? .null
        case .bool(false)?:
            let name = { if case let .string(s)? = envelope["error"]?["name"] { s } else { "Error" } }()
            let message = { if case let .string(s)? = envelope["error"]?["message"] { s } else { "" } }()
            throw EngineError.engine(name: name, message: message)
        default:
            throw EngineError.badReply("\(name): no ok field")
        }
    }

    private func string(_ v: JSONValue) throws -> String {
        guard case let .string(s) = v else { throw EngineError.badReply("expected text, got \(v)") }
        return s
    }

    private func json(_ v: JSONValue) throws -> String {
        String(decoding: try JSONEncoder().encode(v), as: UTF8.self)
    }
}
