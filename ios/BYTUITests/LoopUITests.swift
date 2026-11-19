import XCTest

/// The loop on screen: read an item, see its verdict, change the country, and see the box
/// re-checked by the rules alone. A launch argument swaps in a fixed reader (debug builds only),
/// so the test needs no model; the photo picker runs outside the app, so the label words field
/// carries the item in.
final class LoopUITests: XCTestCase {
    func testReadAVerdictThenFlipTheCountry() {
        let app = XCUIApplication()
        app.launchArguments = ["-uiTestFakeReader"]
        app.launch()

        app.buttons["Check an item"].tap()
        let words = app.descendants(matching: .any)["label-words"]
        XCTAssertTrue(words.waitForExistence(timeout: 10))
        words.tap()
        words.typeText("SHEA BODY LOTION 8 FL OZ")
        app.buttons["Read these words"].tap()
        let line = app.staticTexts["read-line"]
        XCTAssertTrue(line.waitForExistence(timeout: 10))
        XCTAssertEqual(line.label, "Body lotion: OK to pack. Read on this iPhone.")

        app.navigationBars.buttons.element(boundBy: 0).tap()
        app.buttons["Your box"].tap()
        XCTAssertTrue(app.staticTexts["1 OK to pack"].waitForExistence(timeout: 10))
        // Model calls are counted where the reader is called, not taken from the screen's own words.
        let calls = app.staticTexts["ui-test-model-calls"]
        XCTAssertTrue(calls.waitForExistence(timeout: 5))
        XCTAssertEqual(calls.label, "Model calls: 1")
        app.buttons["destination-picker"].tap()
        app.buttons["Philippines"].tap()

        XCTAssertTrue(app.staticTexts["1 to take out"].waitForExistence(timeout: 10))
        let recheck = app.staticTexts["recheck-line"]
        XCTAssertTrue(recheck.waitForExistence(timeout: 5))
        XCTAssertTrue(recheck.label.hasPrefix("Re-checked 1 items for Philippines in "), recheck.label)
        XCTAssertTrue(recheck.label.hasSuffix("ms. 0 model calls."), recheck.label)
        XCTAssertEqual(app.staticTexts["ui-test-model-calls"].label, "Model calls: 1")
    }
}
