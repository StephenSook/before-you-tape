import Foundation
import Testing
@testable import BYT

/// The app's rules come from the edition shipped with it. If the engine refuses that edition, the
/// app says so plainly and checks nothing, instead of failing every verdict in silence.
@MainActor
@Suite struct AppRulesTests {
    @Test func theShippedEditionLoads() {
        let model = AppModel(signIn: SignIn(isSignedIn: { false }, attempt: { false }), persistence: MemoryBoxPersistence())
        #expect(model.rulesProblem == nil && model.box != nil && model.box?.result != nil && !model.destinations.isEmpty)
    }

    @Test func anEditionTheEngineRefusesIsShownNotSwallowed() {
        let model = AppModel(signIn: SignIn(isSignedIn: { false }, attempt: { false }), persistence: MemoryBoxPersistence(),
                             editionText: #"{"editionId":"byt-x","revision":1}"#)
        #expect(model.rulesProblem == AppModel.rulesFailed && model.box == nil && model.engine == nil && model.destinations.isEmpty)
        #expect(AppModel.rulesFailed == "This app's rules could not load. Update the app.")
    }
}
