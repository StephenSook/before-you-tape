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

    @Test func theDestinationsAreTheEditionsCountries() throws {
        let text = try String(contentsOf: BoxStoreTests.repo.appendingPathComponent("rules/edition.json"), encoding: .utf8)
        let list = AppModel.destinations(fromEdition: text)
        #expect(list.map(\.code) == ["CA", "PH"])
        #expect(list.allSatisfy { !$0.name.isEmpty })
    }
}
