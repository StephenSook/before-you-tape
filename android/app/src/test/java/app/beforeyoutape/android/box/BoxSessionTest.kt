package app.beforeyoutape.android.box

import app.beforeyoutape.android.ai.BlockReason
import app.beforeyoutape.android.ai.FailReason
import app.beforeyoutape.android.ai.ReadOutcome
import app.beforeyoutape.android.ai.ReadRoute
import app.beforeyoutape.android.ai.Source
import app.beforeyoutape.android.capture.CropImage
import app.beforeyoutape.android.ui.Copy
import app.beforeyoutape.engine.BoxCounts
import app.beforeyoutape.engine.BoxResult
import app.beforeyoutape.engine.EvidenceWire
import app.beforeyoutape.engine.ItemCategoryWire
import app.beforeyoutape.engine.ItemReadWire
import app.beforeyoutape.engine.LithiumBox
import app.beforeyoutape.engine.RetailBoxWire
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class BoxSessionTest {
    private val crop = object : CropImage { override val widthPx = 640; override val heightPx = 480 }
    private val read = ItemReadWire("Lotion", ItemCategoryWire.lotion_cream, "SHEA LOTION 8 FL OZ", 0.0, 0.0, 0.0, 0.0,
        false, true, false, false, false, false, false, RetailBoxWire.cannot_tell, EvidenceWire.label_read)
    private val result = BoxResult(emptyMap(), LithiumBox("none", emptyList(), emptyList(), ""), emptyList(), BoxCounts(0, 0, 0), "byt-x")
    private fun box() = BoxController(BoxLogic.empty("CA"), { _, _, _ -> result }, today = { "2026-11-20" })
    private var ids = 0
    private fun session(box: BoxController, outcome: ReadOutcome, tags: (String) -> List<String> = { listOf("liquid") }) =
        BoxSession(box, reader = { outcome }, tags = tags, newId = { "item-${++ids}" }, resetRun = {})

    @Test fun aReadIsAddedWithTheEngineTagsOfItsLabel() = runTest {
        val box = box()
        val seen = mutableListOf<String>()
        val message = session(box, ReadOutcome.Read(read, Source.IN_CLOUD, ReadRoute.CLOUD_ONLY, 900), tags = { seen += it; listOf("liquid") }).check(crop)
        assertNull(message)
        assertEquals(listOf("SHEA LOTION 8 FL OZ"), seen)
        val item = box.state.items.single()
        assertEquals("item-1", item.input.itemId)
        assertEquals(listOf("liquid"), item.input.labelTags)
        assertEquals("phone_cloud", item.readSource)
        assertEquals(900L, item.readMs)
    }

    @Test fun aBlockedReadAddsNothingAndSaysWhy() = runTest {
        val box = box()
        val message = session(box, ReadOutcome.Blocked(BlockReason.OFFLINE)).check(crop)
        assertEquals(Copy.blocked(BlockReason.OFFLINE), message)
        assertTrue(box.state.items.isEmpty())
    }

    @Test fun aFailedReadAddsNothingAndSaysWhy() = runTest {
        val box = box()
        val message = session(box, ReadOutcome.Failed(FailReason.UNREADABLE, retryable = true)).check(crop)
        assertEquals(Copy.failed(FailReason.UNREADABLE), message)
        assertTrue(box.state.items.isEmpty())
    }

    /** Three refusals pause photo reads; going back to the camera starts a new scan session, which lifts the pause. */
    @Test fun aNewScanSessionLiftsTheRefusalPause() = runTest {
        val box = box()
        var paused = true
        var resets = 0
        val s = BoxSession(
            box,
            reader = { if (paused) ReadOutcome.Blocked(BlockReason.REFUSALS_PAUSED) else ReadOutcome.Read(read, Source.IN_CLOUD, ReadRoute.CLOUD_ONLY, 900) },
            tags = { emptyList() }, newId = { "n" }, resetRun = { resets++; paused = false },
        )
        assertEquals(Copy.blocked(BlockReason.REFUSALS_PAUSED), s.check(crop))
        s.startNewScan()
        assertEquals(1, resets)
        assertNull(s.check(crop))
        assertEquals(1, box.state.items.size)
    }

    @Test fun eachReadGetsItsOwnId() = runTest {
        val box = box()
        val s = session(box, ReadOutcome.Read(read, Source.ON_DEVICE, ReadRoute.DEVICE_ONLY, 300))
        s.check(crop)
        s.check(crop)
        assertEquals(listOf("item-1", "item-2"), box.state.items.map { it.input.itemId })
        assertEquals(2, box.state.onDeviceReads)
    }
}
