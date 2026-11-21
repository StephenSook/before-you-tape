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
                                         "isNoItemJson", "itemReadContract", "labelTagsJson", "mergeSecondLookJson", "parseItemReadJson",
                                         "parseItemReadTaggedJson", "secondLookReasonJson", "setEdition"])
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

    /// A read's tags come from its whole label, before the parser clips the text it keeps: a hazard
    /// word past the cap counts, and a cut that ends "FLAMMABLE-FREE" at "FLAMMABLE" never makes one.
    @Test func aParsedReadIsTaggedFromItsWholeLabel() throws {
        let engine = try RulesEngine()
        _ = try engine.setEdition(editionText())
        func parsed(_ label: String) throws -> (read: JSONValue, tags: [String]) {
            let reply: JSONValue = .object(["itemName": .string("Lotion"), "category": .string("lotion_cream"), "labelText": .string(label),
                "volts": .number(0), "milliampHours": .number(0), "wattHours": .number(0), "lithiumGrams": .number(0),
                "batteryWords": .bool(false), "liquid": .bool(true), "pressurized": .bool(false), "alcoholOnLabel": .bool(false),
                "flammableOnLabel": .bool(false), "glassContainer": .bool(false), "powder": .bool(false),
                "retailBox": .string("sealed"), "evidence": .string("label_read")])
            let text = String(decoding: try JSONEncoder().encode(reply), as: UTF8.self)
            let value = try engine.parseItemReadTagged(text)
            return (value.read, value.labelTags)
        }
        func level(_ p: (read: JSONValue, tags: [String])) throws -> String? {
            let item: JSONValue = .object(["itemId": .string("a"), "read": p.read, "overrides": .object([:]), "answers": .object([:]),
                                           "quantity": .number(1), "identityConfirmedBy": .null, "labelTags": .array(p.tags.map { .string($0) })])
            let result = try engine.evaluateBox(.object(["items": .array([item]), "code": .string("CA"), "today": .string("2026-11-20")]))
            if case let .string(l)? = result["items"]?["a"]?["level"] { return l }
            return nil
        }
        let x = { (n: Int) in String(repeating: "x", count: n) }
        // The same lotion with no hazard word is OK, so the checks below are not vacuous.
        #expect(try level(parsed(x(155) + " LOTION")) == "ok")
        let past = try parsed(x(155) + " FLAMMABLE")
        if case let .string(shown)? = past.read["labelText"] { #expect(shown.count == 160 && !shown.contains("FLAMMABLE")) } else { Issue.record("no label") }
        #expect(past.tags.contains("flammable") && past.tags.contains("label_text"))
        #expect(try level(past) != "ok")
        let cut = try parsed(x(150) + " FLAMMABLE-FREE LOTION")
        #expect(!cut.tags.contains("flammable"))
        #expect(try level(cut) == "ok")
    }

    /// A whole read with the web app's defaults, changed by `fields`.
    static func read(_ fields: [String: JSONValue]) -> JSONValue {
        var base: [String: JSONValue] = ["itemName": .string("Item"), "category": .string("other"), "labelText": .string(""),
            "volts": .number(0), "milliampHours": .number(0), "wattHours": .number(0), "lithiumGrams": .number(0),
            "batteryWords": .bool(false), "liquid": .bool(false), "pressurized": .bool(false), "alcoholOnLabel": .bool(false),
            "flammableOnLabel": .bool(false), "glassContainer": .bool(false), "powder": .bool(false),
            "retailBox": .string("cannot_tell"), "evidence": .string("label_read")]
        for (k, v) in fields { base[k] = v }
        return .object(base)
    }

    static func item(_ read: JSONValue, tags: [String] = []) -> JSONValue {
        .object(["itemId": .string("a"), "read": read, "overrides": .object([:]), "answers": .object([:]), "quantity": .number(1),
                 "identityConfirmedBy": .null, "labelTags": .array(tags.map { .string($0) })])
    }

    /// The web app's second-look rule, through the bundled engine: only a read on the device qualifies,
    /// the policy can turn a reason off, and a malformed policy is an engine error, never every reason on.
    @Test func theEngineGivesTheSecondLookReason() throws {
        let engine = try RulesEngine()
        _ = try engine.setEdition(editionText())
        let powerBank = Self.item(Self.read(["category": .string("power_bank"), "volts": .number(3.7), "milliampHours": .number(10000),
                                             "wattHours": .number(37), "batteryWords": .bool(true)]))
        #expect(try engine.secondLookReason(item: powerBank, source: "on_device") == "battery_numbers")
        #expect(try engine.secondLookReason(item: powerBank, source: "in_cloud") == nil)
        let off: JSONValue = .object(["whMismatch": .bool(false), "batteryNumbers": .bool(false), "notSure": .bool(false),
                                      "hazardNoLabel": .bool(false), "identity": .bool(false)])
        #expect(try engine.secondLookReason(item: powerBank, source: "on_device", policy: off) == nil)
        let label = "SHEA BODY LOTION"
        guard case let .array(tags) = try engine.labelTags(label) else { Issue.record("no tags"); return }
        let lotion = Self.item(Self.read(["category": .string("lotion_cream"), "labelText": .string(label), "liquid": .bool(true)]),
                               tags: tags.compactMap { if case let .string(s) = $0 { s } else { nil } })
        #expect(try engine.secondLookReason(item: lotion, source: "on_device") == nil)
        #expect(throws: EngineError.self) {
            try engine.secondLookReason(item: powerBank, source: "on_device", policy: .object(["batteryNumbers": .string("no")]))
        }
    }

    /// The second look's merge through the bundled engine: the read with more watt-hours keeps its battery
    /// numbers, any hazard either read saw stays, the weaker evidence wins, and each disagreement is listed.
    @Test func theEngineMergesASecondLook() throws {
        let engine = try RulesEngine()
        _ = try engine.setEdition(editionText())
        let device = Self.read(["category": .string("power_bank"), "volts": .number(3.7), "milliampHours": .number(10000),
                                "batteryWords": .bool(true), "retailBox": .string("sealed")])
        let cloud = Self.read(["category": .string("power_bank"), "volts": .number(3.7), "milliampHours": .number(20000),
                               "wattHours": .number(74), "batteryWords": .bool(true), "liquid": .bool(true),
                               "retailBox": .string("open_or_none"), "evidence": .string("item_seen")])
        let out = try engine.mergeSecondLook(device: device, cloud: cloud)
        #expect(out.merged["wattHours"] == .number(74) && out.merged["milliampHours"] == .number(20000))
        #expect(out.merged["liquid"] == .bool(true) && out.merged["retailBox"] == .string("open_or_none"))
        #expect(out.merged["evidence"] == .string("item_seen"))
        guard case let .object(disputes) = out.disputes else { Issue.record("no disputes"); return }
        #expect(Set(disputes.keys) == ["battery", "liquid", "retailBox", "evidence"])
        #expect(out.sameCategory)
        #expect(try !engine.mergeSecondLook(device: device, cloud: Self.read(["category": .string("phone")])).sameCategory)
        #expect(throws: EngineError.self) { try engine.mergeSecondLook(device: device, cloud: Self.read(["volts": .number(-1)])) }
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
