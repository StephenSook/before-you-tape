package app.beforeyoutape.android.ai

import app.beforeyoutape.engine.EvidenceWire
import app.beforeyoutape.engine.ItemCategoryWire
import app.beforeyoutape.engine.ItemReadWire
import app.beforeyoutape.engine.RetailBoxWire
import com.google.firebase.ai.type.JsonSchema
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class LabelReadWireTest {
    private val sample = LabelRead(
        itemName = "Power bank", category = "power_bank", labelText = "Li-ion 3.7V 5000mAh 18.5Wh",
        volts = 3.7, milliampHours = 5000.0, wattHours = 18.5, lithiumGrams = 1.5, batteryWords = true, liquid = false,
        pressurized = true, alcoholOnLabel = false, flammableOnLabel = true, glassContainer = false, powder = true,
        retailBox = "sealed", evidence = "label_read",
    )

    @OptIn(ExperimentalSerializationApi::class)
    @Test fun everyPropertyMapsToTheWireFieldOfTheSameName() {
        val a = LabelRead.serializer().descriptor
        val b = ItemReadWire.serializer().descriptor
        assertEquals((0 until b.elementsCount).map { b.getElementName(it) }, (0 until a.elementsCount).map { a.getElementName(it) })
        val wire = sample.toWire()!!
        assertEquals(Json.encodeToString(LabelRead.serializer(), sample), Json.encodeToString(ItemReadWire.serializer(), wire))
        assertEquals(ItemCategoryWire.power_bank, wire.category)
        assertEquals(RetailBoxWire.sealed, wire.retailBox)
        assertEquals(EvidenceWire.label_read, wire.evidence)
    }

    /** A word outside a closed list is no read (the reader shows it as unreadable), never a crash. */
    @Test fun aWordOutsideAClosedListIsNoRead() {
        assertNull(sample.copy(category = "spaceship").toWire())
        assertNull(sample.copy(retailBox = "Sealed").toWire())
        assertNull(sample.copy(evidence = "").toWire())
    }

    /** The KSP processor writes enum constant names into the schema, so they must be the wire strings. */
    @Test fun theEnumsAreTheWireEnums() {
        val props = LabelRead.firebaseAISchema().properties!!
        assertEquals(ItemCategoryWire.entries.map { it.name }, props.getValue("category").enum)
        assertEquals(RetailBoxWire.entries.map { it.name }, props.getValue("retailBox").enum)
        assertEquals(EvidenceWire.entries.map { it.name }, props.getValue("evidence").enum)
        assertEquals(listOf("perfume_fragrance", "nail_polish"), props.getValue("category").enum!!.take(2))
    }

    /**
     * ML Kit's on-device structured output takes only these field types (or another class it has
     * registered as @Generable). Any other type, such as an enum, makes every on-device read fail with
     * an IllegalArgumentException before the phone's model runs, while the cloud accepts the same schema.
     */
    @Test fun theOnDeviceSchemaUsesOnlyTypesMlKitAccepts() {
        val basic = setOf(String::class, Int::class, Long::class, Boolean::class, Float::class, Double::class)
        val fields = LabelRead_MlKitCompanionProvider().getGenerableDetail().guideDetails
        assertEquals(16, fields.size)
        assertEquals(emptyList<String>(), fields.filter { it.type !in basic }.map { it.name })
    }

    /**
     * The schema the cloud gets, field by field, so a change made for the phone cannot change it.
     * label-read-cloud-schema.txt is this rendering of the schema every cloud read had at 1d5e13c.
     */
    @Test fun theCloudSchemaIsUnchanged() {
        val golden = javaClass.getResource("/label-read-cloud-schema.txt")!!.readText()
        assertEquals(golden, render(LabelRead.firebaseAISchema()))
    }

    private fun render(s: JsonSchema<*>, indent: String = ""): String = buildString {
        append("${indent}type=${s.type} format=${s.format} nullable=${s.nullable} title=${s.title} enum=${s.enum}")
        append(" required=${s.required} items=${s.items != null} anyOf=${s.anyOf?.size} description=${s.description}\n")
        s.properties?.forEach { (name, p) -> append("$indent  $name:\n").append(render(p, "$indent    ")) }
    }
}
