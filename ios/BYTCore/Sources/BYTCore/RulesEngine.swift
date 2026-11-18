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
    /// The item-read fields, their JSON schema and the label text cap.
    public func itemReadContract() throws -> JSONValue { try call("itemReadContract") }

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
