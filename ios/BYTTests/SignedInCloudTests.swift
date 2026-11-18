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
        let runner = SignedInCloudRunner(ensureSignedIn: { j.add("signIn"); return true }, cloudOpen: { true }, inner: inner)
        #expect(await runner.read(words) == .success(ItemReply(read: read, tokens: nil)))
        #expect(j.events == ["signIn", "cloud start", "cloud end"])
    }

    @Test func aFailedSignInSendsNothingToTheCloud() async {
        let j = FakeItemRunner.Journal()
        let inner = FakeItemRunner("cloud", journal: j, results: [.success(ItemReply(read: read, tokens: nil))])
        let runner = SignedInCloudRunner(ensureSignedIn: { j.add("signIn"); return false }, cloudOpen: { true }, inner: inner)
        #expect(await runner.read(words) == .failure(ReadError(.notSignedIn)))
        #expect(j.events == ["signIn"])
    }

    /// The pause can arrive while sign-in is still running: it is read again after sign-in, right
    /// before anything is sent.
    @Test func aPauseAppliedDuringSignInSendsNothing() async {
        final class Switch { var paused = false }
        let j = FakeItemRunner.Journal()
        let pause = Switch()
        let inner = FakeItemRunner("cloud", journal: j, results: [.success(ItemReply(read: read, tokens: nil))])
        let runner = SignedInCloudRunner(ensureSignedIn: { j.add("signIn"); pause.paused = true; return true },
                                         cloudOpen: { !pause.paused }, inner: inner)
        #expect(await runner.read(words) == .failure(ReadError(.cloudPaused)))
        #expect(j.events == ["signIn"])
    }

    @Test func theAppsCloudRunnerReadsTheLivePauseSwitch() async throws {
        let model = AppModel(signIn: SignIn(isSignedIn: { true }, attempt: { true }))
        let runner = try #require(model.reader?.makeCloud("any-model") as? SignedInCloudRunner)
        #expect(runner.cloudOpen())
        var paused = RemoteConfigValues.defaults
        paused.killCloud = true
        await model.applyConfig(paused)
        #expect(!runner.cloudOpen())
    }

    @Test func theAppsReaderBuildsEveryCloudRunnerBehindSignIn() throws {
        let model = AppModel(signIn: SignIn(isSignedIn: { false }, attempt: { false }))
        let reader = try #require(model.reader)
        #expect(reader.makeCloud("any-model") is SignedInCloudRunner)
        #expect(reader.makeCloud(RemoteConfigValues.defaults.cloudModelItemFallback) is SignedInCloudRunner)
    }
}
