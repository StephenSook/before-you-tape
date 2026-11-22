import XCTest

/// A phone whose battery numbers a model read, with cloud checks off, held until the sender reads the
/// label: the card asks for the number printed on it in an empty field, and the field starts again,
/// empty, when the number it asks for changes and after a check.
final class LabelNumberUITests: XCTestCase {
    static let wh = "Type the Wh printed on the label"
    static let grams = "Type the lithium grams printed on the label"

    func testTheCardAsksForTheNumberOnTheLabelAndStartsEmptyAgain() {
        let app = XCUIApplication()
        app.launchArguments = ["-uiTestFakeReader", "-uiTestPhoneRead"]
        app.launch()

        // A notice row can appear above the button while the app starts, moving it under the tap.
        for _ in 0..<3 where !app.navigationBars["Your box"].exists {
            app.buttons["Your box"].tap()
            _ = app.navigationBars["Your box"].waitForExistence(timeout: 3)
        }
        XCTAssertTrue(app.navigationBars["Your box"].exists)
        let field = app.textFields["label-number"]
        XCTAssertTrue(field.waitForExistence(timeout: 15))
        XCTAssertEqual(field.placeholderValue, Self.wh)
        XCTAssertEqual(field.value as? String, Self.wh)
        let check = app.buttons["Check the number"]
        XCTAssertFalse(check.isEnabled)
        field.tap()
        field.typeText("7")
        XCTAssertTrue(check.isEnabled)
        attach(app, "1-half-typed")

        // The sender says the label prints lithium grams and no Wh: the field now asks for the grams, empty.
        app.buttons["Fix this reading"].tap()
        let whField = app.textFields["Watt-hours (Wh)"]
        XCTAssertTrue(whField.waitForExistence(timeout: 5))
        whField.tap()
        whField.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: 4))
        let gramsField = app.textFields["Lithium (grams)"]
        gramsField.tap()
        gramsField.typeText("1")
        app.buttons["Save"].tap()
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        XCTAssertEqual(field.placeholderValue, Self.grams)
        XCTAssertEqual(field.value as? String, Self.grams)
        attach(app, "2-grams")

        // A grams number checked against no reading saves only itself; the volts are still read, so it is still
        // asked, and the field starts again, empty.
        field.tap()
        field.typeText("0.5")
        check.tap()
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        XCTAssertEqual(field.value as? String, Self.grams)
        attach(app, "3-checked")
    }

    private func attach(_ app: XCUIApplication, _ name: String) {
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = name
        shot.lifetime = .keepAlways
        add(shot)
    }
}
