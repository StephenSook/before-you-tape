import BYTCore
import Foundation
import Testing
@testable import BYT

/// Battery numbers the sender gave (rule edition revision 7, the web store's tests of the same rules):
/// numbers typed in full are judged on the Wh rules, numbers a model read need a matching second look.
@MainActor
@Suite struct TypedNumbersStoreTests {
    let t = BoxStoreTests()
    let engine: RulesEngine
    init() throws { engine = try BoxStoreTests.bundledEngine() }

    func ruleIds(_ s: BoxStore, _ id: String) -> [String] { s.result?.items[id]?.hits.map(\.ruleId) ?? [] }
    func level(_ s: BoxStore, _ id: String) -> String? { s.result?.items[id]?.level }
    static func with(_ read: JSONValue, _ patch: [String: JSONValue]) -> JSONValue { SecondLookStoreTests.with(read, patch) }
    static let phone = SecondLookStoreTests.phone

    /// A phone the sender typed by hand, answered as a sender would (Canada).
    func typed(_ read: JSONValue) throws -> (BoxStore, String) {
        let s = try t.store(engine: engine)
        s.setDestination("CA")
        let id = s.addManual(read)
        s.answer(id, question: "device_condition", answer: "new_sealed")
        s.answer(id, question: "cell_count", answer: "one")
        return (s, id)
    }

    @Test func numbersTypedByHandAreTheSendersAndJudgedOnTheWhRules() throws {
        let (s, id) = try typed(Self.with(Self.phone, ["labelText": .string("")]))
        #expect(level(s, id) == "ok")
        #expect(!ruleIds(s, id).contains("USPS-INTL-LI-ONE-READ"))
    }

    /// Two reads of a phone whose label prints no Wh, disagreeing on the capacity.
    static let noWh = with(phone, ["labelText": .string("3.85V 4000mAh"), "wattHours": .number(0)])
    static let noWhBig = with(noWh, ["labelText": .string("3.85V 40000mAh"), "milliampHours": .number(40000)])

    /// A battery dispute is settled by the sender's own numbers: every one either read gave, not a Wh
    /// neither read printed.
    @Test func aBatteryDisputeSettlesOnceEveryNumberEitherReadGaveIsTyped() throws {
        let (s, id) = try SecondLookStoreTests().look(Self.noWh, Self.noWhBig)
        #expect(s.items[0].disputes?["battery"]?["resolved"] == .bool(false))
        s.override(id, patch: ["volts": .number(3.85)])
        #expect(s.items[0].disputes?["battery"]?["resolved"] == .bool(false))
        s.override(id, patch: ["milliampHours": .number(4000)])
        #expect(s.items[0].disputes?["battery"]?["resolved"] == .bool(false))
        s.override(id, patch: ["volts": .number(3.85), "milliampHours": .number(4000)])
        #expect(s.items[0].disputes?["battery"]?["resolved"] == .bool(true))
    }

    /// The same numbers typed while the cloud read ran leave no battery dispute standing.
    @Test func numbersEitherReadGaveTypedWhileTheCloudReadRanLeaveNoDispute() throws {
        let s = try t.store(engine: engine)
        s.setDestination("CA")
        let id = try #require(s.addRead(t.outcome(Self.noWh, .onDevice), cropFile: nil))
        s.override(id, patch: ["volts": .number(3.85), "milliampHours": .number(4000)])
        let m = try engine.mergeSecondLook(device: Self.noWh, cloud: Self.noWhBig)
        #expect(m.disputes["battery"] != nil)
        s.applySecondLook(id, merged: m.merged, ms: 900, reason: "reason", cloudLabel: "3.85V 40000mAh", disputes: m.disputes)
        #expect(s.items[0].disputes?["battery"] == nil)
    }

    @Test func aTypedItemsLabelFigureAboveItsTypedNumberHoldsIt() throws {
        let (s, id) = try typed(Self.with(Self.phone, ["labelText": .string("3.85V 4000mAh PACK 20Wh")]))
        #expect(level(s, id) == "check")
        #expect(ruleIds(s, id).contains("DATA-LABEL-NUMBERS"))
        #expect(!ruleIds(s, id).contains("USPS-INTL-LI-ONE-READ"))
    }
}
