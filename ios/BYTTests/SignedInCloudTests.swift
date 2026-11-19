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

    /// Stands in for AI Logic: it waits (as it does for the App Check token), then sends unless the
    /// read was cancelled meanwhile, the way URLSession refuses a cancelled task.
    final class TokenThenSend: ItemModelRunner, @unchecked Sendable {
        let gate = AppConfigTests.Gate()
        let reply: ItemReply
        private(set) var events: [String] = []
        init(_ reply: ItemReply) { self.reply = reply }
        func read(_ input: ItemInput) async -> Result<ItemReply, ReadError> {
            await gate.wait()
            if Task.isCancelled { events.append("cancelled"); return .failure(ReadError(.server)) }
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
        for _ in 0..<1000 where !inner.gate.isWaiting { await Task.yield() }
        #expect(inner.gate.isWaiting)
        pause.paused = true
        inner.gate.release()
        #expect(await reading.value == .failure(ReadError(.cloudPaused)))
        #expect(inner.events == ["cancelled"])
    }

    /// A read the reader gives up on (its time limit) cancels the upload too.
    @Test func cancellingTheReadCancelsTheUpload() async {
        let inner = TokenThenSend(ItemReply(read: read, tokens: nil))
        let runner = SignedInCloudRunner(ensureSignedIn: { true }, pause: PauseSwitch(), inner: inner)
        let reading = Task { await runner.read(words) }
        for _ in 0..<1000 where !inner.gate.isWaiting { await Task.yield() }
        reading.cancel()
        inner.gate.release()
        _ = await reading.value
        #expect(inner.events == ["cancelled"])
    }

    @Test func theAppsCloudRunnerReadsTheLivePauseSwitch() async throws {
        let model = AppModel(signIn: SignIn(isSignedIn: { true }, attempt: { true }))
        let runner = try #require(model.reader?.makeCloud("any-model") as? SignedInCloudRunner)
        #expect(!runner.pause.paused)
        var paused = RemoteConfigValues.defaults
        paused.killCloud = true
        await model.applyConfig(paused)
        #expect(runner.pause.paused)
    }

    @Test func theAppsReaderBuildsEveryCloudRunnerBehindSignIn() throws {
        let model = AppModel(signIn: SignIn(isSignedIn: { false }, attempt: { false }))
        let reader = try #require(model.reader)
        #expect(reader.makeCloud("any-model") is SignedInCloudRunner)
        #expect(reader.makeCloud(RemoteConfigValues.defaults.cloudModelItemFallback) is SignedInCloudRunner)
    }
}
