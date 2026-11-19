package app.beforeyoutape.android.box

import app.beforeyoutape.engine.EvidenceWire
import app.beforeyoutape.engine.ItemCategoryWire
import app.beforeyoutape.engine.ItemReadWire
import app.beforeyoutape.engine.RetailBoxWire
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/** The web app's no-item rule (src/shared/noItem.ts), with its own test cases. */
class NoItemTest {
    private val read = ItemReadWire("unknown", ItemCategoryWire.other, "", 0.0, 0.0, 0.0, 0.0,
        false, false, false, false, false, false, false, RetailBoxWire.cannot_tell, EvidenceWire.not_sure)

    @Test fun findsAReadOfNoItem() {
        for (name in listOf("unknown", "Unknown item", "", "none", "nothing", "No item", "unclear object", "N/A", "an unknown object")) {
            assertTrue(name, NoItem.isNoItem(read.copy(itemName = name)))
        }
    }

    @Test fun keepsAnyReadThatNamesReadsOrNoticesSomething() {
        assertFalse(NoItem.isNoItem(read.copy(itemName = "small box")))
        assertFalse(NoItem.isNoItem(read.copy(category = ItemCategoryWire.power_bank)))
        assertFalse(NoItem.isNoItem(read.copy(evidence = EvidenceWire.item_seen)))
        assertFalse(NoItem.isNoItem(read.copy(labelText = "50000mAh")))
        assertFalse(NoItem.isNoItem(read.copy(liquid = true)))
        assertFalse(NoItem.isNoItem(read.copy(batteryWords = true)))
        assertFalse(NoItem.isNoItem(read.copy(wattHours = 185.0)))
        assertFalse(NoItem.isNoItem(read.copy(flammableOnLabel = true)))
    }

    /** The name pattern is the web file's own, so the two cannot drift apart. */
    @Test fun theNamePatternIsTheWebs() {
        val ts = File(System.getProperty("byt.repoRoot")!!, "src/shared/noItem.ts").readText()
        val web = Regex("""const NO_NAME = /(.+)/i;""").find(ts)!!.groupValues[1]
        assertEquals(web, NoItem.NO_NAME_PATTERN)
    }
}
