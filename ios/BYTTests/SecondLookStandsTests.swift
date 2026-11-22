import BYTCore
import Foundation
import Testing
@testable import BYT

/// The card says a second model agreed only while the rules count that second look (the web app's
/// secondLookStands): one check that the engine input and the card share, so the line and the verdict
/// cannot disagree.
@MainActor
@Suite struct SecondLookStandsTests {
    let t = BoxStoreTests()
    let engine: RulesEngine
    init() throws { engine = try BoxStoreTests.bundledEngine() }

    static let agreed = "A second model in the cloud read the same, so this counts as checked. Use Fix this reading if it is wrong."

    func agreedShirt() throws -> (BoxStore, String) {
        let s = try t.store(engine: engine)
        let id = try #require(s.addRead(t.outcome(BoxStoreTests.shirt, .onDevice), cropFile: nil))
        s.applySecondLook(id, merged: BoxStoreTests.shirt, ms: 900, reason: "identity", cloudLabel: nil)
        return (s, id)
    }

    @Test func anAgreedShirtThatReadsOKSaysASecondModelAgreed() throws {
        let (s, id) = try agreedShirt()
        #expect(s.result?.items[id]?.level == "ok")
        #expect(BoxStore.secondLookStands(s.items[0]))
        #expect(ItemCardView.agreedLine(s.items[0], checkingAgain: false) == Self.agreed)
        // Not while the cloud is reading it again.
        #expect(ItemCardView.agreedLine(s.items[0], checkingAgain: true) == nil)
    }

    @Test func theSendersWordTypedNumbersOrANumbersDisputeSayNothing() throws {
        let (s, id) = try agreedShirt()
        s.confirmIdentity(id)
        #expect(s.items[0].identityConfirmedBy == "sender" && !BoxStore.secondLookStands(s.items[0]))
        #expect(ItemCardView.agreedLine(s.items[0], checkingAgain: false) == nil)
        var typed = try agreedShirt().0.items[0]
        typed.overrides["wattHours"] = .number(15.4)
        #expect(typed.identityConfirmedBy == "second_look" && !BoxStore.secondLookStands(typed))
        var settled = try agreedShirt().0.items[0]
        settled.disputes = .object(["battery": .object(["device": .object(["volts": .number(3.85), "milliampHours": .number(4000), "wattHours": .number(15.4)]),
                                                        "cloud": .object(["volts": .number(3.85), "milliampHours": .number(4000), "wattHours": .number(16)]),
                                                        "resolved": .bool(true)])])
        #expect(!BoxStore.secondLookStands(settled))
        #expect(ItemCardView.agreedLine(settled, checkingAgain: false) == nil)
    }
}
