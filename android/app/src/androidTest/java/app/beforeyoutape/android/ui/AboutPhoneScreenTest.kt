package app.beforeyoutape.android.ui

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.beforeyoutape.android.ai.DeviceModelStatus
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AboutPhoneScreenTest {
    @get:Rule val rule = createComposeRule()

    private val info = AboutInfo(
        deviceModel = DeviceModelStatus.AVAILABLE, cloudModel = "gemini-3.5-flash-lite", appCheckProvider = "debug",
        editionId = "byt-e1710fc2f032", bundleCommit = "0123456789abcdef", bundleSha256 = "ab".repeat(32), version = "0.1.0",
    )

    @Test fun everyRowIsShown() {
        var back = false
        rule.setContent { AboutPhoneScreen(info, onBack = { back = true }) }
        for (row in About.rows(info)) rule.onNodeWithText(row).performScrollTo().assertIsDisplayed()
        rule.onNodeWithText(Copy.RULES_ON_WEB).performScrollTo().assertIsDisplayed()
        rule.onNodeWithText(Copy.BACK).performScrollTo().performClick()
        assertTrue(back)
    }

    /** Cloud reads can be turned off here, and asked about again once off. */
    @Test fun cloudReadsCanBeTurnedOffAndAskedAgain() {
        val calls = mutableListOf<String>()
        rule.setContent { AboutPhoneScreen(info.copy(cloudConsent = true), onBack = {}, onTurnOffCloud = { calls += "off" }, onAskAgain = { calls += "again" }) }
        rule.onNodeWithText(Copy.TURN_OFF_CLOUD).performScrollTo().performClick()
        assertTrue(calls == listOf("off"))
    }

    @Test fun withCloudReadsOffTheQuestionCanBeAskedAgain() {
        val calls = mutableListOf<String>()
        rule.setContent { AboutPhoneScreen(info.copy(cloudConsent = false), onBack = {}, onTurnOffCloud = { calls += "off" }, onAskAgain = { calls += "again" }) }
        rule.onNodeWithText(Copy.TURN_OFF_CLOUD).assertDoesNotExist()
        rule.onNodeWithText(Copy.ASK_AGAIN).performScrollTo().performClick()
        assertTrue(calls == listOf("again"))
    }

    /** The About button on the home screen opens it, and Back leaves it. */
    @Test fun theHomeScreenOpensAbout() {
        var shown: HomeView? = null
        val ui = HomeUi(
            loading = false, destinations = emptyList(), box = app.beforeyoutape.android.box.BoxLogic.empty(""), consent = true,
            deviceModel = DeviceModelStatus.UNAVAILABLE, busy = false, message = null, view = HomeView.ABOUT, fixRead = null, about = info,
        )
        val actions = object : HomeActions {
            override fun destination(code: String) = Unit
            override fun consent(allowed: Boolean) = Unit
            override fun crop(crop: app.beforeyoutape.android.capture.BitmapCrop) = Unit
            override fun photoFailed() = Unit
            override fun show(view: HomeView) { shown = view }
            override fun typed(draft: ReadDraft) = Unit
            override fun fix(itemId: String) = Unit
            override fun fixed(itemId: String, draft: ReadDraft) = Unit
            override fun answer(itemId: String, questionId: String, answerId: String) = Unit
            override fun remove(itemId: String) = Unit
            override fun quantity(itemId: String, step: Int) = Unit
            override fun getModel() = Unit
        }
        rule.setContent { HomeScreen(ui, actions, camera = {}) }
        rule.onNodeWithText("Rules edition: byt-e1710fc2f032").assertIsDisplayed()
        rule.onNodeWithText(Copy.BACK).performScrollTo().performClick()
        assertTrue(shown == HomeView.CAMERA)
    }
}
