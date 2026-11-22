import Foundation
import Testing
@testable import BYTCore

/// The same shared vectors the web engine and the Android client pass, run through the bundled
/// engine in JavaScriptCore, with the same defaults merged in the same way as the bridge's own
/// TypeScript test (src/embed/bridge.test.ts).
@Suite struct VectorTests {
    static let repo = ContractTests.repo
    func load(_ path: String) throws -> JSONValue {
        try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: Self.repo.appendingPathComponent(path)))
    }

    /// `{ ...a, ...b }`: b's keys win.
    func merged(_ a: JSONValue?, _ b: JSONValue?) -> JSONValue {
        var out: [String: JSONValue] = [:]
        if case let .object(o)? = a { out = o }
        if case let .object(o)? = b { for (k, v) in o { out[k] = v } }
        return .object(out)
    }

    func ruleIds(_ hits: JSONValue?) -> [String] {
        guard case let .array(a)? = hits else { return [] }
        return a.compactMap { if case let .string(s)? = $0["ruleId"] { s } else { nil } }
    }

    func checkBox(_ v: JSONValue, engine: RulesEngine, defaults: JSONValue) throws {
        guard case let .string(name)? = v["name"], case let .array(items)? = v["items"] else { Issue.record("shape"); return }
        let built: [JSONValue] = items.map { i in
            var item = merged(defaults["itemDefaults"], i)
            if case var .object(o) = item { o["read"] = merged(defaults["baseRead"], i["read"]); item = .object(o) }
            return item
        }
        let r = try engine.evaluateBox(.object(["items": .array(built), "code": v["code"] ?? .null, "today": v["today"] ?? .null]))
        if case let .object(expect)? = v["expect"] {
            for (id, level) in expect { #expect(r["items"]?[id]?["level"] == level, "\(name) \(id)") }
        }
        if case let .object(rules)? = v["expectRules"] {
            for (id, want) in rules {
                guard case let .array(ids) = want else { continue }
                let got = Set(ruleIds(r["items"]?[id]?["hits"]))
                for case let .string(rule) in ids { #expect(got.contains(rule), "\(name) \(id) lacks \(rule)") }
            }
        }
        if case let .object(rules)? = v["notRules"] {
            for (id, bad) in rules {
                guard case let .array(ids) = bad else { continue }
                let got = Set(ruleIds(r["items"]?[id]?["hits"]))
                for case let .string(rule) in ids { #expect(!got.contains(rule), "\(name) \(id) has \(rule)") }
            }
        }
        if let lithium = v["expectLithium"] { #expect(r["lithium"]?["status"] == lithium, "\(name) lithium") }
        if case let .object(qs)? = v["expectQuestion"] {
            for (id, q) in qs { #expect(r["items"]?[id]?["question"]?["id"] == q, "\(name) \(id) question") }
        }
    }

    @Test func everySharedVectorPassesInJavaScriptCore() throws {
        let engine = try RulesEngine()
        _ = try engine.setEdition(String(contentsOf: Self.repo.appendingPathComponent("rules/edition.json"), encoding: .utf8))
        let defaults = try load("tests/vectors/defaults.json")
        guard case let .array(boxes) = try load("tests/vectors/box.json"),
              case let .array(guards) = try load("tests/vectors/box-guards.json"),
              case let .array(destinations) = try load("tests/vectors/destinations.json") else { Issue.record("vectors"); return }
        #expect(boxes.count >= 20 && guards.count >= 64 && destinations.count >= 21)
        for v in boxes { try checkBox(v, engine: engine, defaults: defaults) }
        for g in guards {
            guard case let .object(expect)? = g["expect"], case let .array(items)? = g["items"] else { Issue.record("guard shape"); continue }
            let ids = items.compactMap { if case let .string(s)? = $0["itemId"] { s } else { nil } }
            #expect(expect.keys.sorted() == ids.sorted(), "guard pins a verdict for each item")
            try checkBox(g, engine: engine, defaults: defaults)
        }
        for v in destinations {
            var facts = merged(defaults["baseFacts"], nil)
            if case var .object(o) = facts { o["tags"] = v["tags"] ?? .array([]); facts = .object(o) }
            let hits = try engine.destinationHits(.object(["facts": facts, "answers": .object([:]), "code": v["code"] ?? .null]))
            guard case let .array(list) = hits else { Issue.record("hits"); continue }
            let got = JSONValue.array(list.map { .object(["ruleId": $0["ruleId"] ?? .null, "level": $0["level"] ?? .null]) })
            #expect(got == v["expect"], "\(String(describing: v["name"]))")
        }
    }

    /// The figures an item keeps from its labels, decided by the engine's labelFiguresJson: the same
    /// shared cases the web engine and the bridge's TypeScript test pass. A null expect means the item
    /// leaves the field out, which the Swift call gives as nil.
    @Test func everyLabelFiguresVectorPassesInJavaScriptCore() throws {
        let engine = try RulesEngine()
        guard case let .array(cases) = try load("tests/vectors/labelFigures.json") else { Issue.record("vectors"); return }
        #expect(cases.count >= 10)
        for v in cases {
            guard case let .string(name)? = v["name"], case let .array(texts)? = v["texts"] else { Issue.record("shape"); continue }
            let strings = texts.compactMap { if case let .string(s) = $0 { s } else { nil } }
            #expect(strings.count == texts.count, "\(name) texts are strings")
            let want: JSONValue? = v["expect"] == .null ? nil : v["expect"]
            #expect(try engine.labelFigures(texts: strings, kept: v["kept"]) == want, "\(name)")
        }
    }
}
