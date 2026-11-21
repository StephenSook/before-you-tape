import BYTCore
import Foundation
import Testing
@testable import BYT

/// The sender's cloud choice: taken back at once, before anything else, so no upload can start while
/// the choice is being saved.
@MainActor
@Suite struct AppConsentTests {
    /// A box file that reports each save as it happens.
    final class WatchedBox: BoxPersistence, @unchecked Sendable {
        var stored: BoxSnapshot?
        var onSave: ((BoxSnapshot) -> Void)?
        func save(_ snapshot: BoxSnapshot) throws {
            onSave?(snapshot)
            stored = snapshot
        }
        func load(boxId: String) -> BoxSnapshot? { stored }
    }

    func model(_ p: BoxPersistence) -> AppModel {
        let j = FakeItemRunner.Journal()
        let reader = ItemReader(device: FakeItemRunner("device", journal: j, results: []),
                                makeCloud: { _ in FakeItemRunner("cloud", journal: j, results: []) }, parse: { ParsedRead(read: $0) })
        return AppModel(signIn: SignIn(isSignedIn: { true }, attempt: { true }), onDeviceStatus: { .wordsAndPhotos },
                        persistence: p, reader: reader, config: .defaults)
    }

    @Test func turningCloudChecksOffClosesTheGateBeforeTheChoiceIsSaved() async {
        let p = WatchedBox()
        let m = model(p)
        await m.answerConsent(true)
        #expect(m.cloudGateOpen)
        var openWhileSaving: [Bool] = []
        p.onSave = { snapshot in if snapshot.cloudConsent != true { openWhileSaving.append(m.cloudGateOpen) } }
        m.turnOffCloudChecks()
        await m.answerConsent(true)
        m.turnOnCloudChecks()
        #expect(openWhileSaving == [false, false])
        #expect(!m.cloudGateOpen)
    }
}
