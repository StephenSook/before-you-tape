import BYTCore
import Foundation
import Testing
@testable import BYT

/// The app's box runs on the rule edition bundled with the app, which is the repo's own edition.
@MainActor
@Suite struct AppBoxTests {
    @Test func theAppsBoxUsesTheBundledEdition() throws {
        let file = BoxStoreTests.repo.appendingPathComponent("rules/edition.json")
        let expected = try RulesEngine().setEdition(String(contentsOf: file, encoding: .utf8)).editionId
        let model = AppModel(signIn: SignIn(isSignedIn: { false }, attempt: { false }), persistence: MemoryBoxPersistence())
        let box = try #require(model.box)
        #expect(box.result?.editionId == expected)
        let id = box.addManual(BoxStoreTests.lotion)
        #expect(box.result?.items[id]?.headline == "OK to pack")
    }

    @Test func todayIsTheLocalCalendarDate() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "America/New_York")!
        // 02:30 UTC on Nov 21 is still Nov 20 in New York.
        let instant = Date(timeIntervalSince1970: 1_763_692_200)
        #expect(AppModel.localDate(instant, calendar: calendar) == "2025-11-20")
    }

    /// The box is the same box after a relaunch: its id is kept, and its saved items come back.
    @Test func theBoxSurvivesARelaunch() throws {
        let defaults = try #require(UserDefaults(suiteName: "box-relaunch-\(UUID().uuidString)"))
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("relaunch-\(UUID().uuidString)")
        let signIn = SignIn(isSignedIn: { false }, attempt: { false })
        let first = AppModel(signIn: signIn, persistence: BoxFiles(folder: folder), defaults: defaults)
        let id = try #require(first.box).addManual(BoxStoreTests.lotion)
        let second = AppModel(signIn: signIn, persistence: BoxFiles(folder: folder), defaults: defaults)
        #expect(second.box?.boxId == first.box?.boxId)
        #expect(second.box?.items.map(\.itemId) == [id])
        #expect(second.box?.result?.items[id]?.headline == "OK to pack")
    }
}
