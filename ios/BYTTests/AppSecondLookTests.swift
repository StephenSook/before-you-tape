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
        return model(reader, consent: consent, online: online)
    }

    func model(_ reader: ItemReader, consent: Bool? = true, online: Bool = true) -> AppModel {
        let m = AppModel(signIn: SignIn(isSignedIn: { true }, attempt: { true }), onDeviceStatus: { .wordsAndPhotos },
                         persistence: MemoryBoxPersistence(), reader: reader, config: .defaults)
        m.network.pathChanged(satisfied: online)
        if let consent { m.box?.setConsent(consent) }
        return m
    }

    func settle(_ m: AppModel) async { await m.waitForSecondLooks() }

    static func ok(_ read: JSONValue) -> Result<ItemReply, ReadError> { .success(ItemReply(read: read, tokens: nil)) }

    /// A cloud reader whose calls wait until the test lets them go, so a look can be held mid-call.
    final class HeldCloud: ItemModelRunner, @unchecked Sendable {
        let journal: FakeItemRunner.Journal
        let reply: JSONValue
        /// Answers given before the reply, in order.
        private var results: [Result<ItemReply, ReadError>]
        private let lock = NSLock()
        private var waiting: [CheckedContinuation<Void, Never>] = []
        private var open = false
        init(_ journal: FakeItemRunner.Journal, reply: JSONValue, first results: [Result<ItemReply, ReadError>] = []) {
            self.journal = journal
            self.reply = reply
            self.results = results
        }

        func read(_ input: ItemInput) async -> Result<ItemReply, ReadError> {
            journal.add("cloud start")
            await withCheckedContinuation { c in
                lock.lock()
                if open { lock.unlock(); c.resume() } else { waiting.append(c); lock.unlock() }
            }
            journal.add("cloud end")
            return lock.withLock { results.isEmpty ? .success(ItemReply(read: reply, tokens: nil)) : results.removeFirst() }
        }

        func letGo() {
            lock.lock()
            open = true
            let all = waiting
            waiting = []
            lock.unlock()
            all.forEach { $0.resume() }
        }
    }

    /// Removing an item whose look waits behind another look sends nothing for it, and forgets its crop.
    @Test func removingAnItemSendsNothingForItsWaitingLook() async throws {
        let j = FakeItemRunner.Journal()
        let cloud = HeldCloud(j, reply: Self.powerBank)
        let reader = ItemReader(device: FakeItemRunner("device", journal: j, results: [Self.ok(Self.powerBank), Self.ok(Self.powerBank)]),
                                makeCloud: { _ in cloud }, parse: { ParsedRead(read: $0) })
        let m = model(reader)
        await m.readPhoto(jpeg)
        while !j.events.contains("cloud start") { await Task.yield() }
        await m.readPhoto(jpeg)
        let second = try #require(m.box?.items.last?.itemId)
        // The second look has started and waits for the first one's lane.
        while !m.isCheckingAgain(second) { await Task.yield() }
        m.remove(second)
        cloud.letGo()
        await settle(m)
        #expect(j.events.filter { $0 == "cloud start" }.count == 1)
        #expect(m.box?.items.count == 1 && m.box?.sources.secondLooks == 1)
        #expect(m.pendingLookCount == 0 && m.secondLookError(second) == nil)
    }

    /// A look removed while it waits in line behind another lets go at once (its task ends and its crop
    /// goes), without waiting for the look ahead to finish.
    @Test func aRemovedLookWaitingInLineLetsGoAtOnce() async throws {
        let j = FakeItemRunner.Journal()
        let cloud = HeldCloud(j, reply: Self.powerBank)
        let reader = ItemReader(device: FakeItemRunner("device", journal: j, results: [Self.ok(Self.powerBank), Self.ok(Self.powerBank)]),
                                makeCloud: { _ in cloud }, parse: { ParsedRead(read: $0) })
        let m = model(reader)
        await m.readPhoto(jpeg)
        while !j.events.contains("cloud start") { await Task.yield() }
        await m.readPhoto(jpeg)
        let second = try #require(m.box?.items.last?.itemId)
        while !m.isCheckingAgain(second) { await Task.yield() }
        #expect(m.lookTaskCount == 2)
        m.remove(second)
        for _ in 0..<300 where m.lookTaskCount > 1 { try await Task.sleep(for: .milliseconds(10)) }
        #expect(m.lookTaskCount == 1 && !m.isCheckingAgain(second))
        cloud.letGo()
        await settle(m)
    }

    /// "Try again" replaces a retry still waiting its turn: the look runs now, and the old wait sends
    /// nothing later.
    @Test func tryAgainReplacesAWaitingRetry() async throws {
        let j = FakeItemRunner.Journal()
        let m = model(j, cloud: [.failure(ReadError(.network)), .failure(ReadError(.network)), Self.ok(Self.powerBank)])
        m.lookBackoff = { _ in 30 }
        await m.readPhoto(jpeg)
        let id = try #require(m.box?.items.first?.itemId)
        while m.secondLookError(id) == nil { await Task.yield() }
        let start = ContinuousClock.now
        m.retrySecondLook(id)
        await settle(m)
        #expect(ContinuousClock.now - start < .seconds(10))
        #expect(m.box?.items.first?.secondLook != nil && j.events.filter { $0 == "cloud start" }.count == 3)
    }

    /// One look per item at a time: "Try again" while a look runs replaces it (the running one sends
    /// nothing more), and automatic tries never go past the cap.
    @Test func aRetryAskedWhileALookRunsNeverSendsMoreThanTheCap() async throws {
        let j = FakeItemRunner.Journal()
        let cloud = HeldCloud(j, reply: Self.powerBank, first: Array(repeating: .failure(ReadError(.network)), count: 20))
        let reader = ItemReader(device: FakeItemRunner("device", journal: j, results: [Self.ok(Self.powerBank)]),
                                makeCloud: { _ in cloud }, parse: { ParsedRead(read: $0) })
        let m = model(reader)
        m.lookBackoff = { _ in 0 }
        await m.readPhoto(jpeg)
        let id = try #require(m.box?.items.first?.itemId)
        while !j.events.contains("cloud start") { await Task.yield() }
        m.retrySecondLook(id)
        cloud.letGo()
        await settle(m)
        // The replaced look's one call, then the new look's first try and three more, each a call and its retry.
        #expect(j.events.filter { $0 == "cloud start" }.count == 9, "\(j.events.filter { $0 == "cloud start" }.count)")
        #expect(m.secondLookError(id) == "The cloud step did not run. Try again.")
    }

    /// Sign-in that does not answer until the test lets it.
    @MainActor final class HeldSignIn {
        private(set) var started = false
        private var waiting: CheckedContinuation<Bool, Never>?
        func wait() async -> Bool {
            started = true
            return await withCheckedContinuation { waiting = $0 }
        }
        func letGo() { waiting?.resume(returning: true); waiting = nil }
    }

    /// Cloud checks taken back and allowed again while the look signs in: the look was forgotten, so
    /// nothing is sent for it when sign-in answers.
    @Test func aLookTakenBackDuringSignInSendsNothing() async throws {
        let j = FakeItemRunner.Journal()
        let signIn = HeldSignIn()
        let inner = FakeItemRunner("cloud", journal: j, results: [Self.ok(Self.powerBank)])
        let cloud = SignedInCloudRunner(ensureSignedIn: { await signIn.wait() }, pause: PauseSwitch(), inner: inner)
        let reader = ItemReader(device: FakeItemRunner("device", journal: j, results: [Self.ok(Self.powerBank)]),
                                makeCloud: { _ in cloud }, parse: { ParsedRead(read: $0) })
        let m = model(reader)
        await m.readPhoto(jpeg)
        while !signIn.started { await Task.yield() }
        m.turnOffCloudChecks()
        await m.answerConsent(true)
        signIn.letGo()
        await settle(m)
        #expect(!j.events.contains("cloud start") && m.box?.items.first?.secondLook == nil)
    }

    /// Turning cloud checks off forgets every look not landed, and its crop, so none is sent later.
    @Test func turningCloudChecksOffForgetsLooksNotLanded() async throws {
        let j = FakeItemRunner.Journal()
        let m = model(j, cloud: [.failure(ReadError(.parseFailed)), Self.ok(Self.powerBank)])
        await m.readPhoto(jpeg)
        await settle(m)
        let id = try #require(m.box?.items.first?.itemId)
        #expect(m.pendingLookCount == 1 && m.secondLookError(id) != nil)
        m.turnOffCloudChecks()
        #expect(m.pendingLookCount == 0 && m.secondLookError(id) == nil)
        await m.answerConsent(true)
        m.retrySecondLook(id)
        await settle(m)
        #expect(j.events.filter { $0 == "cloud start" }.count == 1 && m.box?.items.first?.secondLook == nil)
    }

    /// A look that ended keeps no task behind.
    @Test func finishedLooksLeaveNoTaskBehind() async {
        let j = FakeItemRunner.Journal()
        let m = model(j, cloud: [Self.ok(Self.powerBank)])
        await m.readPhoto(jpeg)
        await settle(m)
        #expect(m.box?.items.first?.secondLook != nil && m.lookTaskCount == 0 && m.pendingLookCount == 0)
    }

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

    /// No connection, and the iPhone offline when the failure lands: the look waits, the card says so,
    /// and it runs once the iPhone is back online.
    @Test func aLookThatFailedForNoConnectionRunsWhenBackOnline() async throws {
        let j = FakeItemRunner.Journal()
        let cloud = HeldCloud(j, reply: Self.powerBank, first: [.failure(ReadError(.network)), .failure(ReadError(.network))])
        let reader = ItemReader(device: FakeItemRunner("device", journal: j, results: [Self.ok(Self.powerBank)]),
                                makeCloud: { _ in cloud }, parse: { ParsedRead(read: $0) })
        let m = model(reader)
        m.lookBackoff = { _ in 0 }
        await m.readPhoto(jpeg)
        while !j.events.contains("cloud start") { await Task.yield() }
        m.network.pathChanged(satisfied: false)
        cloud.letGo()
        await settle(m)
        let id = try #require(m.box?.items.first?.itemId)
        #expect(m.secondLookError(id) == "No connection. This check will run when you are back online.")
        #expect(m.box?.items.first?.secondLook == nil)
        m.network.pathChanged(satisfied: true)
        await settle(m)
        #expect(m.box?.items.first?.secondLook != nil && m.secondLookError(id) == nil)
    }

    /// No connection while the iPhone says it is online (the connection came back before the failure
    /// landed, so no reconnect will come): the look is tried again after a wait.
    @Test func aConnectionFailureWhileOnlineIsTriedAgainAfterAWait() async throws {
        let j = FakeItemRunner.Journal()
        let m = model(j, cloud: [.failure(ReadError(.network)), .failure(ReadError(.network)), Self.ok(Self.powerBank)])
        m.lookBackoff = { _ in 0 }
        await m.readPhoto(jpeg)
        await settle(m)
        let id = try #require(m.box?.items.first?.itemId)
        #expect(m.box?.items.first?.secondLook != nil && m.secondLookError(id) == nil)
    }

    /// Tried again three times at most; then the card says so, and "Try again" starts afresh.
    @Test func connectionFailuresStopAfterThreeTriesAgain() async throws {
        let j = FakeItemRunner.Journal()
        let m = model(j, cloud: Array(repeating: .failure(ReadError(.network)), count: 8) + [Self.ok(Self.powerBank)])
        var waits: [Int] = []
        m.lookBackoff = { n in waits.append(n); return 0 }
        await m.readPhoto(jpeg)
        await settle(m)
        let id = try #require(m.box?.items.first?.itemId)
        // Each try is a call and its one retry: the first try and three more.
        #expect(j.events.filter { $0 == "cloud start" }.count == 8 && waits == [1, 2, 3])
        #expect(m.secondLookError(id) == "The cloud step did not run. Try again." && m.box?.items.first?.secondLook == nil)
        m.retrySecondLook(id)
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
    /// Turned off after a look failed, it is forgotten: "Try again" sends nothing and no failure line
    /// stays. A pause from the server still says why on the card.
    @Test func cloudChecksTurnedOffStopTheLook() async throws {
        let j = FakeItemRunner.Journal()
        let m = model(j, cloud: [.failure(ReadError(.server)), .failure(ReadError(.server))])
        await m.readPhoto(jpeg)
        await settle(m)
        let id = try #require(m.box?.items.first?.itemId)
        m.turnOffCloudChecks()
        m.retrySecondLook(id)
        await settle(m)
        #expect(m.secondLookError(id) == nil && m.pendingLookCount == 0)
        #expect(j.events.filter { $0 == "cloud start" }.count == 2)
        #expect(AppModel.secondLookFailure(.cloudPaused) == "Cloud checks are off right now, so this was not checked again.")
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
