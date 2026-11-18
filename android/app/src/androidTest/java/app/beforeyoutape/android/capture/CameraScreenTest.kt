package app.beforeyoutape.android.capture

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.beforeyoutape.android.ui.Copy
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class CameraScreenTest {
    @get:Rule val rule = createComposeRule()

    @Test fun withCameraDeniedThePickerAndTypingAreOffered() {
        var picked = 0
        var typed = 0
        rule.setContent {
            CameraContent(CameraAccess.DENIED, busy = false, preview = {}, onCheckNow = {}, onPickPhoto = { picked++ }, onTypeIt = { typed++ })
        }
        rule.onNodeWithText(Copy.CAMERA_OFF).assertExists()
        rule.onNodeWithText(Copy.CHECK_NOW).assertDoesNotExist()
        rule.onNodeWithText(Copy.ADD_PHOTO).performClick()
        rule.onNodeWithText(Copy.TYPE_IT).performClick()
        assertEquals(1, picked)
        assertEquals(1, typed)
    }

    @Test fun theZoneAndCheckNowAreShown() {
        var checks = 0
        rule.setContent {
            CameraContent(CameraAccess.GRANTED, busy = false, preview = {}, onCheckNow = { checks++ }, onPickPhoto = {}, onTypeIt = {})
        }
        rule.onNodeWithTag("hold-zone").assertExists()
        rule.onNodeWithText(Copy.ADD_PHOTO).assertExists()
        rule.onNodeWithText(Copy.CHECK_NOW).performClick()
        assertEquals(1, checks)
    }

    @Test fun whileAReadRunsCheckNowWaits() {
        var checks = 0
        rule.setContent {
            CameraContent(CameraAccess.GRANTED, busy = true, preview = {}, onCheckNow = { checks++ }, onPickPhoto = {}, onTypeIt = {})
        }
        rule.onNodeWithText(Copy.CHECK_NOW).performClick()
        assertEquals(0, checks)
    }
}
