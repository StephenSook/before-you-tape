package app.beforeyoutape.android.ai

import app.beforeyoutape.engine.EvidenceWire
import app.beforeyoutape.engine.ItemCategoryWire
import app.beforeyoutape.engine.ItemReadWire
import app.beforeyoutape.engine.RetailBoxWire
import com.google.firebase.ai.annotations.Generable
import com.google.firebase.ai.annotations.Guide
import kotlinx.serialization.Serializable

/**
 * What a model reads off one item and its label: the web app's 16 item-read fields, in the same
 * order. On-device and hybrid modes need a @Generable class for structured output, so this is the
 * schema for every read. No @Guide text and no defaults: every instruction is in the shared prompt,
 * and a default would make a field optional.
 *
 * category, retailBox and evidence are Strings held to the engine's enum names by @Guide enumValues,
 * not the enums themselves. ML Kit's on-device structured output takes only String, Int, Long,
 * Boolean, Float and Double fields (or another class it registered as @Generable), and an enum field
 * made every on-device read fail before the phone's model ran. The cloud gets the same enum schema
 * as before (LabelReadWireTest.theCloudSchemaIsUnchanged), and toWire() turns the words back into
 * the enums.
 */
@Serializable
@Generable(description = "What is printed on one item and its label")
data class LabelRead(
    val itemName: String,
    @Guide(enumValues = [
        "perfume_fragrance", "nail_polish", "aerosol_spray", "hand_sanitizer", "lotion_cream", "liquid_toiletry",
        "makeup", "powder", "medicine", "alcohol_drink", "food_packaged", "chocolate", "coffee", "cooking_oil",
        "meat_product", "phone", "tablet", "laptop", "smartwatch", "earbuds", "power_bank", "loose_battery",
        "battery_toy", "musical_card", "other_electronics", "lighter_matches", "e_cigarette", "glue_paint",
        "knife_tool", "toy_gun", "candle", "jewelry_watch", "clothing", "shoes", "book_paper", "toy", "ceramic", "other",
    ])
    val category: String,
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
    @Guide(enumValues = ["sealed", "open_or_none", "cannot_tell"])
    val retailBox: String,
    @Guide(enumValues = ["label_read", "item_seen", "not_sure"])
    val evidence: String,
) {
    /** The engine's read, or null when a closed-list field holds a word outside its list. */
    fun toWire(): ItemReadWire? {
        val category = ItemCategoryWire.entries.firstOrNull { it.name == category } ?: return null
        val retailBox = RetailBoxWire.entries.firstOrNull { it.name == retailBox } ?: return null
        val evidence = EvidenceWire.entries.firstOrNull { it.name == evidence } ?: return null
        return ItemReadWire(
            itemName, category, labelText, volts, milliampHours, wattHours, lithiumGrams, batteryWords, liquid,
            pressurized, alcoholOnLabel, flammableOnLabel, glassContainer, powder, retailBox, evidence,
        )
    }

    // An empty companion object is required for KSP to generate firebaseAISchema().
    companion object
}
