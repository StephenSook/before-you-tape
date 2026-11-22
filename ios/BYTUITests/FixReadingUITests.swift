import XCTest

/// A second look that lands while Fix this reading is open: the field the sender edited and the look moved
/// shows the new reading, and the form says so, so a number typed against the first read is not saved.
final class FixReadingUITests: XCTestCase {
    func testAFieldASecondLookMovesWhileTheFormIsOpenIsReset() {
        let app = XCUIApplication()
        app.launchArguments = ["-uiTestFakeReader", "-uiTestSecondLook", "-uiTestSlowLook"]
        app.launch()

        // A notice row can appear above the button while the app starts, moving it under the tap.
        for _ in 0..<3 where !app.navigationBars["Your box"].exists {
            app.buttons["Your box"].tap()
            _ = app.navigationBars["Your box"].waitForExistence(timeout: 3)
        }
        let fix = app.buttons["Fix this reading"]
        XCTAssertTrue(fix.waitForExistence(timeout: 10))
        fix.tap()
        let wh = app.textFields["Watt-hours (Wh)"]
        XCTAssertTrue(wh.waitForExistence(timeout: 5))
        XCTAssertEqual(wh.value as? String, "18.5")
        wh.tap()
        wh.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: 6) + "20")
        XCTAssertEqual(wh.value as? String, "20")
        attach(app, "1-edited")

        // The merged reading takes the cloud's 37 Wh: the edited field shows it, and the form names it.
        let note = app.staticTexts["fix-reading-reset"]
        XCTAssertTrue(note.waitForExistence(timeout: 25))
        XCTAssertEqual(note.label, "The second look changed Watt-hours (Wh). Check it again before you save.")
        XCTAssertEqual(wh.value as? String, "37")
        attach(app, "2-reset")
    }

    private func attach(_ app: XCUIApplication, _ name: String) {
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = name
        shot.lifetime = .keepAlways
        add(shot)
    }
}
