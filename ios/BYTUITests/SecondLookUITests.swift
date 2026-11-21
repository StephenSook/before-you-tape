import XCTest

/// A photo read on this iPhone that the rules send for a cloud second look. Launch arguments swap in
/// fixed readers (debug builds only): the device reads a power bank, the cloud reads other numbers
/// and battery words, and the app runs its own second look on them. The card shows why it looked
/// again and the two disputes, and the sender settles them on screen.
final class SecondLookUITests: XCTestCase {
    func testTheCardShowsASecondLookAndSettlesItsDisputes() {
        let app = XCUIApplication()
        app.launchArguments = ["-uiTestFakeReader", "-uiTestSecondLook"]
        app.launch()

        app.buttons["Your box"].tap()
        let reason = app.staticTexts["Battery numbers decide what may be mailed, so the cloud read them again."]
        XCTAssertTrue(reason.waitForExistence(timeout: 15))
        let disagree = app.staticTexts["The two reads disagree. Pick what the item shows."]
        XCTAssertTrue(disagree.exists)
        XCTAssertTrue(app.buttons["Second look: 3.7 V, 10000 mAh, 37 Wh"].exists)
        attach(app, "1-disputes")

        // Both reads have numbers, so picking one settles it at once.
        let numbers = app.buttons["First read: 3.7 V, 5000 mAh, 18.5 Wh"]
        XCTAssertTrue(numbers.exists)
        numbers.tap()
        XCTAssertTrue(numbers.waitForNonExistence(timeout: 5))

        // "Not seen" would drop the battery words the second look saw, so the card asks first.
        let notSeen = app.buttons["First read: Not seen"]
        XCTAssertTrue(notSeen.exists)
        notSeen.tap()
        let ask = app.staticTexts["The second look saw battery words. Use Not seen only if the item really shows that."]
        XCTAssertTrue(ask.waitForExistence(timeout: 5))
        attach(app, "2-confirm")
        app.buttons["Keep both for now"].tap()
        XCTAssertTrue(ask.waitForNonExistence(timeout: 5))
        XCTAssertTrue(notSeen.exists)

        notSeen.tap()
        XCTAssertTrue(app.buttons["Yes, use Not seen"].waitForExistence(timeout: 5))
        app.buttons["Yes, use Not seen"].tap()
        XCTAssertTrue(notSeen.waitForNonExistence(timeout: 5))

        // The fixed device reader tags no label words, while the box tags the cloud's label, so the
        // label words differ too. Picking the second look's words drops nothing, so it settles at once.
        let words = app.buttons["Second look: li ion, power bank label"]
        XCTAssertTrue(words.exists)
        attach(app, "3-one-left")
        words.tap()
        XCTAssertTrue(disagree.waitForNonExistence(timeout: 5))
        XCTAssertTrue(reason.exists)
        attach(app, "4-settled")
    }

    private func attach(_ app: XCUIApplication, _ name: String) {
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = name
        shot.lifetime = .keepAlways
        add(shot)
    }
}
