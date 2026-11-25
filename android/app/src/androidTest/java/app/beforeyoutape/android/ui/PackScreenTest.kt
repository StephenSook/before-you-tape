package app.beforeyoutape.android.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import app.beforeyoutape.android.ai.Source
import app.beforeyoutape.android.box.BoxController
import app.beforeyoutape.android.box.BoxEngine
import app.beforeyoutape.android.box.BoxLogic
import app.beforeyoutape.android.box.BoxState
import app.beforeyoutape.android.engine.EngineAssets
import app.beforeyoutape.engine.EngineHost
import app.beforeyoutape.engine.EvidenceWire
import app.beforeyoutape.engine.ItemCategoryWire
import app.beforeyoutape.engine.ItemReadWire
import app.beforeyoutape.engine.RetailBoxWire
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class PackScreenTest {
    @get:Rule val rule = createComposeRule()

    private lateinit var host: EngineHost
    private var checks = 0
    private lateinit var box: BoxController
    private var state by mutableStateOf(BoxLogic.empty("CA"))
    private var unreadable by mutableStateOf(false)

    // The shared vector three_unknown_phones: three phones whose cell count the engine must ask about.
    private val phone = ItemReadWire("Phone", ItemCategoryWire.phone, "3.85V 4000mAh 15.4Wh", 3.85, 4000.0, 15.4, 0.0,
        true, false, false, false, false, false, false, RetailBoxWire.cannot_tell, EvidenceWire.label_read)

    @Before fun setUp() {
        host = EngineAssets.load(InstrumentationRegistry.getInstrumentation().targetContext)
        val engine = BoxEngine { items, code, today -> checks++; host.evaluateBox(items, code, today) }
        box = BoxController(BoxLogic.empty("CA"), engine, today = { "2026-11-25" })
        for (id in listOf("a", "b", "c")) {
            box.addRead(phone, host.labelTags(phone.labelText), Source.IN_CLOUD, 900, id)
            box.answer(id, "device_condition", "new_sealed")
        }
        state = box.state
        rule.setContent {
            PackScreen(state = state, onAnswer = { i: String, q: String, a: String -> box.answer(i, q, a); state = box.state }, savedBoxUnreadable = unreadable)
        }
    }

    @After fun tearDown() = host.close()

    private fun showing(text: String) = rule.onNodeWithText(text, useUnmergedTree = true).performScrollTo().assertExists()

    /** A text inside item [id]'s card (the three phones share their words). */
    private fun inCard(id: String, text: String) =
        rule.onNode(hasText(text) and hasAnyAncestor(hasTestTag("item-$id")), useUnmergedTree = true).performScrollTo()

    @Test fun anItemShowsItsHeadlineReasonsAndQuestion() {
        val verdict = state.result!!.items.getValue("a")
        val question = checkNotNull(verdict.question) { "the engine asked no question for this box" }
        inCard("a", verdict.headline).assertExists()
        inCard("a", verdict.hits.first().text).assertExists()
        inCard("a", question.text).assertExists()
        for (a in question.answers) inCard("a", a.label).assertExists()
        inCard("a", "Read in the cloud, from this phone, in 0.9 s.").assertExists()
    }

    @Test fun answeringAQuestionRechecks() {
        val question = state.result!!.items.getValue("a").question!!
        val before = checks
        inCard("a", question.answers.first().label).performClick()
        rule.waitForIdle()
        assertEquals(question.answers.first().id, box.state.items.first { it.input.itemId == "a" }.input.answers[question.id])
        assertEquals(before + 1, checks)
    }

    @Test fun theFooterDisclaimsThePostalService() {
        showing(Copy.FOOTER)
    }

    /** An empty box beside a saved box the phone could not open says so, and is never called empty. */
    @Test fun anEmptyBoxBesideAnUnreadableSaveIsNotCalledEmpty() {
        state = BoxLogic.empty("CA")
        unreadable = true
        rule.waitForIdle()
        showing(Copy.SAVED_BOX_UNREADABLE)
        rule.onNodeWithText(Copy.NO_ITEMS, useUnmergedTree = true).assertDoesNotExist()
        unreadable = false
        rule.waitForIdle()
        showing(Copy.NO_ITEMS)
    }

    @Test fun withNoEngineTheRulesNotLoadedLineIsShownAndNoVerdict() {
        state = BoxLogic.withEngineError(box.state, "NoEditionError")
        rule.waitForIdle()
        showing(Copy.RULES_NOT_LOADED)
    }
}
