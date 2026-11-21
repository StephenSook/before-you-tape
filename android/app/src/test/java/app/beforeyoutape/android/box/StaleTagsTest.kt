package app.beforeyoutape.android.box

import app.beforeyoutape.android.ai.Source
import app.beforeyoutape.android.data.BoxPersistence
import app.beforeyoutape.android.data.Prefs
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
 * A saved item whose tags another edition's label words made is never judged OK on them. Only a new reading with
 * label text, or the sender typing a label, releases it: never a blank label, an edit of another field or a restart.
 */
class StaleTagsTest {
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

    private class MapPrefs : Prefs {
        val values = mutableMapOf<String, String>()
        override fun get(key: String): String? = values[key]
        override fun put(key: String, value: String) { values[key] = value }
    }

    private fun tags(label: String) = when {
        label.isBlank() -> emptyList()
        "REPLICA" in label -> listOf("label_text", "replica_explosive")
        else -> listOf("label_text")
    }

    private var current: String? = "byt-new"

    private fun controller(engine: Engine = Engine()) = BoxController(BoxLogic.empty("CA"), engine, today = { "2026-11-21" }, edition = { current })

    private fun saved(vararg items: BoxItem) = BoxLogic.empty("CA").copy(items = items.toList())

    /** How the revision 3 app saved a toy labelled REPLICA GRENADE: its words then found nothing beyond label_text. */
    private val legacyToy = item("t", "REPLICA GRENADE", listOf("label_text"), null)

    private fun assertHeld(c: BoxController, id: String, reason: String) {
        val v = c.state.result!!.items.getValue(id)
        assertEquals(VerdictLevel.check, v.level)
        assertEquals("Check this", v.headline)
        assertEquals("DATA-LABEL-AGAIN", v.hits.first().ruleId)
        assertEquals(reason, v.hits.first().text)
    }

    private fun assertReleased(c: BoxController, id: String) =
        assertEquals("engine", c.state.result!!.items.getValue(id).headline)

    @Test fun anItemTaggedUnderAnotherEditionIsHeldAtCheckThis() {
        val e = Engine()
        val c = controller(e)
        c.restore(saved(item("t", "REPLICA GRENADE", listOf("label_text"), "byt-old")))
        assertHeld(c, "t", StaleTags.RULES_CHANGED)
        assertEquals(BoxCounts(0, 1, 0), c.state.result!!.counts)
        assertEquals(listOf("label_text"), e.seen.last().getValue("t"))
    }

    @Test fun anItemSavedBeforeTheEditionWasKeptIsHeldWithTheEarlierVersionWords() {
        val c = controller()
        c.restore(saved(legacyToy))
        assertHeld(c, "t", StaleTags.LABEL_UNKNOWN)
    }

    /** The label is still on the phone, but only a new reading or the sender's typing releases the item. */
    @Test fun theLabelStillOnThePhoneDoesNotReleaseIt() {
        val c = controller()
        c.restore(saved(legacyToy))
        c.rulesChanged()
        assertEquals(listOf("label_text"), c.state.items.single().input.labelTags)
        assertEquals(null, c.state.items.single().tagsEdition)
        assertHeld(c, "t", StaleTags.LABEL_UNKNOWN)
    }

    /** Tags not made from a label depend on no edition. */
    @Test fun anItemWithNoLabelTagsIsNotHeld() {
        val c = controller()
        c.restore(saved(item("t", "", listOf("li_ion"), null)))
        assertReleased(c, "t")
    }

    @Test fun typingTheLabelReleasesAHeldItem() {
        val c = controller()
        c.restore(saved(legacyToy))
        c.override("t", mapOf("labelText" to JsonPrimitive("REPLICA GRENADE")), tags("REPLICA GRENADE"))
        assertEquals("byt-new", c.state.items.single().tagsEdition)
        assertEquals(listOf("label_text", "replica_explosive"), c.state.items.single().input.labelTags)
        assertReleased(c, "t")
    }

    @Test fun aBlankTypedLabelKeepsItHeld() {
        val c = controller()
        c.restore(saved(legacyToy, item("k", "SHEA LOTION", listOf("label_text"), "byt-old")))
        c.override("t", mapOf("labelText" to JsonPrimitive("")), emptyList())
        c.override("k", mapOf("labelText" to JsonPrimitive("   ")), emptyList())
        assertHeld(c, "t", StaleTags.LABEL_UNKNOWN)
        assertHeld(c, "k", StaleTags.RULES_CHANGED)
        assertEquals(listOf("label_text"), c.state.items.first().input.labelTags)
    }

    /** The case a restart could release: a legacy item with its label cleared, saved, and the app started again. */
    @Test fun aBlankTypedLabelStaysHeldAfterARestart() {
        val prefs = MapPrefs()
        val first = controller()
        first.restore(saved(legacyToy))
        first.override("t", mapOf("labelText" to JsonPrimitive("")), emptyList())
        BoxPersistence(prefs).save(first.state)
        val again = controller()
        again.restore(BoxPersistence(prefs).load()!!)
        assertHeld(again, "t", StaleTags.LABEL_UNKNOWN)
        again.override("t", mapOf("labelText" to JsonPrimitive("REPLICA GRENADE")), tags("REPLICA GRENADE"))
        BoxPersistence(prefs).save(again.state)
        val third = controller()
        third.restore(BoxPersistence(prefs).load()!!)
        assertReleased(third, "t")
    }

    @Test fun anEditOfAnotherFieldKeepsItHeld() {
        val c = controller()
        c.restore(saved(legacyToy))
        c.override("t", mapOf("wattHours" to JsonPrimitive(0.0)), null)
        c.answer("t", "is_replica", "yes")
        c.stepQuantity("t", 1)
        assertHeld(c, "t", StaleTags.LABEL_UNKNOWN)
    }

    @Test fun aCheckOrTakeItOutVerdictIsNeverChanged() {
        val c = controller(Engine(levels = mapOf("a" to VerdictLevel.check, "b" to VerdictLevel.take_out)))
        c.restore(saved(item("a", "X", listOf("label_text"), "byt-old"), item("b", "Y", listOf("label_text"), "byt-old")))
        val r = c.state.result!!
        assertEquals("engine", r.items.getValue("a").headline)
        assertEquals(VerdictLevel.take_out, r.items.getValue("b").level)
        assertEquals(BoxCounts(0, 1, 1), r.counts)
    }

    @Test fun theLithiumTotalWaitsWhileAnItemNeedsItsLabelReadAgain() {
        val c = controller(Engine(lithium = LithiumBox("ok", listOf("b"), emptyList(), "The lithium in this box is within the limit.")))
        c.restore(saved(legacyToy, item("b", "3.7V 1000mAh", listOf("label_text"), "byt-new")))
        val r = c.state.result!!
        assertEquals("depends", r.lithium.status)
        assertEquals(StaleTags.LITHIUM_BOX_WAITS, r.lithium.text)
        assertHeld(c, "b", StaleTags.LITHIUM_WAITS)
        assertEquals(BoxCounts(0, 2, 0), r.counts)
    }

    @Test fun newItemsCarryTheEditionThatTaggedThem() {
        val c = controller()
        c.addRead(read("SHEA LOTION"), listOf("label_text"), Source.IN_CLOUD, 900, "r")
        c.addManual(read(""), emptyList(), "m")
        assertEquals(listOf("byt-new", ""), c.state.items.map { it.tagsEdition })
    }

    @Test fun withNoRulesLoadedNothingIsHeld() {
        current = null
        val c = controller()
        c.restore(saved(item("t", "X", listOf("label_text"), "byt-old")))
        assertEquals(VerdictLevel.ok, c.state.result!!.items.getValue("t").level)
    }

    /** The sentences are the iPhone app's and the web app's. */
    @Test fun theWordsMatchTheOtherApps() {
        val root = File(System.getProperty("byt.repoRoot") ?: error("byt.repoRoot is not set by Gradle"))
        val ios = File(root, "ios/BYT/Data/BoxStore.swift").readText()
        val web = File(root, "src/data/tagsVersion.ts").readText()
        for (s in listOf(StaleTags.RULES_CHANGED, StaleTags.LABEL_UNKNOWN, StaleTags.LITHIUM_WAITS, StaleTags.LITHIUM_BOX_WAITS)) {
            assertTrue(s, ios.contains("\"$s\""))
            assertTrue(s, web.contains("\"$s\""))
        }
    }

    /** The held headline is the engine's own words for its check level, not the app's. */
    @Test fun theHeldHeadlineIsTheEnginesOwn() {
        val root = File(System.getProperty("byt.repoRoot") ?: error("byt.repoRoot is not set by Gradle"))
        val headlines = File(root, "src/engine/verdict.ts").readLines().single { it.startsWith("const HEADLINE") }
        assertEquals(Regex("check: \"([^\"]+)\"").find(headlines)!!.groupValues[1], StaleTags.CHECK_HEADLINE)
    }
}
