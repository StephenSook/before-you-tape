import CryptoKit
import Foundation
import Testing
@testable import BYTCore

/// Pins the bundled engine's bridge: its function names, its version and its reply envelope, so a
/// change in the bridge fails here before it reaches a phone.
@Suite struct ContractTests {
    static let repo = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    func editionText() throws -> String { try String(contentsOf: Self.repo.appendingPathComponent("rules/edition.json"), encoding: .utf8) }

    @Test func theBridgeHasExactlyTheseFunctionsAndVersion() throws {
        let engine = try RulesEngine()
        #expect(engine.bridgeVersion == 1)
        #expect(engine.functionNames == ["canonicalEdition", "destinationHitsJson", "editionBodyCanonical", "evaluateBoxJson",
                                         "isNoItemJson", "itemReadContract", "labelTagsJson", "parseItemReadJson", "setEdition"])
    }

    /// A read of no item (a camera pointed at a room) is found by the web app's own check, and a
    /// read that is not a whole item read is refused rather than guessed.
    @Test func aReadOfNoItemIsFoundByTheWebAppsCheck() throws {
        let engine = try RulesEngine()
        func read(_ name: String, category: String = "other", evidence: String = "not_sure") -> JSONValue {
            .object(["itemName": .string(name), "category": .string(category), "labelText": .string(""), "volts": .number(0),
                     "milliampHours": .number(0), "wattHours": .number(0), "lithiumGrams": .number(0), "batteryWords": .bool(false),
                     "liquid": .bool(false), "pressurized": .bool(false), "alcoholOnLabel": .bool(false),
                     "flammableOnLabel": .bool(false), "glassContainer": .bool(false), "powder": .bool(false),
                     "retailBox": .string("cannot_tell"), "evidence": .string(evidence)])
        }
        #expect(try engine.isNoItem(read("unknown")))
        #expect(try engine.isNoItem(read("")))
        #expect(try !engine.isNoItem(read("Water bottle")))
        #expect(try !engine.isNoItem(read("unknown", evidence: "item_seen")))
        #expect(throws: EngineError.self) { try engine.isNoItem(.object(["itemName": .string("unknown")])) }
    }

    @Test func aCallBeforeAnEditionIsAnEngineErrorNotACrash() throws {
        let engine = try RulesEngine()
        #expect(throws: EngineError.engine(name: "NoEditionError", message: "no rule edition is loaded; call setEdition first")) {
            try engine.canonicalEdition()
        }
    }

    @Test func theEngineSaysWhichEditionIsLoaded() throws {
        let engine = try RulesEngine()
        #expect(engine.editionId == nil)
        let loaded = try engine.setEdition(editionText())
        #expect(engine.editionId == loaded.editionId)
        // A refused edition leaves the loaded one in force, and says so.
        #expect(throws: (any Error).self) { try engine.setEdition("{}") }
        #expect(engine.editionId == loaded.editionId)
    }

    @Test func theBundledEditionLoadsWithItsId() throws {
        let engine = try RulesEngine()
        let text = try editionText()
        let loaded = try engine.setEdition(text)
        // The shipped edition names itself; the bundled engine must load it as that edition.
        let shipped = try JSONDecoder().decode(JSONValue.self, from: Data(text.utf8))["editionId"]
        #expect(shipped == .string(loaded.editionId) && loaded.editionId.hasPrefix("byt-"))
        #expect(!loaded.destinationCodes.isEmpty)
    }

    /// The id is "byt-" plus the first 12 hex digits of SHA-256 over the canonical body. Swift
    /// hashes what JavaScriptCore produced, so the two engines must agree byte for byte.
    @Test func theEditionHashMatchesItsIdFromSwift() throws {
        let engine = try RulesEngine()
        let loaded = try engine.setEdition(editionText())
        let body = try engine.editionBodyCanonical()
        let hex = SHA256.hash(data: Data(body.utf8)).map { String(format: "%02x", $0) }.joined()
        #expect("byt-" + hex.prefix(12) == loaded.editionId)
    }

    @Test func theItemReadContractHasFieldsAndALabelCap() throws {
        let c = try RulesEngine().itemReadContract()
        guard case let .array(fields)? = c["fields"] else { Issue.record("no fields: \(c)"); return }
        #expect(fields.count >= 10)
        if case let .number(cap)? = c["labelTextMax"] { #expect(cap > 0) } else { Issue.record("no labelTextMax") }
    }

    @Test func badInputComesBackAsAnEngineError() throws {
        let engine = try RulesEngine()
        _ = try engine.setEdition(editionText())
        #expect(throws: EngineError.self) { try engine.evaluateBox(.object(["items": .string("not a list")])) }
    }
}
