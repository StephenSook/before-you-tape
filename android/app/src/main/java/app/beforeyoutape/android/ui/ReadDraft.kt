package app.beforeyoutape.android.ui

import app.beforeyoutape.engine.EvidenceWire
import app.beforeyoutape.engine.ItemCategoryWire
import app.beforeyoutape.engine.ItemReadWire
import app.beforeyoutape.engine.RetailBoxWire
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive

/**
 * An item read as the person edits it, as the web form keeps it: numbers as typed text (so a
 * half-typed value is not lost), an empty number meaning "not printed" (0).
 */
data class ReadDraft(
    val itemName: String,
    val category: ItemCategoryWire?,
    val labelText: String,
    val numbers: Map<String, String>,
    val flags: Map<String, Boolean>,
    val retailBox: RetailBoxWire,
)

/** The web form's rules (src/ui/ReadFields.tsx, AddByHand.tsx, FixReading.tsx). */
object ReadDrafts {
    private fun shown(n: Double): String = if (n == 0.0) "" else if (n % 1.0 == 0.0 && kotlin.math.abs(n) < 1e15) n.toLong().toString() else n.toString()

    private fun number(r: ItemReadWire, f: String): Double = when (f) {
        "volts" -> r.volts
        "milliampHours" -> r.milliampHours
        "wattHours" -> r.wattHours
        "lithiumGrams" -> r.lithiumGrams
        else -> error("not a number field: $f")
    }

    private fun flag(r: ItemReadWire, f: String): Boolean = when (f) {
        "batteryWords" -> r.batteryWords
        "liquid" -> r.liquid
        "pressurized" -> r.pressurized
        "alcoholOnLabel" -> r.alcoholOnLabel
        "flammableOnLabel" -> r.flammableOnLabel
        "glassContainer" -> r.glassContainer
        "powder" -> r.powder
        else -> error("not a flag field: $f")
    }

    fun of(read: ItemReadWire?): ReadDraft = ReadDraft(
        itemName = read?.itemName ?: "",
        category = read?.category,
        labelText = read?.labelText ?: "",
        numbers = ReadCopy.NUMBERS.associate { (f, _) -> f to (read?.let { shown(number(it, f)) } ?: "") },
        flags = ReadCopy.FLAGS.associate { (f, _) -> f to (read?.let { flag(it, f) } ?: false) },
        retailBox = read?.retailBox ?: RetailBoxWire.cannot_tell,
    )

    /** The typed number, 0 for an empty field, or null when it is not a finite number of zero or more. */
    fun parseNumber(text: String): Double? {
        val t = text.trim()
        if (t.isEmpty()) return 0.0
        val n = t.toDoubleOrNull() ?: return null
        return if (n.isFinite() && n >= 0) n else null
    }

    fun numbersValid(d: ReadDraft): Boolean = ReadCopy.NUMBERS.all { (f, _) -> parseNumber(d.numbers[f].orEmpty()) != null }

    /** A typed item, or null until it has a category and every number is valid. */
    fun read(d: ReadDraft): ItemReadWire? {
        val category = d.category ?: return null
        if (!numbersValid(d)) return null
        fun n(f: String) = parseNumber(d.numbers[f].orEmpty()) ?: 0.0
        fun b(f: String) = d.flags[f] ?: false
        val label = d.labelText.trim()
        return ItemReadWire(
            itemName = d.itemName.trim().ifEmpty { ReadCopy.CATEGORIES.getValue(category) },
            category = category, labelText = label,
            volts = n("volts"), milliampHours = n("milliampHours"), wattHours = n("wattHours"), lithiumGrams = n("lithiumGrams"),
            batteryWords = b("batteryWords"), liquid = b("liquid"), pressurized = b("pressurized"), alcoholOnLabel = b("alcoholOnLabel"),
            flammableOnLabel = b("flammableOnLabel"), glassContainer = b("glassContainer"), powder = b("powder"),
            retailBox = d.retailBox,
            // Typed label words count as a read label; otherwise the person only says what it is.
            evidence = if (label.isNotEmpty()) EvidenceWire.label_read else EvidenceWire.item_seen,
        )
    }

    /** Only the fields the person changed, as overrides on top of the read. */
    fun changed(read: ItemReadWire, d: ReadDraft): Map<String, JsonElement> = buildMap {
        if (d.itemName != read.itemName) put("itemName", JsonPrimitive(d.itemName))
        if (d.category != null && d.category != read.category) put("category", JsonPrimitive(d.category.name))
        if (d.labelText != read.labelText) put("labelText", JsonPrimitive(d.labelText))
        for ((f, _) in ReadCopy.NUMBERS) {
            val n = parseNumber(d.numbers[f].orEmpty())
            if (n != null && n != number(read, f)) put(f, JsonPrimitive(n))
        }
        for ((f, _) in ReadCopy.FLAGS) if ((d.flags[f] ?: false) != flag(read, f)) put(f, JsonPrimitive(d.flags[f] ?: false))
        if (d.retailBox != read.retailBox) put("retailBox", JsonPrimitive(d.retailBox.name))
    }
}
