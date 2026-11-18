package app.beforeyoutape.android.ai

import app.beforeyoutape.engine.EvidenceWire
import app.beforeyoutape.engine.ItemCategoryWire
import app.beforeyoutape.engine.ItemReadWire
import app.beforeyoutape.engine.RetailBoxWire
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Test

class LabelReadWireTest {
    private val sample = LabelRead(
        itemName = "Power bank", category = ItemCategoryWire.power_bank, labelText = "Li-ion 3.7V 5000mAh 18.5Wh",
        volts = 3.7, milliampHours = 5000.0, wattHours = 18.5, lithiumGrams = 1.5, batteryWords = true, liquid = false,
        pressurized = true, alcoholOnLabel = false, flammableOnLabel = true, glassContainer = false, powder = true,
        retailBox = RetailBoxWire.sealed, evidence = EvidenceWire.label_read,
    )

    @OptIn(ExperimentalSerializationApi::class)
    @Test fun everyPropertyMapsToTheWireFieldOfTheSameName() {
        val a = LabelRead.serializer().descriptor
        val b = ItemReadWire.serializer().descriptor
        assertEquals((0 until b.elementsCount).map { b.getElementName(it) }, (0 until a.elementsCount).map { a.getElementName(it) })
        assertEquals(Json.encodeToString(LabelRead.serializer(), sample), Json.encodeToString(ItemReadWire.serializer(), sample.toWire()))
    }

    /** The KSP processor writes enum constant names into the schema, so they must be the wire strings. */
    @Test fun theEnumsAreTheWireEnums() {
        val props = LabelRead.firebaseAISchema().properties!!
        assertEquals(ItemCategoryWire.entries.map { it.name }, props.getValue("category").enum)
        assertEquals(RetailBoxWire.entries.map { it.name }, props.getValue("retailBox").enum)
        assertEquals(EvidenceWire.entries.map { it.name }, props.getValue("evidence").enum)
        assertEquals(listOf("perfume_fragrance", "nail_polish"), props.getValue("category").enum!!.take(2))
    }
}
