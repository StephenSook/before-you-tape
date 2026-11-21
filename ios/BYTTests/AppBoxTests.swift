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

    /// A verdict never outlives the day it was made for: coming back to the app, or the date
    /// changing while it is open, derives every verdict again.
    /// The days come from the bundled edition, so a new edition cannot move them out from under the
    /// test: the edition's newest check is a day every layer is fresh, and the day after the first
    /// layer's window ends is a day one layer is stale.
    @Test func aStaleRuleCheckIsCaughtOnReturnAndAtMidnight() throws {
        let days = try Self.freshAndStaleDays()
        final class Day: @unchecked Sendable { var now = "" }
        let day = Day()
        day.now = days.fresh
        let model = AppModel(signIn: SignIn(isSignedIn: { false }, attempt: { false }), persistence: MemoryBoxPersistence(), today: { day.now })
        let box = try #require(model.box)
        let id = box.addManual(BoxStoreTests.lotion)
        #expect(box.result?.items[id]?.level == "ok")
        day.now = days.stale
        #expect(box.result?.items[id]?.level == "ok")
        model.becameActive()
        #expect(box.result?.items[id]?.level == "check")
        day.now = days.fresh
        model.dayChanged()
        #expect(box.result?.items[id]?.level == "ok")
    }

    /// Reads the layers' check dates and windows from rules/edition.json, as src/engine/layers.ts
    /// does for the box's country (USPS export rules, the country's rules and customs, suspensions).
    static func freshAndStaleDays() throws -> (fresh: String, stale: String) {
        let file = BoxStoreTests.repo.appendingPathComponent("rules/edition.json")
        let edition = try #require(try JSONSerialization.jsonObject(with: Data(contentsOf: file)) as? [String: Any])
        let windows = try #require((edition["limits"] as? [String: Any])?["staleDays"] as? [String: Int])
        let usps = try #require((edition["sources"] as? [[String: Any]])?.first { $0["id"] as? String == "usps_export" }?["checkedOn"] as? String)
        let suspensions = try #require((edition["suspensions"] as? [String: Any])?["checkedOn"] as? String)
        let country = try #require(((edition["destinations"] as? [String: Any])?[BoxStore.defaultDestination] as? [String: Any])?["checkedOn"] as? String)
        let layers = [(usps, try #require(windows["usps_export"])), (country, try #require(windows["destination"])),
                      (suspensions, try #require(windows["suspensions"])), (country, try #require(windows["customs"]))]
        let format = Date.ISO8601FormatStyle().year().month().day()
        func date(_ s: String) throws -> Date { try format.parse(s) }
        func day(_ d: Date) -> String { d.formatted(format) }
        let fresh = try #require(try layers.map { try date($0.0) }.max())
        // A layer is stale once its age passes its window (layers.ts: age > staleDays).
        let firstStale = try #require(try layers.map { try date($0.0).addingTimeInterval(Double($0.1 + 1) * 86_400) }.min())
        return (day(fresh), day(firstStale))
    }
}
