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
        var failRecords = false
        var records: [String: String] = [:]
        func save(_ snapshot: BoxSnapshot) throws {
            if failSaves { throw Failed() }
            stored = snapshot
        }
        func load(boxId: String) -> BoxSnapshot? { stored }
        func recordConsent(_ choice: String, boxId: String) -> Bool {
            guard !failRecords else { return false }
            records[boxId] = choice
            return true
        }
        func recordedConsent(boxId: String) -> String? { records[boxId] }
    }

    /// A choice whose separate record could not be written says so, even when the box saved.
    @Test func aChoiceWhoseRecordFailedSaysItIsNotSaved() throws {
        let p = FlakyBox()
        let s = try relaunched(p)
        p.failRecords = true
        s.setConsent(false)
        #expect(s.saveProblem == BoxStore.consentNotSaved && s.cloudConsent == false)
        p.failRecords = false
        s.setConsent(false)
        #expect(s.saveProblem == nil)
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

    /// "Allowed" counts only for the question's current words: the earlier question did not mention
    /// a second look of a read already made, so a sender who allowed it is asked again.
    @Test func anAllowedChoiceUnderTheEarlierQuestionIsAskedAgain() throws {
        let p = FlakyBox()
        try relaunched(p).setConsent(true)
        #expect(p.stored?.cloudConsentVersion == BoxStore.consentVersion && BoxStore.consentVersion == 2)
        #expect(try relaunched(p).cloudConsent == true)
        // A box file from the earlier question, with and without the earlier record.
        p.stored?.cloudConsentVersion = nil
        p.records = [:]
        #expect(try relaunched(p).cloudConsent == nil)
        p.records = ["id-1": "allowed"]
        #expect(try relaunched(p).cloudConsent == nil)
        // A choice of "off" needs no new words: it stays off.
        try relaunched(p).setConsent(false)
        p.stored?.cloudConsentVersion = nil
        #expect(try relaunched(p).cloudConsent == false)
    }

    /// A box saved before the separate record existed keeps its own choice.
    @Test func aBoxWithNoRecordKeepsItsFilesChoice() throws {
        let p = FlakyBox()
        try relaunched(p).setConsent(false)
        p.records = [:]
        #expect(try relaunched(p).cloudConsent == false)
    }
}
