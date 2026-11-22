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

    @Test func aTypedItemsLabelFigureAboveItsTypedNumberHoldsIt() throws {
        let (s, id) = try typed(Self.with(Self.phone, ["labelText": .string("3.85V 4000mAh PACK 20Wh")]))
        #expect(level(s, id) == "check")
        #expect(ruleIds(s, id).contains("DATA-LABEL-NUMBERS"))
        #expect(!ruleIds(s, id).contains("USPS-INTL-LI-ONE-READ"))
    }
}
