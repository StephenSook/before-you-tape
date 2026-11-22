package app.beforeyoutape.android.data

import app.beforeyoutape.android.ai.Source
import app.beforeyoutape.android.box.BoxLogic
import app.beforeyoutape.engine.EvidenceWire
import app.beforeyoutape.engine.ItemCategoryWire
import app.beforeyoutape.engine.ItemReadWire
import app.beforeyoutape.engine.RetailBoxWire
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class BoxPersistenceTest {
    private class MapPrefs : Prefs {
        val values = mutableMapOf<String, String>()
        override fun get(key: String): String? = values[key]
        override fun put(key: String, value: String) { values[key] = value }
    }

    private val read = ItemReadWire("Phone", ItemCategoryWire.phone, "3.85V 4000mAh 15.4Wh", 3.85, 4000.0, 15.4, 0.0,
        true, false, false, false, false, false, false, RetailBoxWire.sealed, EvidenceWire.label_read)

    @Test fun theWholeBoxComesBackAfterTheProcessIsGone() {
        var s = BoxLogic.addRead(BoxLogic.empty("CA"), read, listOf("li_ion", "battery_label"), Source.ON_DEVICE, 300, "p1")
        s = BoxLogic.answer(s, "p1", "device_condition", "new_sealed")
        s = BoxLogic.override(s, "p1", mapOf("wattHours" to JsonPrimitive(18.5)), labelTags = null)
        s = BoxLogic.setQuantity(s, "p1", 3.0)
        s = BoxLogic.setDestination(s, "PH")
        s = s.copy(items = s.items.map { it.copy(extras = mapOf("cropKey" to null, "secondLook" to mapOf("ms" to 900L, "reason" to "checked again"))) })
        val prefs = MapPrefs()
        BoxPersistence(prefs).save(s)
        val back = BoxPersistence(prefs).load()!!
        // Label text stays on the phone, so it is kept here (never in a synced document).
        assertEquals(s.copy(result = null, engineError = null), back)
    }

    @Test fun aFractionalReadTimeIsKeptOnThePhone() {
        val one = BoxLogic.addRead(BoxLogic.empty("CA"), read, emptyList(), Source.IN_CLOUD, 900, "w1")
        val s = one.copy(items = one.items.map { it.copy(readMs = 1450.75) })
        val prefs = MapPrefs()
        BoxPersistence(prefs).save(s)
        assertEquals(1450.75, BoxPersistence(prefs).load()!!.items.single().readMs, 0.0)
    }

    /** Which edition made each item's tags stays on the phone; a box saved before it was kept loads with none. */
    @Test fun theEditionThatMadeEachItemsTagsIsKept() {
        var s = BoxLogic.addRead(BoxLogic.empty("CA"), read, listOf("li_ion"), Source.ON_DEVICE, 300, "a")
        s = BoxLogic.addRead(s, read, emptyList(), Source.ON_DEVICE, 300, "b")
        s = BoxLogic.addRead(s, read, listOf("li_ion"), Source.ON_DEVICE, 300, "c")
        s = s.copy(items = s.items.zip(listOf("byt-x", "", null)).map { (i, e) -> i.copy(tagsEdition = e) })
        val prefs = MapPrefs()
        BoxPersistence(prefs).save(s)
        assertEquals(listOf("byt-x", "", null), BoxPersistence(prefs).load()!!.items.map { it.tagsEdition })
        // A save from before the edition was kept has no such key.
        prefs.values["active_box"] = prefs.values.getValue("active_box").replace(Regex(",?\"tagsEdition\":(\"[^\"]*\"|null)"), "")
        assertEquals(listOf(null, null, null), BoxPersistence(prefs).load()!!.items.map { it.tagsEdition })
    }

    /** A typed item stays typed on the phone, and a typed item saved before numbersFrom was kept loads as typed. */
    @Test fun aTypedItemStaysTyped() {
        val s = BoxLogic.addManual(BoxLogic.empty("CA"), read.copy(evidence = EvidenceWire.item_seen), emptyList(), "t")
        val prefs = MapPrefs()
        BoxPersistence(prefs).save(s)
        assertEquals("typed", BoxPersistence(prefs).load()!!.items.single().input.numbersFrom)
        prefs.values["active_box"] = prefs.values.getValue("active_box").replace(Regex(",?\"numbersFrom\":\"typed\""), "")
        assertEquals(false, prefs.values.getValue("active_box").contains("numbersFrom"))
        assertEquals("typed", BoxPersistence(prefs).load()!!.items.single().input.numbersFrom)
    }

    /** The label's figures stay with the item on the phone. */
    @Test fun anItemsLabelFiguresAreKeptOnThePhone() {
        val figures = app.beforeyoutape.engine.LabelFigures(wh = listOf(154.0, 15.4), grams = listOf(0.5))
        val s = BoxLogic.addRead(BoxLogic.empty("CA"), read, emptyList(), Source.IN_CLOUD, 900, "f", figures)
        val prefs = MapPrefs()
        BoxPersistence(prefs).save(s)
        assertEquals(figures, BoxPersistence(prefs).load()!!.items.single().input.labelFigures)
    }

    @Test fun nothingSavedMeansNoBox() {
        assertNull(BoxPersistence(MapPrefs()).load())
    }

    @Test fun aDamagedSaveStartsAnEmptyBoxInsteadOfCrashing() {
        val prefs = MapPrefs().apply { values["active_box"] = "{not json" }
        assertNull(BoxPersistence(prefs).load())
    }
}
