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
import java.io.File

class ReadDraftTest {
    private fun webFile(path: String) = File(System.getProperty("byt.repoRoot") ?: error("byt.repoRoot is not set by Gradle"), path).readText()

    /** The battery categories and battery tags are the web form's own lists (src/ui/ReadFields.tsx, src/ui/FixReading.tsx). */
    @Test fun theBatteryListsMatchTheWebForm() {
        fun setIn(text: String, name: String): Set<String> {
            val start = text.indexOf(name)
            check(start >= 0) { "$name not found" }
            val body = text.substring(text.indexOf("Set([", start), text.indexOf("])", start))
            return Regex("\"([a-z_]+)\"").findAll(body).map { it.groupValues[1] }.toSet()
        }
        val webCategories = setIn(webFile("src/ui/ReadFields.tsx"), "BATTERY_CATEGORIES")
        val webTags = setIn(webFile("src/ui/FixReading.tsx"), "BATTERY_TAGS")
        assertEquals(11, webCategories.size)
        assertEquals(webCategories, ReadDrafts.BATTERY_CATEGORIES.map { it.name }.toSet())
        assertEquals(webTags, ReadDrafts.BATTERY_TAGS)
    }

    /** As on the web: battery numbers show for a battery item, a label that mentions a battery, or a number already typed. */
    @Test fun batteryNumbersShowOnlyWhereTheWebFormShowsThem() {
        val shirt = ReadDrafts.of(null).copy(category = ItemCategoryWire.clothing)
        assertFalse(ReadDrafts.showsBatteryNumbers(ReadDrafts.of(null)))
        assertFalse(ReadDrafts.showsBatteryNumbers(shirt))
        assertTrue(ReadDrafts.showsBatteryNumbers(shirt.copy(category = ItemCategoryWire.phone)))
        assertTrue(ReadDrafts.showsBatteryNumbers(shirt.copy(flags = shirt.flags + ("batteryWords" to true))))
        assertTrue(ReadDrafts.showsBatteryNumbers(shirt.copy(numbers = shirt.numbers + ("volts" to "3"))))
        assertTrue(ReadDrafts.showsBatteryNumbers(shirt, batteryLabel = true))
        assertTrue(ReadDrafts.labelNamesABattery(listOf("li_ion", "phone")))
        assertFalse(ReadDrafts.labelNamesABattery(listOf("liquid")))
    }

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

    /**
     * A battery number the sender typed into is theirs even when it is the same as the read, if it is above 0: they
     * read it off the label. One typed into and left empty is not saved, and an untouched number never is.
     */
    @Test fun aBatteryNumberTypedIntoIsSavedEvenUnchanged() {
        val d = ReadDrafts.of(bank)
        assertEquals(mapOf("volts" to JsonPrimitive(3.7)), ReadDrafts.changed(bank, d.copy(typed = setOf("volts"))))
        assertTrue(ReadDrafts.changed(bank, d.copy(typed = setOf("wattHours"))).isEmpty())
        assertTrue(ReadDrafts.changed(bank, d).isEmpty())
    }
}
