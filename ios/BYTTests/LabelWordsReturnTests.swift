import Testing
@testable import BYT

/// Return in the label words field reads the words. The field takes several lines (Scan Text can
/// bring a whole label at once), so a Return, typed on its own or over selected words, is told apart
/// from every other change to the words.
@Suite struct LabelWordsReturnTests {
    @Test func aReturnTypedAtTheEndIsAReturn() {
        #expect(LabelWordsField.isTypedReturn(old: "POWER BANK 185Wh", new: "POWER BANK 185Wh\n"))
    }

    @Test func aReturnTypedInTheMiddleIsAReturn() {
        #expect(LabelWordsField.isTypedReturn(old: "POWER BANK 185Wh", new: "POWER\n BANK 185Wh"))
    }

    @Test func aReturnInAnEmptyFieldIsAReturn() {
        #expect(LabelWordsField.isTypedReturn(old: "", new: "\n"))
    }

    @Test func typingALetterIsNotAReturn() {
        #expect(!LabelWordsField.isTypedReturn(old: "POWER BANK", new: "POWER BANKS"))
    }

    @Test func scannedLinesAreNotAReturn() {
        #expect(!LabelWordsField.isTypedReturn(old: "", new: "POWER BANK\nCapacity: 50000mAh\n"))
        #expect(!LabelWordsField.isTypedReturn(old: "POWER", new: "POWER\nBANK"))
    }

    @Test func deletingANewlineIsNotAReturn() {
        #expect(!LabelWordsField.isTypedReturn(old: "POWER\nBANK", new: "POWERBANK"))
    }

    @Test func aReturnOverSelectedWordsIsAReturn() {
        // Return with text selected puts one newline in place of the selection.
        #expect(LabelWordsField.isTypedReturn(old: "POWER BANK", new: "POWER\nBANK"))
        #expect(LabelWordsField.isTypedReturn(old: "POWER BANK 185Wh", new: "\n"))
    }

    @Test func pastedWordsOverASelectionAreNotAReturn() {
        #expect(!LabelWordsField.isTypedReturn(old: "POWER BANK", new: "POWER\nCELL"))
        #expect(!LabelWordsField.isTypedReturn(old: "POWER BANK", new: "POWER CELL\n"))
    }

    @Test func aNewlineNextToTheSameNewlineIsAReturn() {
        #expect(LabelWordsField.isTypedReturn(old: "A\nB", new: "A\n\nB"))
    }

    @Test func noChangeIsNotAReturn() {
        #expect(!LabelWordsField.isTypedReturn(old: "POWER\n", new: "POWER\n"))
    }
}
