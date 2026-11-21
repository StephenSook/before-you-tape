import BYTCore
import Foundation
import Testing
@testable import BYT

/// AI Logic serves signed-in users only: every cloud read waits for anonymous sign-in, and a
/// failed sign-in sends nothing to the cloud.
@MainActor
@Suite struct SignedInCloudTests {
    let read: JSONValue = .object(["itemName": .string("Perfume")])
    let words = ItemInput.words("EAU DE PARFUM 50 ML")

    @Test func aCloudReadStartsOnlyAfterSignIn() async {
        let j = FakeItemRunner.Journal()
        let inner = FakeItemRunner("cloud", journal: j, results: [.success(ItemReply(read: read, tokens: nil))])
        let runner = SignedInCloudRunner(ensureSignedIn: { j.add("signIn"); return true }, pause: PauseSwitch(), inner: inner)
        #expect(await runner.read(words) == .success(ItemReply(read: read, tokens: nil)))
        #expect(j.events == ["signIn", "cloud start", "cloud end"])
    }

    @Test func aFailedSignInSendsNothingToTheCloud() async {
        let j = FakeItemRunner.Journal()
        let inner = FakeItemRunner("cloud", journal: j, results: [.success(ItemReply(read: read, tokens: nil))])
        let runner = SignedInCloudRunner(ensureSignedIn: { j.add("signIn"); return false }, pause: PauseSwitch(), inner: inner)
        #expect(await runner.read(words) == .failure(ReadError(.notSignedIn)))
        #expect(j.events == ["signIn"])
    }

    /// The pause can arrive while sign-in is still running: it is read again after sign-in, right
    /// before anything is sent.
    @Test func aPauseAppliedDuringSignInSendsNothing() async {
        let j = FakeItemRunner.Journal()
        let pause = PauseSwitch()
        let inner = FakeItemRunner("cloud", journal: j, results: [.success(ItemReply(read: read, tokens: nil))])
        let runner = SignedInCloudRunner(ensureSignedIn: { j.add("signIn"); pause.paused = true; return true },
                                         pause: pause, inner: inner)
        #expect(await runner.read(words) == .failure(ReadError(.cloudPaused)))
        #expect(j.events == ["signIn"])
    }

    @MainActor final class Flag { var on = true }

    /// What the caller wants can change while sign-in runs (the item removed, cloud checks taken back):
    /// it is read again after sign-in, right before anything is sent, with the pause.
    @Test func aReadNoLongerWantedAfterSignInSendsNothing() async {
        let j = FakeItemRunner.Journal()
        let wanted = Flag()
        let inner = FakeItemRunner("cloud", journal: j, results: [.success(ItemReply(read: read, tokens: nil))])
        let runner = SignedInCloudRunner(ensureSignedIn: { j.add("signIn"); wanted.on = false; return true }, pause: PauseSwitch(), inner: inner)
        #expect(await runner.read(words, stillWanted: { wanted.on }) == .failure(ReadError(.cloudPaused)))
        #expect(j.events == ["signIn"])
    }

    @MainActor final class Answers { var left: [Bool]; init(_ a: [Bool]) { left = a }; func next() -> Bool { left.isEmpty ? false : left.removeFirst() } }

    /// Wanted when the upload starts, no longer wanted by the time the upload itself would send (the item
    /// removed in between): the upload asks again inside itself, right before the call, and sends nothing.
    @Test func anUploadNoLongerWantedWhenItRunsSendsNothing() async {
        let j = FakeItemRunner.Journal()
        let answers = Answers([true, false])
        let inner = FakeItemRunner("cloud", journal: j, results: [.success(ItemReply(read: read, tokens: nil))])
        let runner = SignedInCloudRunner(ensureSignedIn: { true }, pause: PauseSwitch(), inner: inner)
        #expect(await runner.read(words, stillWanted: { answers.next() }) == .failure(ReadError(.cloudPaused)))
        #expect(j.events.isEmpty)
    }

    @MainActor final class CallerBox { var task: Task<Result<ItemReply, ReadError>, Never>? }

    /// The caller is cancelled (its item removed) between the check before the upload and the upload's
    /// start, while every check still says wanted: the cancellation reaches the upload, and no read is made.
    @Test func aCallerCancelledBetweenTheCheckAndTheStartMakesNoRead() async {
        let j = FakeItemRunner.Journal()
        let inner = FakeItemRunner("cloud", journal: j, results: [.success(ItemReply(read: read, tokens: nil))])
        let runner = SignedInCloudRunner(ensureSignedIn: { true }, pause: PauseSwitch(), inner: inner)
        let caller = CallerBox()
        var checks = 0
        let words = words
        caller.task = Task {
            await runner.read(words, stillWanted: {
                checks += 1
                if checks == 1 { caller.task?.cancel() }
                return true
            })
        }
        let result = await caller.task?.value
        #expect(result == .failure(ReadError(.cloudPaused)) && j.events.isEmpty, "\(j.events)")
    }

    /// Stands in for AI Logic: it waits (as it does for the App Check token), then sends unless the
    /// read was cancelled meanwhile, the way URLSession refuses a cancelled task.
    final class TokenThenSend: ItemModelRunner, @unchecked Sendable {
        let gate = AppConfigTests.Gate()
        let reply: ItemReply
        /// Answers even when cancelled, as a reply already on its way back can.
        var ignoresCancellation = false
        private(set) var events: [String] = []
        init(_ reply: ItemReply, ignoresCancellation: Bool = false) {
            self.reply = reply
            self.ignoresCancellation = ignoresCancellation
        }
        func read(_ input: ItemInput) async -> Result<ItemReply, ReadError> {
            await gate.wait()
            if Task.isCancelled, !ignoresCancellation { events.append("cancelled"); return .failure(ReadError(.server)) }
            events.append("sent")
            return .success(reply)
        }
    }

    /// The pause can land while the upload waits for its token: the upload is cancelled, and a
    /// reply that arrives anyway is not used.
    @Test func aPauseDuringTheUploadCancelsIt() async {
        let pause = PauseSwitch()
        let inner = TokenThenSend(ItemReply(read: read, tokens: nil))
        let runner = SignedInCloudRunner(ensureSignedIn: { true }, pause: pause, inner: inner)
        let reading = Task { await runner.read(words) }
        await inner.gate.untilWaiting()
        #expect(inner.gate.isWaiting)
        pause.paused = true
        inner.gate.release()
        #expect(await reading.value == .failure(ReadError(.cloudPaused)))
        #expect(inner.events == ["cancelled"])
    }

    /// A read the pause cancelled is dropped even if its reply comes back and the pause is lifted
    /// before it does: the read's own cancellation decides, not the switch's value at that moment.
    @Test func aReplyFromAReadThePauseCancelledIsDroppedAfterAResume() async {
        let pause = PauseSwitch()
        let inner = TokenThenSend(ItemReply(read: read, tokens: nil), ignoresCancellation: true)
        let runner = SignedInCloudRunner(ensureSignedIn: { true }, pause: pause, inner: inner)
        let reading = Task { await runner.read(words) }
        await inner.gate.untilWaiting()
        pause.paused = true
        pause.paused = false
        inner.gate.release()
        #expect(await reading.value == .failure(ReadError(.cloudPaused)))
        #expect(inner.events == ["sent"])
    }

    /// A read the reader gives up on (its time limit) cancels the upload too.
    @Test func cancellingTheReadCancelsTheUpload() async {
        let inner = TokenThenSend(ItemReply(read: read, tokens: nil))
        let runner = SignedInCloudRunner(ensureSignedIn: { true }, pause: PauseSwitch(), inner: inner)
        let reading = Task { await runner.read(words) }
        await inner.gate.untilWaiting()
        reading.cancel()
        inner.gate.release()
        _ = await reading.value
        #expect(inner.events == ["cancelled"])
    }

    @Test func theAppsCloudRunnerReadsTheLivePauseSwitch() async throws {
        // Before Remote Config gives its own kill switch the cloud is held.
        let fresh = AppModel(signIn: SignIn(isSignedIn: { true }, attempt: { true }), persistence: MemoryBoxPersistence())
        #expect(try #require(fresh.reader?.makeCloud("any-model") as? SignedInCloudRunner).pause.paused)
        let model = AppModel(signIn: SignIn(isSignedIn: { true }, attempt: { true }), persistence: MemoryBoxPersistence(), config: .defaults)
        let runner = try #require(model.reader?.makeCloud("any-model") as? SignedInCloudRunner)
        // Settings known, but the sender has not allowed the cloud yet: still closed.
        #expect(runner.pause.paused)
        await model.answerConsent(true)
        #expect(!runner.pause.paused)
        var paused = RemoteConfigValues.defaults
        paused.killCloud = true
        await model.applyConfig(paused)
        #expect(runner.pause.paused)
    }

    /// Turning off cloud checks closes the same gate the pause closes: an upload waiting for its
    /// token is cancelled and nothing new starts. Turning them on again asks the cloud question first.
    @Test func turningOffCloudChecksCancelsAnUploadInFlight() async throws {
        let model = AppModel(signIn: SignIn(isSignedIn: { true }, attempt: { true }), persistence: MemoryBoxPersistence(), config: .defaults)
        await model.answerConsent(true)
        #expect(model.cloudChoice == AppModel.CloudChoice(line: "Cloud checks are on.", button: "Turn off cloud checks"))
        let gate = try #require(model.reader?.makeCloud("any-model") as? SignedInCloudRunner).pause
        let inner = TokenThenSend(ItemReply(read: read, tokens: nil))
        let runner = SignedInCloudRunner(ensureSignedIn: { true }, pause: gate, inner: inner)
        let reading = Task { await runner.read(words) }
        await inner.gate.untilWaiting()
        #expect(inner.gate.isWaiting)
        model.turnOffCloudChecks()
        inner.gate.release()
        #expect(await reading.value == .failure(ReadError(.cloudPaused)))
        #expect(inner.events == ["cancelled"] && model.box?.cloudConsent == false && gate.paused)
        #expect(model.cloudChoice == AppModel.CloudChoice(line: "Cloud checks are off. Photos and label words stay on this iPhone.",
                                                          button: "Turn on cloud checks"))
        // A new upload is refused at the boundary while they are off.
        #expect(await SignedInCloudRunner(ensureSignedIn: { true }, pause: gate, inner: TokenThenSend(ItemReply(read: read, tokens: nil)))
            .read(words) == .failure(ReadError(.cloudPaused)))
        model.turnOnCloudChecks()
        #expect(model.box?.cloudConsent == nil && gate.paused && model.cloudChoice == nil)
        await model.answerConsent(true)
        #expect(!gate.paused)
    }

    /// A read stopped because cloud checks were turned off says so.
    @Test func aReadStoppedByTurningOffCloudChecksSaysSo() {
        let stopped = ReadOutcome(read: nil, source: nil, route: .hybrid, failure: .cloudPaused, records: [])
        #expect(AppModel.readLine(stopped, verdict: nil, consent: false) == "Cloud checks are off, so this was not checked.")
    }

    @Test func theAppsReaderBuildsEveryCloudRunnerBehindSignIn() throws {
        let model = AppModel(signIn: SignIn(isSignedIn: { false }, attempt: { false }))
        let reader = try #require(model.reader)
        #expect(reader.makeCloud("any-model") is SignedInCloudRunner)
        #expect(reader.makeCloud(RemoteConfigValues.defaults.cloudModelItemFallback) is SignedInCloudRunner)
    }
}
