package app.beforeyoutape.android.ui

import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.beforeyoutape.android.box.BoxItem
import app.beforeyoutape.android.box.BoxLogic
import app.beforeyoutape.android.capture.BitmapCrop
import app.beforeyoutape.engine.BoxCounts
import app.beforeyoutape.engine.BoxItemInput
import app.beforeyoutape.engine.BoxResult
import app.beforeyoutape.engine.DestinationName
import app.beforeyoutape.engine.EvidenceWire
import app.beforeyoutape.engine.ItemCategoryWire
import app.beforeyoutape.engine.ItemReadWire
import app.beforeyoutape.engine.ItemVerdict
import app.beforeyoutape.engine.LithiumBox
import app.beforeyoutape.engine.RetailBoxWire
import app.beforeyoutape.engine.VerdictLevel
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class HomeScreenTest {
    @get:Rule val rule = createComposeRule()

    private val read = ItemReadWire("Lotion", ItemCategoryWire.lotion_cream, "SHEA LOTION", 0.0, 0.0, 0.0, 0.0,
        false, true, false, false, false, false, false, RetailBoxWire.cannot_tell, EvidenceWire.label_read)
    private val item = BoxItem(BoxItemInput("a", read, JsonObject(emptyMap()), emptyMap(), 1.0, null, emptyList()), "phone_cloud", 900, null)
    private val verdict = ItemVerdict(VerdictLevel.check, "Headline from the engine", emptyList(), null, emptyList(), "service")
    private val result = BoxResult(mapOf("a" to verdict), LithiumBox("none", emptyList(), emptyList(), ""), emptyList(), BoxCounts(0, 1, 0), "byt-x")
    private val places = listOf(DestinationName("CA", "Canada"), DestinationName("PH", "Philippines"))
    private val base = HomeUi(
        loading = false, destinations = places, box = BoxLogic.empty("CA"), consent = true, deviceModelReady = false,
        busy = false, message = null, view = HomeView.CAMERA, fixRead = null,
    )

    private class Recorded : HomeActions {
        val calls = mutableListOf<String>()
        override fun destination(code: String) { calls += "destination:$code" }
        override fun consent(allowed: Boolean) { calls += "consent:$allowed" }
        override fun crop(crop: BitmapCrop) { calls += "crop" }
        override fun photoFailed() { calls += "photoFailed" }
        override fun show(view: HomeView) { calls += "show:$view" }
        override fun typed(draft: ReadDraft) { calls += "typed:${draft.category}" }
        override fun fix(itemId: String) { calls += "fix:$itemId" }
        override fun fixed(itemId: String, draft: ReadDraft) { calls += "fixed:$itemId" }
        override fun answer(itemId: String, questionId: String, answerId: String) { calls += "answer" }
        override fun remove(itemId: String) { calls += "remove:$itemId" }
        override fun quantity(itemId: String, n: Double) { calls += "quantity:$itemId:$n" }
    }

    private fun show(ui: HomeUi, a: Recorded = Recorded()): Recorded {
        rule.setContent { HomeScreen(ui, a, camera = { Text("CAMERA STUB") }) }
        return a
    }

    @Test fun firstTheConsentQuestionIsAsked() {
        val a = show(base.copy(consent = null))
        rule.onNodeWithText(Copy.CONSENT).assertExists()
        rule.onNodeWithText("CAMERA STUB").assertDoesNotExist()
        rule.onNodeWithText(Copy.ALLOW).performClick()
        assertEquals(listOf("consent:true"), a.calls)
    }

    @Test fun withNoDestinationTheCameraWaitsAndADestinationCanBeChosen() {
        val a = show(base.copy(box = BoxLogic.empty("")))
        rule.onNodeWithText(Copy.CHOOSE_DESTINATION_FIRST).assertExists()
        rule.onNodeWithText("CAMERA STUB").assertDoesNotExist()
        rule.onNodeWithText(Copy.WHERE_TO).performClick()
        rule.onNodeWithText("Philippines").performClick()
        assertEquals(listOf("destination:PH"), a.calls)
    }

    @Test fun withADestinationTheCameraShowsAndTheBoxIsOneTapAway() {
        val a = show(base.copy(box = BoxLogic.empty("CA").copy(items = listOf(item))))
        rule.onNodeWithText("CAMERA STUB").assertExists()
        rule.onNodeWithText(Copy.sendingTo("Canada")).assertExists()
        rule.onNodeWithText(Copy.seeTheBox(1)).performClick()
        assertEquals(listOf("show:BOX"), a.calls)
    }

    @Test fun declinedWithNoModelOnThePhoneOffersTyping() {
        val a = show(base.copy(consent = false, deviceModelReady = false))
        rule.onNodeWithText(Copy.blocked(app.beforeyoutape.android.ai.BlockReason.NO_MODEL_NO_CONSENT)).assertExists()
        rule.onNodeWithText(Copy.TYPE_IT).performClick()
        assertEquals(listOf("show:TYPE"), a.calls)
    }

    @Test fun typingSavesATypedItem() {
        val a = show(base.copy(view = HomeView.TYPE))
        rule.onNodeWithText(ReadCopy.CHOOSE_ONE).performScrollTo().performClick()
        rule.onNodeWithText(ReadCopy.CATEGORIES.getValue(ItemCategoryWire.lotion_cream)).performScrollTo().performClick()
        rule.onNodeWithText(ReadCopy.ADD).performScrollTo().performClick()
        assertEquals(listOf("typed:lotion_cream"), a.calls)
    }

    @Test fun theBoxOffersAFixAndARemovalPerItem() {
        val a = show(base.copy(view = HomeView.BOX, box = BoxLogic.empty("CA").copy(items = listOf(item), result = result)))
        rule.onNodeWithText("Headline from the engine").assertExists()
        rule.onNodeWithText(Copy.FIX_READING).performScrollTo().performClick()
        rule.onNodeWithText(Copy.REMOVE).performScrollTo().performClick()
        rule.onNodeWithText(Copy.ADD_ANOTHER).performScrollTo().performClick()
        assertEquals(listOf("fix:a", "remove:a", "show:CAMERA"), a.calls)
    }

    @Test fun theQuantityStepsUpAndCannotGoBelowOne() {
        val a = show(base.copy(view = HomeView.BOX, box = BoxLogic.empty("CA").copy(items = listOf(item), result = result)))
        rule.onNodeWithContentDescription(Copy.ONE_FEWER).performScrollTo().assertIsNotEnabled()
        rule.onNodeWithText(Copy.howMany(1)).assertExists()
        rule.onNodeWithContentDescription(Copy.ONE_MORE).performScrollTo().performClick()
        assertEquals(listOf("quantity:a:2.0"), a.calls)
    }

    @Test fun aFixStartsFromTheCurrentReading() {
        var ui by mutableStateOf(base.copy(view = HomeView.FIX, fixRead = read, fixItemId = "a", box = BoxLogic.empty("CA").copy(items = listOf(item))))
        val a = Recorded()
        rule.setContent { HomeScreen(ui, a, camera = {}) }
        rule.onNodeWithText(ReadCopy.CATEGORIES.getValue(ItemCategoryWire.lotion_cream)).performScrollTo().assertExists()
        rule.onNodeWithText(ReadCopy.SAVE).performScrollTo().performClick()
        assertEquals(listOf("fixed:a"), a.calls)
    }
}
