package app.beforeyoutape.android.ui

import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import app.beforeyoutape.android.ai.Source
import app.beforeyoutape.android.box.BoxController
import app.beforeyoutape.android.box.BoxEngine
import app.beforeyoutape.android.box.BoxLogic
import app.beforeyoutape.android.engine.EngineAssets
import app.beforeyoutape.engine.EngineHost
import app.beforeyoutape.engine.EvidenceWire
import app.beforeyoutape.engine.ItemCategoryWire
import app.beforeyoutape.engine.ItemReadWire
import app.beforeyoutape.engine.RetailBoxWire
import org.junit.After
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ItemCardTest {
    @get:Rule val rule = createComposeRule()
    private lateinit var host: EngineHost
    private lateinit var box: BoxController

    // A phone whose condition is not answered yet, so the engine asks "Is it new?".
    private val phone = ItemReadWire("Phone", ItemCategoryWire.phone, "3.85V 4000mAh 15.4Wh", 3.85, 4000.0, 15.4, 0.0,
        true, false, false, false, false, false, false, RetailBoxWire.cannot_tell, EvidenceWire.label_read)

    @Before fun setUp() {
        host = EngineAssets.load(InstrumentationRegistry.getInstrumentation().targetContext)
        box = BoxController(BoxLogic.empty("CA"), BoxEngine { items, code, today -> host.evaluateBox(items, code, today) }, today = { "2026-11-20" })
        box.addRead(phone, host.labelTags(phone.labelText), Source.IN_CLOUD, 900, "a")
    }

    @After fun tearDown() = host.close()

    /**
     * The phone with a second look that read the same numbers, as in the web card test. Without one, the hold on battery
     * numbers from a single read (USPS-INTL-LI-ONE-READ) is this phone's first reason, so no first reason restates the
     * question. This app runs no second look, so the item is set here to test the card alone.
     */
    private fun secondLooked() = box.state.items.single().let { it.copy(input = it.input.copy(identityConfirmedBy = "second_look")) }

    /** The card asks its question once: the reason line that restates it is not shown beside it. */
    @Test fun aQuestionIsAskedOnce() {
        val item = secondLooked()
        val verdict = host.evaluateBox(listOf(item.input), "CA", "2026-11-20").items.getValue("a")
        val question = checkNotNull(verdict.question) { "the engine asked nothing for this phone" }
        val restating = verdict.hits.first().text
        assertTrue("premise: the first reason restates the question ($restating)", restating.startsWith(question.text))
        rule.setContent { ItemCard(item, verdict, onAnswer = { _, _, _ -> }) }
        rule.onNodeWithText(question.text).assertExists()
        rule.onNodeWithText(restating).assertDoesNotExist()
    }

    /** As on the web: when the first reason only restates the question, the next reason shows in its place. */
    @Test fun theNextReasonShowsInsteadOfOneThatRestatesTheQuestion() {
        val item = secondLooked()
        val verdict = host.evaluateBox(listOf(item.input), "CA", "2026-11-20").items.getValue("a")
        val question = checkNotNull(verdict.question)
        val next = verdict.hits.drop(1).firstOrNull { !it.text.startsWith(question.text) }
        assertTrue("premise: a reason other than the restating one (${verdict.hits.map { it.text }})", next != null)
        rule.setContent { ItemCard(item, verdict, onAnswer = { _, _, _ -> }) }
        rule.onNodeWithText(next!!.text).assertExists()
    }

    /** One more and one fewer are real 48 dp buttons, with the same spoken names. */
    @Test fun theQuantityButtonsAreFullSize() {
        val item = box.state.items.single()
        val verdict = box.state.result!!.items.getValue("a")
        rule.setContent { ItemCard(item, verdict, onAnswer = { _, _, _ -> }, onQuantity = { _, _ -> }) }
        for (name in listOf(Copy.ONE_FEWER, Copy.ONE_MORE)) {
            val b = rule.onNodeWithContentDescription(name).getBoundsInRoot()
            assertTrue("$name is ${b.right - b.left} wide", b.right - b.left >= 48.dp)
            assertTrue("$name is ${b.bottom - b.top} tall", b.bottom - b.top >= 48.dp)
        }
    }
}
