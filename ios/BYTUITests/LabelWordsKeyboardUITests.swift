import XCTest

/// The label words field low on the screen, where the live camera view puts it on a real iPhone. The
/// simulator has no camera, so the largest text size pushes the field down instead. With the keyboard
/// up, "Read these words" must stay above it; the button and Return must read the words once and close
/// the keyboard; and swiping the page down must close it too.
final class LabelWordsKeyboardUITests: XCTestCase {
    private let verdict = "Body lotion: OK to pack. Read on this iPhone."

    private func launchWithFieldLow() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = [
            "-uiTestFakeReader",
            "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL",
        ]
        app.launch()
        // At this text size the Ready check list loads its lower rows only once they scroll on screen.
        let check = app.buttons["Check an item"]
        for _ in 0..<6 where !check.isHittable { app.swipeUp() }
        check.tap()
        let words = app.descendants(matching: .any)["label-words"]
        XCTAssertTrue(words.waitForExistence(timeout: 10))
        // The case under test: the field sits in the screen's lower half, where the keyboard opens.
        XCTAssertGreaterThan(words.frame.midY, app.frame.height / 2, "field at \(words.frame)")
        return app
    }

    /// Waits for the keyboard and any scroll to settle, then checks the button is above the keyboard.
    private func assertReadButtonAboveKeyboard(_ app: XCUIApplication, _ moment: String) {
        let keyboard = app.keyboards.element
        XCTAssertTrue(keyboard.waitForExistence(timeout: 5), "no on-screen keyboard \(moment)")
        let read = app.buttons["Read these words"]
        let settled = expectation(for: NSPredicate { _, _ in read.frame.maxY <= keyboard.frame.minY }, evaluatedWith: nil)
        wait(for: [settled], timeout: 5)
        XCTAssertLessThanOrEqual(read.frame.maxY, keyboard.frame.minY, "\(moment): button \(read.frame), keyboard \(keyboard.frame)")
    }

    private func waitForNoKeyboard(_ app: XCUIApplication) {
        let gone = expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: app.keyboards.element)
        wait(for: [gone], timeout: 5)
    }

    /// Opens the box from the Ready check and returns how many times the reader was called.
    private func modelCalls(_ app: XCUIApplication) -> String? {
        app.navigationBars.buttons.element(boundBy: 0).tap()
        let box = app.buttons["Your box"]
        for _ in 0..<6 where !box.isHittable { app.swipeDown() }
        box.tap()
        let calls = app.staticTexts["ui-test-model-calls"]
        for _ in 0..<6 where !calls.waitForExistence(timeout: 2) { app.swipeUp() }
        return calls.exists ? calls.label : nil
    }

    func testReadTheWordsWithTheKeyboardUp() {
        let app = launchWithFieldLow()
        let words = app.descendants(matching: .any)["label-words"]
        words.tap()
        // As soon as the keyboard opens, before anything is typed.
        assertReadButtonAboveKeyboard(app, "keyboard just opened")
        words.typeText("SHEA BODY LOTION 8 FL OZ")
        assertReadButtonAboveKeyboard(app, "after typing")
        app.buttons["Read these words"].tap()
        let line = app.staticTexts["read-line"]
        XCTAssertTrue(line.waitForExistence(timeout: 10))
        XCTAssertEqual(line.label, verdict)
        // The verdict shows under the button, so the keyboard closes rather than cover it.
        waitForNoKeyboard(app)
    }

    func testReturnReadsTheWordsOnceAndClosesTheKeyboard() {
        let app = launchWithFieldLow()
        let words = app.descendants(matching: .any)["label-words"]
        words.tap()
        words.typeText("SHEA BODY LOTION 8 FL OZ")
        XCTAssertTrue(app.keyboards.element.waitForExistence(timeout: 5), "no on-screen keyboard")
        words.typeText("\n")
        let line = app.staticTexts["read-line"]
        XCTAssertTrue(line.waitForExistence(timeout: 10))
        XCTAssertEqual(line.label, verdict)
        waitForNoKeyboard(app)
        // The Return itself is not kept as part of the words.
        XCTAssertEqual(words.value as? String, "SHEA BODY LOTION 8 FL OZ")
        XCTAssertEqual(modelCalls(app), "Model calls: 1")
    }

    func testSwipingThePageDownClosesTheKeyboard() {
        let app = launchWithFieldLow()
        let words = app.descendants(matching: .any)["label-words"]
        words.tap()
        words.typeText("SHEA BODY LOTION 8 FL OZ")
        assertReadButtonAboveKeyboard(app, "after typing")
        // Drag the page itself, from just under the title down past the keyboard's top edge. (The
        // field is a text view, and the keyboard has views of its own, so "the first scroll view"
        // can be either of those.)
        let top = app.navigationBars.firstMatch.frame.maxY + 20
        let start = app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: app.frame.midX, dy: top))
        start.press(forDuration: 0.05, thenDragTo: start.withOffset(CGVector(dx: 0, dy: app.frame.height - top - 40)))
        waitForNoKeyboard(app)
        // Closing the keyboard keeps the words for the button.
        XCTAssertEqual(words.value as? String, "SHEA BODY LOTION 8 FL OZ")
    }
}
