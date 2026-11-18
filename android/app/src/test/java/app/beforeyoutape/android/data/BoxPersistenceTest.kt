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

    @Test fun nothingSavedMeansNoBox() {
        assertNull(BoxPersistence(MapPrefs()).load())
    }

    @Test fun aDamagedSaveStartsAnEmptyBoxInsteadOfCrashing() {
        val prefs = MapPrefs().apply { values["active_box"] = "{not json" }
        assertNull(BoxPersistence(prefs).load())
    }
}
