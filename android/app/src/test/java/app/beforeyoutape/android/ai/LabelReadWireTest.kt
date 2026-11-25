package app.beforeyoutape.android.ai

import app.beforeyoutape.engine.EvidenceWire
import app.beforeyoutape.engine.ItemCategoryWire
import app.beforeyoutape.engine.ItemReadWire
import app.beforeyoutape.engine.RetailBoxWire
import com.google.firebase.ai.type.JsonSchema
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.serializer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
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

    /**
     * The JSON the SDK sends to the cloud for each closed-list field is the JSON the enum fields sent
     * before: each is compared with the exact builder call the KSP processor wrote for the enum.
     */
    @Test fun theClosedListsSendTheCloudTheSameJsonAsTheEnumsDid() {
        val props = LabelRead.firebaseAISchema().properties!!
        val before = mapOf(
            "category" to JsonSchema.enumeration(clazz = ItemCategoryWire::class, values = ItemCategoryWire.entries.map { it.name }, title = "category", nullable = false),
            "retailBox" to JsonSchema.enumeration(clazz = RetailBoxWire::class, values = RetailBoxWire.entries.map { it.name }, title = "retailBox", nullable = false),
            "evidence" to JsonSchema.enumeration(clazz = EvidenceWire::class, values = EvidenceWire.entries.map { it.name }, title = "evidence", nullable = false),
        )
        for ((name, old) in before) assertEquals(name, wire(old), wire(props.getValue(name)))
        assertTrue(wire(props.getValue("evidence")).contains("label_read"))
        // The comparison can fail: a plain string field with the same title sends other JSON.
        assertNotEquals(wire(before.getValue("category")), wire(JsonSchema.string(title = "category", nullable = false)))
    }

    /** The JSON the SDK builds for the cloud request (its internal toInternalJson, read by its JVM name). */
    private fun wire(s: JsonSchema<*>): String {
        val internal = JsonSchema::class.java.getMethod("toInternalJson\$com_google_firebase_ai_logic_firebase_ai").invoke(s)!!
        @Suppress("UNCHECKED_CAST")
        return Json.encodeToString(serializer(internal.javaClass) as KSerializer<Any>, internal)
    }

    private fun render(s: JsonSchema<*>, indent: String = ""): String = buildString {
        append("${indent}type=${s.type} format=${s.format} nullable=${s.nullable} title=${s.title} enum=${s.enum}")
        append(" required=${s.required} minimum=${s.minimum} maximum=${s.maximum} minItems=${s.minItems} maxItems=${s.maxItems}")
        append(" description=${s.description}\n")
        s.properties?.forEach { (name, p) -> append("$indent  $name:\n").append(render(p, "$indent    ")) }
        s.items?.let { append("$indent  items:\n").append(render(it, "$indent    ")) }
        s.anyOf?.forEachIndexed { i, p -> append("$indent  anyOf[$i]:\n").append(render(p, "$indent    ")) }
    }
}
