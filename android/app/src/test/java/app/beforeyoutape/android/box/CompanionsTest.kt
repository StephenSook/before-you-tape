package app.beforeyoutape.android.box

import app.beforeyoutape.engine.BoxItemInput
import app.beforeyoutape.engine.EvidenceWire
import app.beforeyoutape.engine.ItemCategoryWire
import app.beforeyoutape.engine.ItemReadWire
import app.beforeyoutape.engine.RetailBoxWire
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The numbers that come with a typed deciding number, as the sender's own (rule edition 7): a typed Wh above 0 brings
 * the volts and capacity shown, typed lithium grams above 0 bring the volts shown. Never Wh with grams.
 */
class CompanionsTest {
    private fun item(volts: Double, mah: Double, wh: Double, grams: Double, overrides: Map<String, JsonPrimitive> = emptyMap()) = BoxItemInput(
        "i", ItemReadWire("Power bank", ItemCategoryWire.power_bank, "", volts, mah, wh, grams,
            true, false, false, false, false, false, false, RetailBoxWire.cannot_tell, EvidenceWire.label_read),
        JsonObject(overrides), emptyMap(), 1.0, null, emptyList(),
    )
    private fun n(v: Double) = JsonPrimitive(v)

    @Test fun aTypedWhBringsTheShownVoltsAndCapacity() {
        assertEquals(mapOf("wattHours" to n(18.5), "volts" to n(3.7), "milliampHours" to n(5000.0)),
            BoxLogic.withCompanions(item(3.7, 5000.0, 1.85, 0.0), mapOf("wattHours" to n(18.5))))
    }

    @Test fun typedGramsBringOnlyTheShownVolts() {
        assertEquals(mapOf("lithiumGrams" to n(0.3), "volts" to n(3.0)),
            BoxLogic.withCompanions(item(3.0, 220.0, 0.0, 0.1), mapOf("lithiumGrams" to n(0.3))))
    }

    @Test fun whAndGramsNeverBringEachOther() {
        val both = item(3.7, 5000.0, 18.5, 0.3)
        assertEquals(mapOf("wattHours" to n(19.0), "volts" to n(3.7), "milliampHours" to n(5000.0)),
            BoxLogic.withCompanions(both, mapOf("wattHours" to n(19.0))))
        assertEquals(mapOf("lithiumGrams" to n(0.4), "volts" to n(3.7)), BoxLogic.withCompanions(both, mapOf("lithiumGrams" to n(0.4))))
    }

    @Test fun aPatchThatClearsABatteryNumberBringsNothing() {
        val patch = mapOf("wattHours" to n(18.5), "milliampHours" to n(0.0))
        assertEquals(patch, BoxLogic.withCompanions(item(3.7, 5000.0, 1.85, 0.0), patch))
    }

    /** What is shown counts: an earlier correction, not the read; a number shown as 0 does not come, a typed one wins. */
    @Test fun theShownNumbersComeAndTheTypedOnesWin() {
        val fixed = item(0.0, 4000.0, 0.0, 0.0, overrides = mapOf("milliampHours" to n(5000.0)))
        assertEquals(mapOf("wattHours" to n(18.5), "milliampHours" to n(5000.0)), BoxLogic.withCompanions(fixed, mapOf("wattHours" to n(18.5))))
        assertEquals(mapOf("wattHours" to n(18.5), "volts" to n(3.8), "milliampHours" to n(5000.0)),
            BoxLogic.withCompanions(fixed, mapOf("wattHours" to n(18.5), "volts" to n(3.8))))
    }

    @Test fun aPatchWithNoDecidingNumberIsUnchanged() {
        val patch = mapOf("itemName" to JsonPrimitive("Bank"), "volts" to n(3.8))
        assertEquals(patch, BoxLogic.withCompanions(item(3.7, 5000.0, 18.5, 0.0), patch))
    }
}
