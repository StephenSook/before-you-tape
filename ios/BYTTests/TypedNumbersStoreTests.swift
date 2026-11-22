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

    /// A phone read on this iPhone, answered as a sender would (Canada).
    func read(_ read: JSONValue) throws -> (BoxStore, String) {
        let s = try t.store(engine: engine)
        s.setDestination("CA")
        let id = try #require(s.addRead(t.outcome(read, .onDevice), cropFile: nil))
        s.answer(id, question: "device_condition", answer: "new_sealed")
        s.answer(id, question: "cell_count", answer: "one")
        return (s, id)
    }
    static let coin = with(phone, ["category": .string("battery_toy"), "itemName": .string("Toy"), "labelText": .string("CR2032 LITHIUM"),
                                   "volts": .number(3), "milliampHours": .number(0), "wattHours": .number(0), "lithiumGrams": .number(0.1)])

    /// A typed Wh brings the volts and capacity shown with it, as the sender's own: the Wh rules check them
    /// against it. Typed lithium grams bring the volts, never a Wh.
    @Test func aTypedDecidingNumberBringsTheNumbersShownWithIt() throws {
        let (s, id) = try read(Self.phone)
        s.override(id, patch: ["wattHours": .number(15.4)])
        #expect(s.items[0].overrides["volts"] == .number(3.85) && s.items[0].overrides["milliampHours"] == .number(4000))
        #expect(s.items[0].overrides["wattHours"] == .number(15.4) && s.items[0].overrides["lithiumGrams"] == nil)
        #expect(s.result?.items[id]?.level == "ok")
        let coin = try read(Self.coin)
        coin.0.override(coin.1, patch: ["lithiumGrams": .number(0.1)])
        #expect(coin.0.items[0].overrides == ["volts": .number(3), "lithiumGrams": .number(0.1)])
        let both = try read(Self.with(Self.phone, ["lithiumGrams": .number(0.1)]))
        both.0.override(both.1, patch: ["lithiumGrams": .number(0.1)])
        #expect(both.0.items[0].overrides == ["volts": .number(3.85), "lithiumGrams": .number(0.1)])
    }

    /// Nothing comes along with a number that decides nothing, with a cleared number, or while the reads
    /// dispute the numbers (open or settled).
    @Test func nothingComesAlongWithAClearedNumberOrDuringANumbersDispute() throws {
        let (s, id) = try read(Self.phone)
        s.override(id, patch: ["volts": .number(3.85)])
        #expect(s.items[0].overrides == ["volts": .number(3.85)])
        let cleared = try read(Self.phone)
        cleared.0.override(cleared.1, patch: ["wattHours": .number(15.4), "milliampHours": .number(0)])
        #expect(cleared.0.items[0].overrides == ["wattHours": .number(15.4), "milliampHours": .number(0)])
        let open = try SecondLookStoreTests().look(Self.phone, SecondLookStoreTests.bigPhone)
        open.0.override(open.1, patch: ["wattHours": .number(15.4)])
        #expect(open.0.items[0].overrides == ["wattHours": .number(15.4)])
        let settled = try SecondLookStoreTests().look(Self.phone, SecondLookStoreTests.bigPhone)
        settled.0.settleDispute(settled.1, field: "battery", side: .device)
        settled.0.override(settled.1, patch: ["wattHours": .number(15.4)])
        #expect(settled.0.items[0].overrides == ["wattHours": .number(15.4)])
    }

    /// Any battery number in a correction, a cleared one (0) included, makes the numbers the sender's: the
    /// ones left are no longer the set the second look read.
    @Test func aClearedNumberMakesASecondLooksNumbersTheSenders() throws {
        for field in ["volts", "milliampHours", "wattHours", "lithiumGrams"] {
            let (s, id) = try SecondLookStoreTests().look(Self.phone, Self.phone)
            #expect(s.items[0].identityConfirmedBy == "second_look")
            s.override(id, patch: [field: .number(0)])
            #expect(s.items[0].identityConfirmedBy == "sender", "\(field)")
        }
    }

    @Test func aTypedItemsLabelFigureAboveItsTypedNumberHoldsIt() throws {
        let (s, id) = try typed(Self.with(Self.phone, ["labelText": .string("3.85V 4000mAh PACK 20Wh")]))
        #expect(level(s, id) == "check")
        #expect(ruleIds(s, id).contains("DATA-LABEL-NUMBERS"))
        #expect(!ruleIds(s, id).contains("USPS-INTL-LI-ONE-READ"))
    }
}
