import BYTCore
import Foundation
import Testing
@testable import BYT

/// The sender's cloud choice after a relaunch. It is also kept apart from the box file, so a choice
/// whose box save failed still holds: a choice taken back never comes back from an older box file.
@MainActor
@Suite struct BoxConsentTests {
    let t = BoxStoreTests()

    /// A box file whose saves can fail (the last good box stays), with the separate choice record.
    final class FlakyBox: BoxPersistence, @unchecked Sendable {
        struct Failed: Error {}
        var stored: BoxSnapshot?
        var failSaves = false
        var records: [String: String] = [:]
        func save(_ snapshot: BoxSnapshot) throws {
            if failSaves { throw Failed() }
            stored = snapshot
        }
        func load(boxId: String) -> BoxSnapshot? { stored }
        func recordConsent(_ choice: String, boxId: String) { records[boxId] = choice }
        func recordedConsent(boxId: String) -> String? { records[boxId] }
    }

    func relaunched(_ p: FlakyBox) throws -> BoxStore {
        let s = try t.store(p)
        s.load()
        return s
    }

    @Test func aChoiceTakenBackHoldsWhenItsSaveFails() throws {
        let p = FlakyBox()
        let s = try relaunched(p)
        s.setConsent(true)
        #expect(p.stored?.cloudConsent == true)
        p.failSaves = true
        s.setConsent(false)
        #expect(s.saveProblem != nil && p.stored?.cloudConsent == true)
        p.failSaves = false
        #expect(try relaunched(p).cloudConsent == false)
    }

    /// "Turn on cloud checks" clears the choice so the question is asked again; a failed save of that
    /// does not bring back the earlier "allowed".
    @Test func aClearedChoiceHoldsWhenItsSaveFails() throws {
        let p = FlakyBox()
        let s = try relaunched(p)
        s.setConsent(true)
        p.failSaves = true
        s.setConsent(nil)
        p.failSaves = false
        #expect(try relaunched(p).cloudConsent == nil)
    }

    /// An "allowed" whose box save failed is not trusted either: the question is asked again.
    @Test func anAllowedChoiceWhoseSaveFailedIsAskedAgain() throws {
        let p = FlakyBox()
        let s = try relaunched(p)
        p.failSaves = true
        s.setConsent(true)
        p.failSaves = false
        #expect(try relaunched(p).cloudConsent == nil)
    }

    @Test func savedChoicesComeBack() throws {
        for choice in [true, false] {
            let p = FlakyBox()
            try relaunched(p).setConsent(choice)
            #expect(try relaunched(p).cloudConsent == choice)
        }
    }

    /// A box saved before the separate record existed keeps its own choice.
    @Test func aBoxWithNoRecordKeepsItsFilesChoice() throws {
        let p = FlakyBox()
        try relaunched(p).setConsent(false)
        p.records = [:]
        #expect(try relaunched(p).cloudConsent == false)
    }
}
