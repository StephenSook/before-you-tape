package app.beforeyoutape.android.box

import app.beforeyoutape.engine.BoxItemInput
import app.beforeyoutape.engine.EvidenceWire
import app.beforeyoutape.engine.ItemCategoryWire
import app.beforeyoutape.engine.ItemReadWire
import app.beforeyoutape.engine.RetailBoxWire
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * The label check on a held battery (rule edition 7): the sender types the Wh (or lithium grams) printed on the label
 * into an empty field. A match with the model's own reading, within the edition's tolerance, saves the typed number
 * with the numbers it brings; otherwise the typed number is saved alone. The typed number is always the one kept.
 */
class LabelNumberTest {
    private fun item(volts: Double, mah: Double, wh: Double, grams: Double, overrides: Map<String, JsonPrimitive> = emptyMap()) = BoxItemInput(
        "i", ItemReadWire("Laptop", ItemCategoryWire.laptop, "", volts, mah, wh, grams,
            true, false, false, false, false, false, false, RetailBoxWire.cannot_tell, EvidenceWire.label_read),
        JsonObject(overrides), emptyMap(), 1.0, null, emptyList(),
    )
    private fun n(v: Double) = JsonPrimitive(v)

    /** 101 Wh typed against a read of 99 Wh is within 3%: it matches, and the typed 101 is kept, not the read 99. */
    @Test fun aMatchSavesTheTypedNumberWithTheNumbersItBrings() {
        assertEquals(mapOf("wattHours" to n(101.0), "volts" to n(11.4), "milliampHours" to n(8684.0)),
            BoxLogic.labelNumberPatch(item(11.4, 8684.0, 99.0, 0.0), "wattHours", 101.0, 3.0))
    }

    @Test fun aNumberThatDoesNotMatchIsSavedAlone() {
        assertEquals(mapOf("wattHours" to n(154.0)), BoxLogic.labelNumberPatch(item(3.85, 4000.0, 15.4, 0.0), "wattHours", 154.0, 3.0))
    }

    /** Matching a number the sender typed earlier confirms nothing more: only the model's own reading counts. */
    @Test fun onlyTheModelsOwnReadingCanMatch() {
        val typedBefore = item(3.85, 4000.0, 15.4, 0.0, overrides = mapOf("wattHours" to n(99.0)))
        assertEquals(mapOf("wattHours" to n(99.0)), BoxLogic.labelNumberPatch(typedBefore, "wattHours", 99.0, 3.0))
    }

    @Test fun matchingLithiumGramsBringOnlyTheVolts() {
        assertEquals(mapOf("lithiumGrams" to n(0.3), "volts" to n(3.0)),
            BoxLogic.labelNumberPatch(item(3.0, 220.0, 0.0, 0.3), "lithiumGrams", 0.3, 3.0))
    }

    @Test fun aNumberNotAboveZeroIsNotSaved() {
        val i = item(3.85, 4000.0, 15.4, 0.0)
        assertNull(BoxLogic.labelNumberPatch(i, "wattHours", 0.0, 3.0))
        assertNull(BoxLogic.labelNumberPatch(i, "wattHours", -1.0, 3.0))
        assertNull(BoxLogic.labelNumberPatch(i, "wattHours", Double.NaN, 3.0))
    }

    /** With no tolerance from the edition, nothing can match, and the typed number is saved alone (the safe side). */
    @Test fun noToleranceMeansNoMatch() {
        assertEquals(mapOf("wattHours" to n(15.4)), BoxLogic.labelNumberPatch(item(3.85, 4000.0, 15.4, 0.0), "wattHours", 15.4, null))
    }

    @Test fun theCheckAsksForWhWhenWhIsShownOtherwiseLithiumGrams() {
        assertEquals("wattHours", BoxLogic.labelNumberField(item(3.85, 4000.0, 15.4, 0.0).read))
        assertEquals("lithiumGrams", BoxLogic.labelNumberField(item(3.0, 220.0, 0.0, 0.3).read))
    }

    @Test fun theToleranceComesFromTheEdition() {
        assertEquals(3.0, BoxLogic.whTolerancePct("""{"limits":{"whTolerancePct":3}}""")!!, 0.0)
        assertNull(BoxLogic.whTolerancePct("""{"limits":{}}"""))
        assertNull(BoxLogic.whTolerancePct("not json"))
        assertNull(BoxLogic.whTolerancePct(null))
    }

    /** As on the web field: a comma is a decimal point, and only a number above 0 can be checked. */
    @Test fun theTypedTextIsANumberAboveZeroOrNothing() {
        assertEquals(15.4, BoxLogic.labelNumberValue("15,4")!!, 0.0)
        assertEquals(99.0, BoxLogic.labelNumberValue(" 99 ")!!, 0.0)
        assertNull(BoxLogic.labelNumberValue(""))
        assertNull(BoxLogic.labelNumberValue("0"))
        assertNull(BoxLogic.labelNumberValue("-3"))
        assertNull(BoxLogic.labelNumberValue("Wh"))
        assertNull(BoxLogic.labelNumberValue("Infinity"))
    }
}
