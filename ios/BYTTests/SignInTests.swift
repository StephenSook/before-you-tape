import Testing
@testable import BYT

@MainActor
@Suite struct SignInTests {
    @Test func ensureReturnsTrueWithoutASecondAttemptWhenSignedIn() async {
        var attempts = 0
        let s = SignIn(isSignedIn: { true }, attempt: { attempts += 1; return true })
        #expect(await s.ensure())
        #expect(attempts == 0)
    }

    @Test func ensureTriesOnceAndReportsFailure() async {
        var attempts = 0
        let s = SignIn(isSignedIn: { false }, attempt: { attempts += 1; return false })
        #expect(await s.ensure() == false)
        #expect(attempts == 1)
    }
}
