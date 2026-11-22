package app.beforeyoutape.android.box

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import app.beforeyoutape.android.ai.Source
import app.beforeyoutape.android.data.BoxDocs
import app.beforeyoutape.android.engine.EngineAssets
import app.beforeyoutape.engine.EvidenceWire
import app.beforeyoutape.engine.ItemCategoryWire
import app.beforeyoutape.engine.ItemReadWire
import app.beforeyoutape.engine.RetailBoxWire
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * With this app's engine: a photo read whose label names a figure its own number disagrees with is held on
 * DATA-LABEL-NUMBERS, and it is still held after it is saved to the synced document and loaded back, though the
 * synced read carries no label text. Without the kept figures it would not be.
 */
@RunWith(AndroidJUnit4::class)
class LabelFiguresReloadTest {
    @Test fun aSyncedAndReloadedItemStillHoldsOnItsLabelFigures() {
        EngineAssets.load(InstrumentationRegistry.getInstrumentation().targetContext).use { host ->
            val label = "LI-ION 3.85V 4000mAh 15.4Wh PACK 154Wh"
            val read = ItemReadWire("Phone", ItemCategoryWire.phone, label, 3.85, 4000.0, 15.4, 0.0,
                true, false, false, false, false, false, false, RetailBoxWire.sealed, EvidenceWire.label_read)
            val box = BoxController(BoxLogic.empty("CA"), BoxEngine { items, code, today -> host.evaluateBox(items, code, today) }, today = { "2026-11-20" })
            box.addRead(read, host.labelTags(label), Source.IN_CLOUD, 900, "p", host.labelFigures(listOf(label)))
            fun rules(input: app.beforeyoutape.engine.BoxItemInput) =
                host.evaluateBox(listOf(input), "CA", "2026-11-20").items.getValue("p").hits.map { it.ruleId }
            assertTrue("DATA-LABEL-NUMBERS" in box.state.result!!.items.getValue("p").hits.map { it.ruleId })
            val reloaded = BoxDocs.itemFromDoc("p", BoxDocs.itemToDoc(box.state.items.single())).input
            assertEquals("", reloaded.read.labelText)
            assertTrue("DATA-LABEL-NUMBERS" in rules(reloaded))
            assertTrue("DATA-LABEL-NUMBERS" !in rules(reloaded.copy(labelFigures = null)))
        }
    }
}
