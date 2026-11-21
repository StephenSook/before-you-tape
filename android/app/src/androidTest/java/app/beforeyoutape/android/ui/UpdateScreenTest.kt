package app.beforeyoutape.android.ui

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class UpdateScreenTest {
    @get:Rule val rule = createComposeRule()

    @Test fun anOldBuildSaysToUpdateAndOpensTheDownloadPage() {
        var opened = 0
        rule.setContent { UpdateScreen(onOpenDownloads = { opened++ }) }
        rule.onNodeWithText(Copy.UPDATE_NEEDED).assertIsDisplayed()
        rule.onNodeWithText(Copy.UPDATE_HOW).assertIsDisplayed()
        rule.onNodeWithText(Copy.OPEN_DOWNLOADS).performClick()
        assertEquals(1, opened)
    }
}
