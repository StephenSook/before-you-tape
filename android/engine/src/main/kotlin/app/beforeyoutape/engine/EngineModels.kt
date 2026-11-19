package app.beforeyoutape.engine

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

// Kotlin mirrors of the engine's JSON, decoded with unknown keys ignored. Enum constants are
// named exactly as the wire strings: the Firebase AI KSP processor writes constant names into a
// schema and ignores @SerialName, so the names themselves must be the wire values. The enums are
// not marked @Serializable (kotlinx serializes enums by name without it): the annotation adds a
// Companion object, which the processor lists as one more enum value when the enum comes from
// another module.

/** The item categories, in the order of src/shared/itemRead.ts. */
@Suppress("EnumEntryName")
enum class ItemCategoryWire {
    perfume_fragrance, nail_polish, aerosol_spray, hand_sanitizer, lotion_cream,
    liquid_toiletry, makeup, powder, medicine, alcohol_drink,
    food_packaged, chocolate, coffee, cooking_oil, meat_product,
    phone, tablet, laptop, smartwatch, earbuds,
    power_bank, loose_battery, battery_toy, musical_card, other_electronics,
    lighter_matches, e_cigarette, glue_paint, knife_tool, toy_gun,
    candle, jewelry_watch, clothing, shoes, book_paper,
    toy, ceramic, other,
}

@Suppress("EnumEntryName")
enum class RetailBoxWire { sealed, open_or_none, cannot_tell }

@Suppress("EnumEntryName")
enum class EvidenceWire { label_read, item_seen, not_sure }

@Suppress("EnumEntryName")
enum class VerdictLevel { ok, check, take_out }

/** What a model reads off an item: the 16 fields of the TypeScript ItemRead, in its order. */
@Serializable
data class ItemReadWire(
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
)

/** One item in the box, as the engine takes it. Every field is given; there are no defaults here. */
@Serializable
data class BoxItemInput(
    val itemId: String,
    val read: ItemReadWire,
    val overrides: JsonObject,
    val answers: Map<String, String>,
    // A number, as in the engine: the review guards include fractional and zero quantities.
    val quantity: Double,
    val identityConfirmedBy: String?,
    val labelTags: List<String>,
)

@Serializable
data class RuleHit(
    val ruleId: String,
    val layer: String,
    val level: String,
    val text: String,
    val section: String,
    val url: String,
    val askId: String? = null,
)

@Serializable
data class QuestionAnswer(val id: String, val label: String)

@Serializable
data class Question(val id: String, val text: String, val answers: List<QuestionAnswer>)

@Serializable
data class LayerStatus(val id: String, val label: String, val edition: String, val checkedOn: String?, val state: String)

/** One item's verdict. [headline] is the engine's own words; the app never writes verdict text. */
@Serializable
data class ItemVerdict(
    val level: VerdictLevel,
    val headline: String,
    val hits: List<RuleHit>,
    val question: Question?,
    val layers: List<LayerStatus>,
    val service: String,
)

@Serializable
data class LithiumBox(val status: String, val itemIds: List<String>, val unknownItemIds: List<String>, val text: String)

@Serializable
data class BoxCounts(val ok: Int, val check: Int, val takeOut: Int)

@Serializable
data class BoxResult(
    val items: Map<String, ItemVerdict>,
    val lithium: LithiumBox,
    val notes: List<RuleHit>,
    val counts: BoxCounts,
    val editionId: String,
)

@Serializable
data class DestinationName(val code: String, val name: String)

@Serializable
data class EditionInfo(val editionId: String, val destinations: List<DestinationName>)

@Serializable
data class ItemReadField(val name: String, val kind: String, val values: List<String>? = null)

@Serializable
data class ItemReadContract(val fields: List<ItemReadField>, val schema: JsonObject, val labelTextMax: Int)
