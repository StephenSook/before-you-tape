import BYTCore
import Foundation
import Testing
@testable import BYT

/// A photo from the camera or the library goes to the reader on the router's path, lands in the
/// box, and the screen says what it is and where it was read.
@MainActor
@Suite struct AppReadTests {
    let jpeg = Data([0xFF, 0xD8, 0xFF, 0xD9])

    /// A model that cannot read photos unless a test says otherwise, so a photo needs the cloud.
    func fakeModel(_ j: FakeItemRunner.Journal, status: OnDeviceStatus = .wordsOnly, cloudReads: [JSONValue] = [BoxStoreTests.lotion]) -> AppModel {
        let cloud = FakeItemRunner("cloud", journal: j, results: cloudReads.map { .success(ItemReply(read: $0, tokens: nil)) })
        let reader = ItemReader(device: FakeItemRunner("device", journal: j, results: []), makeCloud: { _ in cloud }, parse: { ParsedRead(read: $0) })
        let model = AppModel(signIn: SignIn(isSignedIn: { true }, attempt: { true }), onDeviceStatus: { status }, persistence: MemoryBoxPersistence(),
                             reader: reader, config: .defaults)
        model.network.pathChanged(satisfied: true)
        return model
    }

    /// A photo is read on this iPhone with no network and no cloud question, lands in the box as an
    /// on-device read, and the line says so.
    @Test func aPhotoIsReadOnThisIPhoneOffline() async throws {
        let j = FakeItemRunner.Journal()
        let device = FakeItemRunner("device", journal: j, results: [.success(ItemReply(read: BoxStoreTests.lotion, tokens: TokenUse(input: 900, output: 80)))])
        let reader = ItemReader(device: device, makeCloud: { _ in FakeItemRunner("cloud", journal: j, results: []) }, parse: { ParsedRead(read: $0) })
        let model = AppModel(signIn: SignIn(isSignedIn: { false }, attempt: { false }), onDeviceStatus: { .wordsAndPhotos },
                             persistence: MemoryBoxPersistence(), reader: reader, config: .defaults)
        model.network.pathChanged(satisfied: false)
        await model.readPhoto(jpeg)
        #expect(!model.askingConsent && model.box?.cloudConsent == nil)
        #expect(j.events == ["device start", "device end"])
        #expect(model.lastRead?.records.map(\.path) == [.onDevice] && model.lastRead?.records.first?.kind == .photo)
        #expect(model.box?.items.first?.readSource == "phone_on_device")
        #expect(model.readLine == "Body lotion: OK to pack. Read on this iPhone.")
        #expect(model.lastCrop == jpeg)
    }

    /// The app's parser is the engine's tagged parse: the read keeps clipped label text, and its tags
    /// and whole label come from the label before the cut.
    @Test func theAppsParserTagsTheWholeLabelBeforeItsCut() throws {
        let reader = AppModel.makeReader(engine: try BoxStoreTests.bundledEngine(), signIn: SignIn(isSignedIn: { true }, attempt: { true }),
                                         pause: PauseSwitch())
        let whole = String(repeating: "x", count: 155) + " FLAMMABLE"
        let raw = BoxStoreTests.read(["category": .string("lotion_cream"), "labelText": .string(whole), "liquid": .bool(true)])
        let parsed = try #require(reader.parse(raw))
        #expect(parsed.labelTags.contains("flammable") && parsed.labelTags.contains("label_text") && parsed.wholeLabel == whole)
        if case let .string(shown)? = parsed.read["labelText"] { #expect(shown.unicodeScalars.count == 160) } else { Issue.record("no label") }
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
        #expect(model.readLine == "You chose to keep everything on this iPhone, and this iPhone's model does not read photos. Type the label's words instead.")
        // Asked once: a second photo does not ask again.
        await model.readPhoto(jpeg)
        #expect(!model.askingConsent && j.events.isEmpty)
    }

    @Test func aCloudReadLandsInTheBoxWithItsSource() async throws {
        let j = FakeItemRunner.Journal()
        let cloud = FakeItemRunner("cloud", journal: j, results: [.success(ItemReply(read: BoxStoreTests.lotion, tokens: nil))])
        let reader = ItemReader(device: FakeItemRunner("device", journal: j, results: []), makeCloud: { _ in cloud }, parse: { ParsedRead(read: $0) })
        let model = AppModel(signIn: SignIn(isSignedIn: { true }, attempt: { true }), onDeviceStatus: { .wordsOnly }, persistence: MemoryBoxPersistence(),
                             reader: reader, config: .defaults)
        model.network.pathChanged(satisfied: true)
        model.box?.setConsent(true)
        await model.readPhoto(jpeg)
        #expect(!model.askingConsent)
        #expect(model.lastRead?.source == .cloud)
        #expect(model.box?.items.first?.readSource == "phone_cloud")
        #expect(model.readLine == "Body lotion: OK to pack. Read in the cloud.")
    }

    /// A photo of no item (the camera pointed at a room) is not added to the box, as the web app
    /// drops it, and the screen says why; the next photo of a real item is added as usual.
    @Test func aPhotoOfNoItemIsNotAdded() async throws {
        let j = FakeItemRunner.Journal()
        let nothing = BoxStoreTests.read(["itemName": .string("unknown"), "evidence": .string("not_sure")])
        let cloud = FakeItemRunner("cloud", journal: j, results: [.success(ItemReply(read: nothing, tokens: nil)),
                                                                 .success(ItemReply(read: BoxStoreTests.lotion, tokens: nil))])
        let reader = ItemReader(device: FakeItemRunner("device", journal: j, results: []), makeCloud: { _ in cloud }, parse: { ParsedRead(read: $0) })
        let model = AppModel(signIn: SignIn(isSignedIn: { true }, attempt: { true }), onDeviceStatus: { .wordsOnly }, persistence: MemoryBoxPersistence(),
                             reader: reader, config: .defaults)
        model.network.pathChanged(satisfied: true)
        model.box?.setConsent(true)
        await model.readPhoto(jpeg)
        #expect(model.box?.items.isEmpty == true)
        #expect(model.readLine == "Nothing to check there. Hold one item inside the box.")
        await model.readPhoto(jpeg)
        #expect(model.box?.items.count == 1)
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
        // The name comes from the item as it is now: a name the sender cleared reads as "This item",
        // never as the name the model first read.
        #expect(AppModel.readLine(read, verdict: ok, name: "") == "This item: OK to pack. Read on this iPhone.")
        #expect(AppModel.readLine(read, verdict: ok, name: "  ") == "This item: OK to pack. Read on this iPhone.")
        #expect(AppModel.readLine(read, verdict: ok, name: "Hand cream") == "Hand cream: OK to pack. Read on this iPhone.")
    }

    /// A photo this iPhone cannot read says why and what to do instead.
    @Test func aPhotoThisIPhoneCannotReadSaysWhyAndWhatToDo() {
        let blocked = ReadOutcome(read: nil, source: nil, route: .blocked, failure: nil, records: [])
        let off = OnDeviceStatus(unavailable: .appleIntelligenceOff, localeSupported: true, contextSize: 4096, variant: "t", vision: true)
        #expect(AppModel.readLine(blocked, verdict: nil, consent: false, status: .wordsOnly)
                == "You chose to keep everything on this iPhone, and this iPhone's model does not read photos. Type the label's words instead.")
        #expect(AppModel.readLine(blocked, verdict: nil, consent: false, status: off)
                == "You chose to keep everything on this iPhone, and Apple's on-device model is not available on it. Add it by hand with Type it in Your box.")
        #expect(AppModel.readLine(blocked, verdict: nil, consent: nil, status: .wordsOnly)
                == "Checking a photo needs the cloud, and the cloud is not allowed right now. Type the label's words instead.")
        #expect(AppModel.readLine(blocked, verdict: nil, consent: true, status: off)
                == "Checking a photo needs the cloud, and the cloud is not allowed right now. Add it by hand with Type it in Your box.")
        // A photo read on this iPhone that failed, with no cloud to try, says what to do.
        let failed = ReadOutcome(read: nil, source: nil, route: .deviceOnly, failure: .timeout, records: [])
        #expect(AppModel.readLine(failed, verdict: nil, status: .wordsAndPhotos)
                == "This iPhone could not read that photo. Try another photo, or type the label's words instead.")
    }

    /// The check screen says why a photo is not read on this iPhone; it says nothing when it is.
    @Test func theCheckScreenSaysWhyPhotosAreNotReadOnThisIPhone() {
        let j = FakeItemRunner.Journal()
        #expect(fakeModel(j, status: .wordsAndPhotos).photoNotice == nil)
        #expect(fakeModel(j, status: .wordsOnly).photoNotice == "This iPhone's model does not read photos. Type the label's words instead.")
    }

    /// The web app sends only photos, so its sentence names the photo. The iPhone also sends label words
    /// typed or scanned, never with the photo (CloudOutbound), so its sentence names one or the other.
    /// Both name the second look and end the same way.
    @Test func theConsentQuestionSaysThePhotoOrTheWordsGo() throws {
        let web = try String(contentsOf: BoxStoreTests.repo.appendingPathComponent("src/ui/ConsentNotice.tsx"), encoding: .utf8)
        #expect(ConsentSheet.sentence == "To check items this iPhone can't read, and to check a read again when the rules ask, a cropped photo of the item, or the label words you typed or scanned, goes to Google's Gemini. Allow?")
        for shared in [", and to check a read again when the rules ask, ", " goes to Google's Gemini. Allow?"] {
            #expect(web.contains(shared) && ConsentSheet.sentence.contains(shared), "\(shared)")
        }
        #expect(ConsentSheet.allowLabel == "Allow" && ConsentSheet.keepLabel == "Keep everything on this iPhone")
    }

    /// Label words are read on this iPhone, with no network and without asking about the cloud.
    @Test func labelWordsAreReadOnThisIPhoneOffline() async throws {
        let j = FakeItemRunner.Journal()
        let device = FakeItemRunner("device", journal: j, results: [.success(ItemReply(read: BoxStoreTests.perfume, tokens: TokenUse(input: 800, output: 90)))])
        let reader = ItemReader(device: device, makeCloud: { _ in FakeItemRunner("cloud", journal: j, results: []) }, parse: { ParsedRead(read: $0) })
        let available = OnDeviceStatus(unavailable: nil, localeSupported: true, contextSize: 4096, variant: "test", vision: false)
        let model = AppModel(signIn: SignIn(isSignedIn: { false }, attempt: { false }), onDeviceStatus: { available },
                             persistence: MemoryBoxPersistence(), reader: reader, config: .defaults)
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
        let reader = ItemReader(device: FakeItemRunner("device", journal: j, results: []), makeCloud: { _ in cloud }, parse: { ParsedRead(read: $0) })
        let model = AppModel(signIn: SignIn(isSignedIn: { true }, attempt: { true }), onDeviceStatus: { .wordsOnly }, persistence: MemoryBoxPersistence(),
                             reader: reader, config: .defaults)
        model.network.pathChanged(satisfied: true)
        model.box?.setConsent(true)
        await model.readPhoto(jpeg)
        #expect(model.readLine == "Perfume: Take it out. Read in the cloud.")
        let id = try #require(model.box?.items.first?.itemId)
        model.box?.override(id, patch: ["itemName": .string("Body lotion"), "category": .string("lotion_cream"),
                                        "labelText": .string("SHEA BODY LOTION 8 FL OZ")])
        #expect(model.readLine == "Body lotion: OK to pack. Read in the cloud.")
    }

    /// The on-device model's status is read again before each read and when the app comes back,
    /// so a model that finished downloading is used without a relaunch.
    @Test func aModelThatBecameReadyIsUsedByTheNextRead() async {
        final class Status: @unchecked Sendable { var now = OnDeviceStatus(unavailable: .modelNotReady, localeSupported: true, contextSize: 4096, variant: "t", vision: false) }
        let status = Status()
        let j = FakeItemRunner.Journal()
        let device = FakeItemRunner("device", journal: j, results: [.success(ItemReply(read: BoxStoreTests.perfume, tokens: nil))])
        let reader = ItemReader(device: device, makeCloud: { _ in FakeItemRunner("cloud", journal: j, results: []) }, parse: { ParsedRead(read: $0) })
        let model = AppModel(signIn: SignIn(isSignedIn: { false }, attempt: { false }), onDeviceStatus: { status.now },
                             persistence: MemoryBoxPersistence(), reader: reader, config: .defaults)
        #expect(model.onDevice.unavailable == .modelNotReady)
        status.now.unavailable = nil
        model.becameActive()
        #expect(model.onDevice.unavailable == nil)
        // Not ready again at the moment of a read: the read sees it and does not use the model.
        status.now.unavailable = .modelNotReady
        await model.readWords("EAU DE PARFUM 50 ML")
        #expect(j.events.isEmpty && model.askingConsent)
        // Ready again: the waiting words are read on the iPhone after the answer.
        status.now.unavailable = nil
        await model.answerConsent(false)
        #expect(j.events == ["device start", "device end"])
    }

    /// The sender sees exactly the part of the photo that is sent: in the cloud question, and after the read.
    @Test func theSenderSeesTheExactCrop() async {
        let j = FakeItemRunner.Journal()
        let model = fakeModel(j)
        await model.readPhoto(jpeg)
        #expect(model.askingConsent && model.pendingCrop == jpeg && model.lastCrop == nil)
        await model.answerConsent(true)
        #expect(model.lastCrop == jpeg && model.pendingCrop == nil)
    }
}
