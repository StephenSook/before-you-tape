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

    /// Label words are read on this iPhone, with no network and without asking about the cloud.
    @Test func labelWordsAreReadOnThisIPhoneOffline() async throws {
        let j = FakeItemRunner.Journal()
        let device = FakeItemRunner("device", journal: j, results: [.success(ItemReply(read: BoxStoreTests.perfume, tokens: TokenUse(input: 800, output: 90)))])
        let reader = ItemReader(device: device, makeCloud: { _ in FakeItemRunner("cloud", journal: j, results: []) }, parse: { $0 })
        let available = OnDeviceStatus(unavailable: nil, localeSupported: true, contextSize: 4096, variant: "test", vision: false)
        let model = AppModel(signIn: SignIn(isSignedIn: { false }, attempt: { false }), onDevice: available,
                             persistence: MemoryBoxPersistence(), reader: reader)
        await model.readWords("  EAU DE PARFUM ALCOHOL DENAT 50 ML  ")
        #expect(!model.askingConsent)
        #expect(j.events == ["device start", "device end"])
        #expect(model.box?.items.first?.readSource == "phone_on_device")
        #expect(model.readLine == "Perfume: Take it out. Read on this iPhone.")
    }

    @Test func emptyWordsReadNothing() async {
        let j = FakeItemRunner.Journal()
        let model = fakeModel(j)
        await model.readWords("   ")
        #expect(j.events.isEmpty && model.lastRead == nil)
    }

    /// The line names the item as it is now, from the same box item its verdict comes from.
    @Test func theLineFollowsTheSendersCorrection() async throws {
        let j = FakeItemRunner.Journal()
        let cloud = FakeItemRunner("cloud", journal: j, results: [.success(ItemReply(read: BoxStoreTests.perfume, tokens: nil))])
        let reader = ItemReader(device: FakeItemRunner("device", journal: j, results: []), makeCloud: { _ in cloud }, parse: { $0 })
        let model = AppModel(signIn: SignIn(isSignedIn: { true }, attempt: { true }), persistence: MemoryBoxPersistence(), reader: reader)
        model.network.pathChanged(satisfied: true)
        model.box?.setConsent(true)
        await model.readPhoto(jpeg)
        #expect(model.readLine == "Perfume: Take it out. Read in the cloud.")
        let id = try #require(model.box?.items.first?.itemId)
        model.box?.override(id, patch: ["itemName": .string("Body lotion"), "category": .string("lotion_cream"),
                                        "labelText": .string("SHEA BODY LOTION 8 FL OZ")])
        #expect(model.readLine == "Body lotion: OK to pack. Read in the cloud.")
    }
}
