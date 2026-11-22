import BYTCore
import Foundation
import Testing
@testable import BYT

/// The Wh and lithium-gram figures an item's labels name (rule edition revision 7): the engine decides
/// them (labelFiguresJson) from the whole labels, and the item keeps them, so a figure above the
/// number in use still holds the item after the label text is gone (the saved copy keeps no label).
@MainActor
@Suite struct LabelFiguresStoreTests {
    let t = BoxStoreTests()
    let engine: RulesEngine
    init() throws { engine = try BoxStoreTests.bundledEngine() }

    func ruleIds(_ s: BoxStore, _ id: String) -> [String] { s.result?.items[id]?.hits.map(\.ruleId) ?? [] }
    static func with(_ read: JSONValue, _ patch: [String: JSONValue]) -> JSONValue { SecondLookStoreTests.with(read, patch) }
    /// A phone read at 15.4 Wh; each test gives its label.
    static let phone = SecondLookStoreTests.phone

    func reloaded(_ p: MemoryBoxPersistence) throws -> BoxStore {
        let saved = try #require(p.saved.last)
        #expect(saved.items.allSatisfy { $0.read["labelText"] == .string("") && $0.overrides["labelText"] == nil })
        let s = try t.store(MemoryBoxPersistence(stored: saved), engine: engine)
        s.load()
        return s
    }

    @Test func aFigurePastTheLabelCutCountsFromTheWholeLabel() throws {
        let s = try t.store(engine: engine)
        s.setDestination("CA")
        var o = t.outcome(Self.phone, .onDevice)
        o.wholeLabel = "3.85V 4000mAh 15.4Wh " + BoxStoreTests.x(160) + " PACK 20Wh"
        let id = try #require(s.addRead(o, cropFile: nil))
        #expect(ruleIds(s, id).contains("DATA-LABEL-NUMBERS"))
        #expect(s.items[0].labelFigures == .object(["wh": .array([.number(20), .number(15.4)]), "grams": .array([])]))
    }

    /// An item saved before the figures were kept has none, and loads.
    @Test func anItemSavedWithoutFiguresDecodesWithNone() throws {
        var item = BoxItem(itemId: "a", read: Self.phone, readSource: "phone_on_device", readMs: 900,
                           labelFigures: .object(["wh": .array([.number(20)]), "grams": .array([])]))
        guard case var .object(o) = try JSONDecoder().decode(JSONValue.self, from: JSONEncoder().encode(item)) else { Issue.record("shape"); return }
        #expect(o.removeValue(forKey: "labelFigures") != nil)
        item = try JSONDecoder().decode(BoxItem.self, from: JSONEncoder().encode(JSONValue.object(o)))
        #expect(item.labelFigures == nil)
    }

    @Test func aReadLabelsFiguresStillHoldTheItemAfterAReload() throws {
        let p = MemoryBoxPersistence()
        let s = try t.store(p, engine: engine)
        s.setDestination("CA")
        let id = try #require(s.addRead(t.outcome(Self.with(Self.phone, ["labelText": .string("3.85V 4000mAh 20Wh")]), .onDevice), cropFile: nil))
        #expect(ruleIds(s, id).contains("DATA-LABEL-NUMBERS"))
        #expect(ruleIds(try reloaded(p), id).contains("DATA-LABEL-NUMBERS"))
    }

    @Test func aSecondLooksLabelAddsItsFiguresAndTheyStayAfterAReload() throws {
        let p = MemoryBoxPersistence()
        let s = try t.store(p, engine: engine)
        s.setDestination("CA")
        let id = try #require(s.addRead(t.outcome(Self.phone, .onDevice), cropFile: nil))
        let cloud = "3.85V 4000mAh 15.4Wh PACK 20Wh"
        let m = try engine.mergeSecondLook(device: Self.phone, cloud: Self.with(Self.phone, ["labelText": .string(cloud)]))
        s.applySecondLook(id, merged: m.merged, ms: 900, reason: "reason", cloudLabel: cloud, disputes: m.disputes)
        #expect(ruleIds(s, id).contains("DATA-LABEL-NUMBERS"))
        #expect(ruleIds(try reloaded(p), id).contains("DATA-LABEL-NUMBERS"))
    }

    @Test func aLabelTheSenderTypesAddsItsFiguresAndTheyStayAfterAReload() throws {
        let p = MemoryBoxPersistence()
        let s = try t.store(p, engine: engine)
        s.setDestination("CA")
        let id = try #require(s.addRead(t.outcome(Self.phone, .onDevice), cropFile: nil))
        #expect(!ruleIds(s, id).contains("DATA-LABEL-NUMBERS"))
        s.override(id, patch: ["labelText": .string("PACK 20Wh")])
        #expect(ruleIds(s, id).contains("DATA-LABEL-NUMBERS"))
        #expect(ruleIds(try reloaded(p), id).contains("DATA-LABEL-NUMBERS"))
    }
}
