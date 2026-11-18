package app.beforeyoutape.android.ai

import app.beforeyoutape.engine.EvidenceWire
import app.beforeyoutape.engine.ItemCategoryWire
import app.beforeyoutape.engine.ItemReadWire
import app.beforeyoutape.engine.RetailBoxWire
import com.google.firebase.ai.annotations.Generable
import kotlinx.serialization.Serializable

/**
 * What a model reads off one item and its label: the web app's 16 item-read fields, in the same
 * order. On-device and hybrid modes need a @Generable class for structured output, so this is the
 * schema for every read. No @Guide text and no defaults: every instruction is in the shared prompt,
 * and a default would make a field optional.
 */
@Serializable
@Generable(description = "What is printed on one item and its label")
data class LabelRead(
    val itemName: String,
    val category: ItemCategoryWire,
    val labelText: String,
    val volts: Double,
    val milliampHours: Double,
    val wattHours: Double,
    val lithiumGrams: Double,
    val batteryWords: Boolean,
    val liquid: Boolean,
    val pressurized: Boolean,
    val alcoholOnLabel: Boolean,
    val flammableOnLabel: Boolean,
    val glassContainer: Boolean,
    val powder: Boolean,
    val retailBox: RetailBoxWire,
    val evidence: EvidenceWire,
) {
    fun toWire(): ItemReadWire = ItemReadWire(
        itemName, category, labelText, volts, milliampHours, wattHours, lithiumGrams, batteryWords, liquid,
        pressurized, alcoholOnLabel, flammableOnLabel, glassContainer, powder, retailBox, evidence,
    )

    // An empty companion object is required for KSP to generate firebaseAISchema().
    companion object
}
