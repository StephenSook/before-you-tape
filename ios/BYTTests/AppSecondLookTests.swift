import BYTCore
import Foundation
import Testing
@testable import BYT

/// The app runs a cloud second look after a photo read on this iPhone, as the web app's Pack page does:
/// only with a reason from the engine and the cloud allowed now; a look that fails for no connection runs
/// again once the iPhone is back online; and the item shows why it was looked at again.
@MainActor
@Suite struct AppSecondLookTests {
    let jpeg = Data([0xFF, 0xD8, 0xFF, 0xD9])
    static let powerBank = BoxStoreTests.read(["itemName": .string("Power bank"), "category": .string("power_bank"),
        "labelText": .string("LI-ION 3.7V 5000mAh 18.5Wh"), "volts": .number(3.7), "milliampHours": .number(5000),
        "wattHours": .number(18.5), "batteryWords": .bool(true), "retailBox": .string("sealed")])

    /// A model whose device read and cloud reads are scripted; online, with the cloud allowed unless told.
    func model(_ j: FakeItemRunner.Journal, device: JSONValue = powerBank, cloud: [Result<ItemReply, ReadError>],
               consent: Bool? = true, online: Bool = true) -> AppModel {
        // One scripted cloud runner for every look, so a later look takes the next scripted answer.
        let cloudRunner = FakeItemRunner("cloud", journal: j, results: cloud)
        let reader = ItemReader(device: FakeItemRunner("device", journal: j, results: [.success(ItemReply(read: device, tokens: nil))]),
                                makeCloud: { _ in cloudRunner }, parse: { ParsedRead(read: $0) })
        let m = AppModel(signIn: SignIn(isSignedIn: { true }, attempt: { true }), onDeviceStatus: { .wordsAndPhotos },
                         persistence: MemoryBoxPersistence(), reader: reader, config: .defaults)
        m.network.pathChanged(satisfied: online)
        if let consent { m.box?.setConsent(consent) }
        return m
    }

    func settle(_ m: AppModel) async { for task in m.secondLookTasks { await task.value } }

    @Test func aPhotoReadOnThisIPhoneWithAReasonIsLookedAtAgainInTheCloud() async throws {
        let j = FakeItemRunner.Journal()
        let m = model(j, cloud: [.success(ItemReply(read: Self.powerBank, tokens: nil))])
        await m.readPhoto(jpeg)
        await settle(m)
        #expect(j.events == ["device start", "device end", "cloud start", "cloud end"])
        let item = try #require(m.box?.items.first)
        #expect(item.readSource == "phone_on_device" && m.box?.sources.secondLooks == 1)
        #expect(item.secondLook?.reason == "Battery numbers decide what may be mailed, so the cloud read them again.")
        #expect(item.identityConfirmedBy == "second_look" && m.secondLookError(item.itemId) == nil && !m.isCheckingAgain(item.itemId))
    }

    @Test func noSecondLookWhenTheCloudIsNotAllowedOrThereIsNoReason() async {
        for (consent, online) in [(false, true), (nil, true), (true, false)] as [(Bool?, Bool)] {
            let j = FakeItemRunner.Journal()
            let m = model(j, cloud: [.success(ItemReply(read: Self.powerBank, tokens: nil))], consent: consent, online: online)
            await m.readPhoto(jpeg)
            await settle(m)
            #expect(j.events == ["device start", "device end"], "consent \(String(describing: consent)), online \(online)")
            #expect(m.box?.sources.secondLooks == 0)
        }
        // A lotion whose label was read needs no second look.
        let j = FakeItemRunner.Journal()
        let reader = ItemReader(device: FakeItemRunner("device", journal: j, results: [.success(ItemReply(read: BoxStoreTests.lotion, tokens: nil))]),
                                makeCloud: { _ in FakeItemRunner("cloud", journal: j, results: []) }, parse: { ParsedRead(read: $0, labelTags: ["label_text"]) })
        let m = AppModel(signIn: SignIn(isSignedIn: { true }, attempt: { true }), onDeviceStatus: { .wordsAndPhotos },
                         persistence: MemoryBoxPersistence(), reader: reader, config: .defaults)
        m.network.pathChanged(satisfied: true)
        m.box?.setConsent(true)
        await m.readPhoto(jpeg)
        await settle(m)
        #expect(j.events == ["device start", "device end"])
    }

    @Test func typedLabelWordsGetNoSecondLook() async {
        let j = FakeItemRunner.Journal()
        let m = model(j, cloud: [.success(ItemReply(read: Self.powerBank, tokens: nil))])
        await m.readWords("LI-ION 3.7V 5000mAh 18.5Wh")
        await settle(m)
        #expect(j.events == ["device start", "device end"] && m.box?.sources.secondLooks == 0)
    }

    /// No connection: the look waits, the card says so, and it runs once the iPhone is back online.
    @Test func aLookThatFailedForNoConnectionRunsWhenBackOnline() async throws {
        let j = FakeItemRunner.Journal()
        let m = model(j, cloud: [.failure(ReadError(.network)), .failure(ReadError(.network)), .success(ItemReply(read: Self.powerBank, tokens: nil))])
        await m.readPhoto(jpeg)
        await settle(m)
        let id = try #require(m.box?.items.first?.itemId)
        #expect(m.secondLookError(id) == "No connection. This check will run when you are back online.")
        #expect(m.box?.items.first?.secondLook == nil)
        m.network.pathChanged(satisfied: false)
        m.network.pathChanged(satisfied: true)
        await settle(m)
        #expect(m.box?.items.first?.secondLook != nil && m.secondLookError(id) == nil)
    }

    /// A failed look leaves the device read and its verdict, says why, and can be tried again.
    @Test func aFailedLookSaysWhyAndCanBeTriedAgain() async throws {
        let j = FakeItemRunner.Journal()
        let m = model(j, cloud: [.failure(ReadError(.parseFailed)), .success(ItemReply(read: Self.powerBank, tokens: nil))])
        await m.readPhoto(jpeg)
        await settle(m)
        let id = try #require(m.box?.items.first?.itemId)
        #expect(m.secondLookError(id) == "The second look did not make sense. Try again.")
        #expect(m.box?.items.first?.read == Self.powerBank && m.box?.items.first?.secondLook == nil)
        m.retrySecondLook(id)
        await settle(m)
        #expect(m.box?.items.first?.secondLook != nil && m.secondLookError(id) == nil)
    }

    /// Cloud checks turned off before the look ran: nothing is sent, and the card says so.
    @Test func cloudChecksTurnedOffStopTheLook() async throws {
        let j = FakeItemRunner.Journal()
        let m = model(j, cloud: [.failure(ReadError(.server)), .failure(ReadError(.server))])
        await m.readPhoto(jpeg)
        await settle(m)
        let id = try #require(m.box?.items.first?.itemId)
        m.turnOffCloudChecks()
        m.retrySecondLook(id)
        await settle(m)
        #expect(m.secondLookError(id) == "Cloud checks are off right now, so this was not checked again.")
        #expect(j.events.filter { $0 == "cloud start" }.count == 2)
    }

    /// The reasons the card gives are the web app's own sentences (src/ai/secondLook.ts SECOND_LOOK_TEXT).
    @Test func theReasonsAreTheWebAppsSentences() throws {
        let web = try String(contentsOf: BoxStoreTests.repo.appendingPathComponent("src/ai/secondLook.ts"), encoding: .utf8)
        #expect(AppModel.secondLookText.count == 5)
        for (reason, text) in AppModel.secondLookText {
            #expect(web.contains("\(reason): \"\(text)\""), "\(reason)")
        }
    }
}
