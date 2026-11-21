import BYTCore
import Foundation
import Testing
@testable import BYT

/// The box screen's words: the web app's, with "this iPhone" where the web says "this laptop".
@MainActor
@Suite struct ViewTextTests {
    @Test func theChipShowsTheWordWithItsOwnIconForEachLevel() {
        #expect(VerdictChip.word("ok") == "OK to pack" && VerdictChip.word("check") == "Check this" && VerdictChip.word("take_out") == "Take it out")
        let icons = ["ok", "check", "take_out"].map(VerdictChip.icon)
        #expect(Set(icons).count == 3 && icons.allSatisfy { !$0.isEmpty })
    }

    @Test func theSourceGlyphSaysWhereTheReadRan() {
        #expect(SourceGlyph.text("phone_on_device") == "Read on this iPhone")
        #expect(SourceGlyph.text("phone_cloud") == "Read in the cloud")
        #expect(SourceGlyph.text("manual") == "Typed by you")
        #expect(SourceGlyph.text("on_device") == "Read on a laptop")
        #expect(SourceGlyph.text("in_cloud") == "Read in the cloud")
    }

    @Test func theLayerListHasFourRows() throws {
        let s = try BoxStoreTests().store()
        let id = s.addManual(BoxStoreTests.lotion)
        let layers = try #require(s.result?.items[id]?.layers)
        #expect(layers.count == 4)
        #expect(LayerList.row(LayerStatus(id: "usps_export", label: "USPS export", edition: "e", state: "stale", checkedOn: "2026-11-01"))
            == "USPS export: out of date, 2026-11-01")
        #expect(LayerList.row(LayerStatus(id: "customs", label: "Customs", edition: "e", state: "missing", checkedOn: nil)) == "Customs: not loaded")
    }

    @Test func theRecheckLineSaysNoModelRan() {
        #expect(BoxSummaryView.recheckLine(items: 3, country: "Philippines", ms: 4.4) == "Re-checked 3 items for Philippines in 4 ms. 0 model calls.")
    }

    /// The iPhone runs no cloud second look yet, so no text in the app may say or imply one: one read
    /// and the rules decide, and the card says which read it was.
    @Test func noAppTextMentionsASecondLook() throws {
        let app = BoxStoreTests.repo.appendingPathComponent("ios/BYT")
        let files = try #require(FileManager.default.enumerator(at: app, includingPropertiesForKeys: nil)?.compactMap { $0 as? URL }
            .filter { $0.pathExtension == "swift" })
        #expect(files.count > 20, "the walk found the app's files")
        let literal = try Regex(#""(?:[^"\\\n]|\\.)*""#)
        var seen = 0
        for file in files {
            for line in try String(contentsOf: file, encoding: .utf8).split(separator: "\n")
            where !line.trimmingCharacters(in: .whitespaces).hasPrefix("//") {
                for match in line.matches(of: literal) {
                    seen += 1
                    let text = line[match.range].lowercased()
                    #expect(!text.contains("second look") && !text.contains("looked again"), "\(file.lastPathComponent): \(text)")
                }
            }
        }
        #expect(seen > 50, "the walk read the app's strings")
        #expect(SourceGlyph.text("phone_on_device") == "Read on this iPhone")
    }

    @Test func theDestinationsAreTheEditionsCountries() throws {
        let text = try String(contentsOf: BoxStoreTests.repo.appendingPathComponent("rules/edition.json"), encoding: .utf8)
        let list = AppModel.destinations(fromEdition: text)
        #expect(list.map(\.code) == ["CA", "PH"])
        #expect(list.allSatisfy { !$0.name.isEmpty })
    }
}
