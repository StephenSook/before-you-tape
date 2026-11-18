import BYTCore
import Foundation
import Testing
@testable import BYT

/// A photo from the camera or the library goes to the reader on the router's path, lands in the
/// box, and the screen says what it is and where it was read.
@MainActor
@Suite struct AppReadTests {
    let jpeg = Data([0xFF, 0xD8, 0xFF, 0xD9])

    func fakeModel(_ j: FakeItemRunner.Journal) -> AppModel {
        let cloud = FakeItemRunner("cloud", journal: j, results: [.success(ItemReply(read: BoxStoreTests.lotion, tokens: nil))])
        let reader = ItemReader(device: FakeItemRunner("device", journal: j, results: []), makeCloud: { _ in cloud }, parse: { $0 })
        let model = AppModel(signIn: SignIn(isSignedIn: { true }, attempt: { true }), persistence: MemoryBoxPersistence(), reader: reader)
        model.network.pathChanged(satisfied: true)
        return model
    }

    @Test func aPhotoAsksForConsentBeforeAnyCloudCallAndReadsAfterAllow() async throws {
        let j = FakeItemRunner.Journal()
        let model = fakeModel(j)
        await model.readPhoto(jpeg)
        #expect(model.askingConsent && j.events.isEmpty && model.lastRead == nil)
        await model.answerConsent(true)
        #expect(!model.askingConsent && model.box?.cloudConsent == true)
        #expect(j.events == ["cloud start", "cloud end"])
        #expect(model.readLine == "Body lotion: OK to pack. Read in the cloud.")
    }

    @Test func keepingEverythingOnThePhoneSendsNothing() async throws {
        let j = FakeItemRunner.Journal()
        let model = fakeModel(j)
        await model.readPhoto(jpeg)
        await model.answerConsent(false)
        #expect(j.events.isEmpty && model.box?.cloudConsent == false && model.box?.items.isEmpty == true)
        #expect(model.readLine == "You chose to keep everything on this iPhone, and this iPhone does not read photos yet.")
        // Asked once: a second photo does not ask again.
        await model.readPhoto(jpeg)
        #expect(!model.askingConsent && j.events.isEmpty)
    }

    @Test func aCloudReadLandsInTheBoxWithItsSource() async throws {
        let j = FakeItemRunner.Journal()
        let cloud = FakeItemRunner("cloud", journal: j, results: [.success(ItemReply(read: BoxStoreTests.lotion, tokens: nil))])
        let reader = ItemReader(device: FakeItemRunner("device", journal: j, results: []), makeCloud: { _ in cloud }, parse: { $0 })
        let model = AppModel(signIn: SignIn(isSignedIn: { true }, attempt: { true }), persistence: MemoryBoxPersistence(), reader: reader)
        model.network.pathChanged(satisfied: true)
        model.box?.setConsent(true)
        await model.readPhoto(jpeg)
        #expect(!model.askingConsent)
        #expect(model.lastRead?.source == .cloud)
        #expect(model.box?.items.first?.readSource == "phone_cloud")
        #expect(model.readLine == "Body lotion: OK to pack. Read in the cloud.")
    }

    @Test func theLineSaysWhereTheReadRan() {
        let ok = ItemVerdict(level: "ok", headline: "OK to pack", hits: [], question: nil, layers: [])
        let read = ReadOutcome(read: BoxStoreTests.lotion, source: .onDevice, route: .hybrid, failure: nil, records: [])
        #expect(AppModel.readLine(read, verdict: ok) == "Body lotion: OK to pack. Read on this iPhone.")
        let unsigned = ReadOutcome(read: nil, source: nil, route: .cloudOnly, failure: .notSignedIn, records: [])
        #expect(AppModel.readLine(unsigned, verdict: nil) == "Not signed in yet. Check the network and try again.")
        let failed = ReadOutcome(read: nil, source: nil, route: .cloudOnly, failure: .server, records: [])
        #expect(AppModel.readLine(failed, verdict: nil) == "That item could not be read. Try another photo.")
        #expect(AppModel.readLine(nil, verdict: nil) == nil)
    }

    @Test func theConsentQuestionIsTheWebAppsSentenceForThisIPhone() throws {
        let web = try String(contentsOf: BoxStoreTests.repo.appendingPathComponent("src/ui/ConsentNotice.tsx"), encoding: .utf8)
        #expect(ConsentSheet.sentence == "To check items when this iPhone can't, a cropped photo of the item and the words on its label go to Google's Gemini. Allow?")
        #expect(web.contains("\"" + ConsentSheet.sentence.replacingOccurrences(of: "this iPhone", with: "this laptop") + "\""))
        #expect(ConsentSheet.allowLabel == "Allow" && ConsentSheet.keepLabel == "Keep everything on this iPhone")
    }
}
