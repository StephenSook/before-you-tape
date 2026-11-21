package app.beforeyoutape.android.box

import app.beforeyoutape.android.ai.Source
import app.beforeyoutape.engine.BoxCounts
import app.beforeyoutape.engine.BoxItemInput
import app.beforeyoutape.engine.BoxResult
import app.beforeyoutape.engine.EvidenceWire
import app.beforeyoutape.engine.ItemCategoryWire
import app.beforeyoutape.engine.ItemReadWire
import app.beforeyoutape.engine.ItemVerdict
import app.beforeyoutape.engine.LithiumBox
import app.beforeyoutape.engine.RetailBoxWire
import app.beforeyoutape.engine.VerdictLevel
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * A saved item whose tags another edition's label words made is never judged OK on them: a label this phone still
 * holds whole is tagged again, and an item whose label is gone or was cut is held at Check this until it is read again.
 */
class StaleTagsTest {
    private val cut = "A".repeat(StaleTags.LABEL_TEXT_MAX)

    private fun read(label: String) = ItemReadWire("Toy", ItemCategoryWire.lotion_cream, label, 0.0, 0.0, 0.0, 0.0,
        false, true, false, false, false, false, false, RetailBoxWire.cannot_tell, EvidenceWire.label_read)

    private fun item(id: String, label: String, tags: List<String>, tagsEdition: String?, overrides: Map<String, JsonElement> = emptyMap()) =
        BoxItem(BoxItemInput(id, read(label), JsonObject(overrides), emptyMap(), 1.0, null, tags), "phone_cloud", 900.0, null, tagsEdition = tagsEdition)

    /** Judges every item OK (or the level it is told), and records the tags it was given. */
    private class Engine(var lithium: LithiumBox = LithiumBox("none", emptyList(), emptyList(), ""), val levels: Map<String, VerdictLevel> = emptyMap()) : BoxEngine {
        val seen = mutableListOf<Map<String, List<String>>>()
        override fun evaluate(items: List<BoxItemInput>, code: String, today: String): BoxResult {
            seen += items.associate { it.itemId to it.labelTags }
            val v = items.associate { it.itemId to ItemVerdict(levels[it.itemId] ?: VerdictLevel.ok, "engine", emptyList(), null, emptyList(), "first_class") }
            fun n(l: VerdictLevel) = v.values.count { it.level == l }
            return BoxResult(v, lithium, emptyList(), BoxCounts(n(VerdictLevel.ok), n(VerdictLevel.check), n(VerdictLevel.take_out)), "byt-new")
        }
    }

    private fun tags(label: String) = when {
        label.isBlank() -> emptyList()
        "REPLICA" in label -> listOf("label_text", "replica_explosive")
        else -> listOf("label_text")
    }

    private var current: String? = "byt-new"

    private fun controller(engine: Engine) =
        BoxController(BoxLogic.empty("CA"), engine, today = { "2026-11-21" }, edition = { current }, tagger = ::tags)

    private fun saved(vararg items: BoxItem) = BoxLogic.empty("CA").copy(items = items.toList())

    private fun assertHeld(c: BoxController, id: String, reason: String) {
        val v = c.state.result!!.items.getValue(id)
        assertEquals(VerdictLevel.check, v.level)
        assertEquals("Check this", v.headline)
        assertEquals("DATA-LABEL-AGAIN", v.hits.first().ruleId)
        assertEquals(reason, v.hits.first().text)
    }

    @Test fun anItemWhoseCutLabelOtherWordsTaggedIsHeldAtCheckThis() {
        val e = Engine()
        val c = controller(e)
        c.restore(saved(item("t", cut, listOf("label_text"), "byt-old")))
        assertHeld(c, "t", StaleTags.RULES_CHANGED)
        assertEquals(BoxCounts(0, 1, 0), c.state.result!!.counts)
        assertEquals(listOf("label_text"), e.seen.last().getValue("t"))
    }

    @Test fun anItemSavedBeforeTheEditionWasKeptIsHeldWhenItsLabelWasCut() {
        val c = controller(Engine())
        c.restore(saved(item("t", cut, listOf("label_text"), null)))
        assertHeld(c, "t", StaleTags.LABEL_UNKNOWN)
    }

    /** How the revision 3 app saved a toy labelled REPLICA GRENADE: the words then found nothing beyond label_text. */
    @Test fun aStaleItemWhoseWholeLabelIsOnThePhoneIsTaggedAgain() {
        val e = Engine()
        val c = controller(e)
        c.restore(saved(item("t", "REPLICA GRENADE", listOf("label_text"), null)))
        val t = c.state.items.single()
        assertEquals(listOf("label_text", "replica_explosive"), t.input.labelTags)
        assertEquals("byt-new", t.tagsEdition)
        assertEquals(listOf("label_text", "replica_explosive"), e.seen.last().getValue("t"))
        assertEquals("engine", c.state.result!!.items.getValue("t").headline)
    }

    @Test fun anItemWithNoLabelWordsDoesNotDependOnTheEdition() {
        val c = controller(Engine())
        c.restore(saved(item("t", "", emptyList(), null)))
        assertEquals("", c.state.items.single().tagsEdition)
        assertEquals(VerdictLevel.ok, c.state.result!!.items.getValue("t").level)
    }

    @Test fun typingTheLabelReleasesAHeldItem() {
        val c = controller(Engine())
        c.restore(saved(item("t", cut, listOf("label_text"), "byt-old")))
        c.override("t", mapOf("labelText" to JsonPrimitive("REPLICA GRENADE")), tags("REPLICA GRENADE"))
        assertEquals("byt-new", c.state.items.single().tagsEdition)
        assertEquals("engine", c.state.result!!.items.getValue("t").headline)
    }

    @Test fun aBlankTypedLabelKeepsItHeld() {
        val c = controller(Engine())
        c.restore(saved(item("t", cut, listOf("label_text"), "byt-old")))
        c.override("t", mapOf("labelText" to JsonPrimitive("   ")), emptyList())
        assertHeld(c, "t", StaleTags.RULES_CHANGED)
    }

    @Test fun aCheckOrTakeItOutVerdictIsNeverChanged() {
        val e = Engine(levels = mapOf("a" to VerdictLevel.check, "b" to VerdictLevel.take_out))
        val c = controller(e)
        c.restore(saved(item("a", cut, listOf("label_text"), "byt-old"), item("b", cut, listOf("label_text"), "byt-old")))
        val r = c.state.result!!
        assertEquals("engine", r.items.getValue("a").headline)
        assertEquals(VerdictLevel.take_out, r.items.getValue("b").level)
        assertEquals(BoxCounts(0, 1, 1), r.counts)
    }

    @Test fun theLithiumTotalWaitsWhileAnItemNeedsItsLabelReadAgain() {
        val e = Engine(lithium = LithiumBox("ok", listOf("b"), emptyList(), "The lithium in this box is within the limit."))
        val c = controller(e)
        c.restore(saved(item("a", cut, listOf("label_text"), "byt-old"), item("b", "3.7V 1000mAh", listOf("label_text"), "byt-new")))
        val r = c.state.result!!
        assertEquals("depends", r.lithium.status)
        assertEquals(StaleTags.LITHIUM_BOX_WAITS, r.lithium.text)
        assertHeld(c, "b", StaleTags.LITHIUM_WAITS)
        assertEquals(BoxCounts(0, 2, 0), r.counts)
    }

    @Test fun newItemsCarryTheEditionThatTaggedThem() {
        val c = controller(Engine())
        c.addRead(read("SHEA LOTION"), listOf("label_text"), Source.IN_CLOUD, 900, "r")
        c.addManual(read(""), emptyList(), "m")
        assertEquals(listOf("byt-new", ""), c.state.items.map { it.tagsEdition })
    }

    @Test fun withNoRulesLoadedNothingIsHeld() {
        current = null
        val c = controller(Engine())
        c.restore(saved(item("t", cut, listOf("label_text"), "byt-old")))
        assertEquals(VerdictLevel.ok, c.state.result!!.items.getValue("t").level)
        assertEquals("byt-old", c.state.items.single().tagsEdition)
    }

    /** The sentences are the iPhone app's, and a cut label is the web app's LABEL_TEXT_MAX long. */
    @Test fun theWordsAndTheCutMatchTheOtherApps() {
        val root = File(System.getProperty("byt.repoRoot") ?: error("byt.repoRoot is not set by Gradle"))
        val ios = File(root, "ios/BYT/Data/BoxStore.swift").readText()
        for (s in listOf(StaleTags.RULES_CHANGED, StaleTags.LABEL_UNKNOWN, StaleTags.LITHIUM_WAITS, StaleTags.LITHIUM_BOX_WAITS)) {
            assertTrue(s, ios.contains("\"$s\""))
        }
        val max = Regex("LABEL_TEXT_MAX = (\\d+);").find(File(root, "src/shared/itemRead.ts").readText())!!.groupValues[1].toInt()
        assertEquals(max, StaleTags.LABEL_TEXT_MAX)
    }

    /** The held headline is the engine's own words for its check level, not the app's. */
    @Test fun theHeldHeadlineIsTheEnginesOwn() {
        val root = File(System.getProperty("byt.repoRoot") ?: error("byt.repoRoot is not set by Gradle"))
        val headlines = File(root, "src/engine/verdict.ts").readLines().single { it.startsWith("const HEADLINE") }
        assertEquals(Regex("check: \"([^\"]+)\"").find(headlines)!!.groupValues[1], StaleTags.CHECK_HEADLINE)
    }
}
