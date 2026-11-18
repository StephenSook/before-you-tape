package app.beforeyoutape.android.ui

import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.isToggleable
import androidx.compose.ui.test.isSelectable
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.beforeyoutape.engine.ItemCategoryWire
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ReadFormTest {
    @get:Rule val rule = createComposeRule()

    private fun field(label: String) = rule.onNode(hasSetTextAction() and hasText(label, substring = true), useUnmergedTree = false)

    @Test fun everyFieldKindHasAControl() {
        rule.setContent { ReadForm(start = null, nameLabel = ReadCopy.NAME_OPTIONAL, saveLabel = ReadCopy.ADD, onSave = {}) }
        field(ReadCopy.NAME_OPTIONAL).performScrollTo().assertExists()
        field(ReadCopy.LABEL_TEXT).performScrollTo().assertExists()
        rule.onNodeWithText(ReadCopy.CHOOSE_ONE).performScrollTo().assertExists()
        for ((_, label) in ReadCopy.NUMBERS) field(label).performScrollTo().assertExists()
        for ((_, label) in ReadCopy.FLAGS) rule.onNode(isToggleable() and hasText(label)).performScrollTo().assertExists()
        for ((_, label) in ReadCopy.BOX_VALUES) rule.onNode(isSelectable() and hasText(label)).performScrollTo().assertExists()
    }

    @Test fun aNegativeNumberCannotBeSaved() {
        rule.setContent {
            ReadForm(start = null, nameLabel = ReadCopy.NAME_OPTIONAL, saveLabel = ReadCopy.ADD, onSave = {}, startCategory = ItemCategoryWire.power_bank)
        }
        rule.onNodeWithText(ReadCopy.ADD).performScrollTo().assertIsEnabled()
        field(ReadCopy.NUMBERS.first().second).performScrollTo().performTextInput("-3")
        rule.onNodeWithText(ReadCopy.ADD).performScrollTo().assertIsNotEnabled()
    }

    @Test fun aChosenCategoryAndTypedNumberAreSaved() {
        var saved: ReadDraft? = null
        rule.setContent { ReadForm(start = null, nameLabel = ReadCopy.NAME_OPTIONAL, saveLabel = ReadCopy.ADD, onSave = { saved = it }) }
        rule.onNodeWithText(ReadCopy.ADD).performScrollTo().assertIsNotEnabled()
        rule.onNodeWithText(ReadCopy.CHOOSE_ONE).performScrollTo().performClick()
        rule.onNodeWithText(ReadCopy.CATEGORIES.getValue(ItemCategoryWire.power_bank)).performScrollTo().performClick()
        rule.waitForIdle()
        rule.onNodeWithText(ReadCopy.CHOOSE_ONE).assertDoesNotExist()
        field("Watt-hours").performScrollTo().performTextInput("18.5")
        rule.onNodeWithText(ReadCopy.ADD).performScrollTo().assertIsEnabled().performClick()
        assertEquals(ItemCategoryWire.power_bank, saved!!.category)
        assertEquals("18.5", saved!!.numbers.getValue("wattHours"))
    }
}
