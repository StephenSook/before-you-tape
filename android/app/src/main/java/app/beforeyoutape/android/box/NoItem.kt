package app.beforeyoutape.android.box

import app.beforeyoutape.engine.EvidenceWire
import app.beforeyoutape.engine.ItemCategoryWire
import app.beforeyoutape.engine.ItemReadWire

/**
 * A read of no item, as the web app defines it (src/shared/noItem.ts): the model was unsure, saw
 * nothing it could name, read no label and noticed no battery, liquid or warning. A camera pointed at
 * a room gives this; it is dropped, never added as an item.
 */
object NoItem {
    /** The web file's NO_NAME pattern, character for character (a test reads it from the web file). */
    const val NO_NAME_PATTERN = """^(?:an? )?(?:unknown|unidentified|unclear|none|nothing|no item|no object|empty|n\/?a|not sure)(?: (?:item|object|thing))?\.?$"""
    private val NO_NAME = Regex(NO_NAME_PATTERN, RegexOption.IGNORE_CASE)

    fun isNoItem(r: ItemReadWire): Boolean {
        val signal = r.batteryWords || r.liquid || r.pressurized || r.alcoholOnLabel || r.flammableOnLabel || r.glassContainer || r.powder ||
            r.volts > 0 || r.milliampHours > 0 || r.wattHours > 0 || r.lithiumGrams > 0
        val name = r.itemName.trim()
        return r.category == ItemCategoryWire.other && r.evidence == EvidenceWire.not_sure && r.labelText.trim().isEmpty() && !signal &&
            (name.isEmpty() || NO_NAME.matches(name))
    }
}
