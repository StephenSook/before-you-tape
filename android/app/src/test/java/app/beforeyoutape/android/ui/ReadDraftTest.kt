package app.beforeyoutape.android.ui

import app.beforeyoutape.engine.EvidenceWire
import app.beforeyoutape.engine.ItemCategoryWire
import app.beforeyoutape.engine.ItemReadWire
import app.beforeyoutape.engine.RetailBoxWire
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ReadDraftTest {
    private val bank = ItemReadWire("Power bank", ItemCategoryWire.power_bank, "Li-ion 3.7V 5000mAh", 3.7, 5000.0, 0.0, 0.0,
        true, false, false, false, false, false, false, RetailBoxWire.cannot_tell, EvidenceWire.label_read)

    @Test fun anEmptyNumberIsZeroAndANegativeOrWordIsNotANumber() {
        assertEquals(0.0, ReadDrafts.parseNumber("  ")!!, 0.0)
        assertEquals(3.7, ReadDrafts.parseNumber("3.7")!!, 0.0)
        assertNull(ReadDrafts.parseNumber("-3"))
        assertNull(ReadDrafts.parseNumber("three"))
        assertNull(ReadDrafts.parseNumber("Infinity"))
    }

    @Test fun aDraftShowsNumbersAsTypedAndZeroAsEmpty() {
        val d = ReadDrafts.of(bank)
        assertEquals("3.7", d.numbers.getValue("volts"))
        assertEquals("5000", d.numbers.getValue("milliampHours"))
        assertEquals("", d.numbers.getValue("wattHours"))
        assertEquals(true, d.flags.getValue("batteryWords"))
        assertEquals(ItemCategoryWire.power_bank, d.category)
    }

    @Test fun aTypedItemNeedsACategoryAndValidNumbers() {
        val empty = ReadDrafts.of(null)
        assertNull(ReadDrafts.read(empty))
        assertNull(ReadDrafts.read(empty.copy(category = ItemCategoryWire.lotion_cream, numbers = empty.numbers + ("volts" to "-1"))))
        assertFalse(ReadDrafts.numbersValid(empty.copy(numbers = empty.numbers + ("volts" to "-1"))))
    }

    @Test fun typedLabelWordsCountAsALabelReadOtherwiseTheItemIsOnlySeen() {
        val d = ReadDrafts.of(null).copy(category = ItemCategoryWire.lotion_cream)
        assertEquals(EvidenceWire.item_seen, ReadDrafts.read(d)!!.evidence)
        assertEquals(EvidenceWire.label_read, ReadDrafts.read(d.copy(labelText = "SHEA LOTION"))!!.evidence)
    }

    @Test fun aTypedItemWithNoNameIsNamedByItsCategory() {
        val r = ReadDrafts.read(ReadDrafts.of(null).copy(category = ItemCategoryWire.lotion_cream, itemName = "  "))!!
        assertEquals(ReadCopy.CATEGORIES.getValue(ItemCategoryWire.lotion_cream), r.itemName)
    }

    @Test fun onlyTheFieldsChangedAreSaved() {
        val d = ReadDrafts.of(bank)
        assertTrue(ReadDrafts.changed(bank, d).isEmpty())
        val patch = ReadDrafts.changed(bank, d.copy(numbers = d.numbers + ("wattHours" to "18.5"), labelText = "Li-ion 18.5Wh"))
        assertEquals(mapOf("wattHours" to JsonPrimitive(18.5), "labelText" to JsonPrimitive("Li-ion 18.5Wh")), patch)
    }
}
