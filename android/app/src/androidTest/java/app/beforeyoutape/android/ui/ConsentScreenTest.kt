package app.beforeyoutape.android.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.beforeyoutape.android.ai.BlockReason
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ConsentScreenTest {
    @get:Rule val rule = createComposeRule()

    @Test fun bothChoicesAreShown() {
        var chosen: Boolean? = null
        rule.setContent { ConsentScreen(consent = null, deviceModelReady = true, onChoice = { chosen = it }, onTypeIt = {}) }
        rule.onNodeWithText(Copy.CONSENT).assertExists()
        rule.onNodeWithText(Copy.KEEP_ON_PHONE).assertExists()
        rule.onNodeWithText(Copy.ALLOW).performClick()
        assertEquals(true, chosen)
    }

    @Test fun withNoModelAndConsentDeclinedTypingIsOffered() {
        var consent by mutableStateOf<Boolean?>(null)
        var typed = false
        rule.setContent { ConsentScreen(consent = consent, deviceModelReady = false, onChoice = { consent = it }, onTypeIt = { typed = true }) }
        rule.onNodeWithText(Copy.KEEP_ON_PHONE).performClick()
        rule.waitForIdle()
        assertEquals(false, consent)
        rule.onNodeWithText(Copy.blocked(BlockReason.NO_MODEL_NO_CONSENT)).assertExists()
        rule.onNodeWithText(Copy.TYPE_IT).performClick()
        assertEquals(true, typed)
        rule.onNodeWithText(Copy.ALLOW).assertDoesNotExist()
    }

    @Test fun withAModelOnThePhoneDecliningKeepsReadsOnThePhone() {
        var consent by mutableStateOf<Boolean?>(null)
        rule.setContent { ConsentScreen(consent = consent, deviceModelReady = true, onChoice = { consent = it }, onTypeIt = {}) }
        rule.onNodeWithText(Copy.KEEP_ON_PHONE).performClick()
        rule.waitForIdle()
        assertFalse(consent!!)
        rule.onNodeWithText(Copy.KEPT_ON_PHONE).assertExists()
    }
}
