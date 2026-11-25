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
import kotlinx.coroutines.async
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
    private fun box() = BoxController(BoxLogic.empty("CA"), { _, _, _ -> result }, today = { "2026-11-25" })
    private var ids = 0
    private fun session(box: BoxController, outcome: ReadOutcome) =
        BoxSession(box, reader = { outcome }, newId = { "item-${++ids}" }, resetRun = {})

    /** The item keeps the tags the parser gave for the whole label; the read's own text is clipped and never tagged. */
    @Test fun aReadIsAddedWithTheTagsTheParserGaveForItsWholeLabel() = runTest {
        val box = box()
        val message = session(box, ReadOutcome.Read(read, Source.IN_CLOUD, ReadRoute.CLOUD_ONLY, 900, listOf("flammable", "label_text"))).check(crop)
        assertNull(message)
        val item = box.state.items.single()
        assertEquals("item-1", item.input.itemId)
        assertEquals(listOf("flammable", "label_text"), item.input.labelTags)
        assertEquals("phone_cloud", item.readSource)
        assertEquals(900.0, item.readMs, 0.0)
    }

    /** The figures of the whole label are kept with the item, since its label text is clipped and never synced. */
    @Test fun aReadIsAddedWithItsLabelFigures() = runTest {
        val box = box()
        val figures = app.beforeyoutape.engine.LabelFigures(wh = listOf(154.0, 15.4), grams = emptyList())
        session(box, ReadOutcome.Read(read, Source.IN_CLOUD, ReadRoute.CLOUD_ONLY, 900, emptyList(), figures)).check(crop)
        assertEquals(figures, box.state.items.single().input.labelFigures)
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
            reader = { if (paused) ReadOutcome.Blocked(BlockReason.REFUSALS_PAUSED) else ReadOutcome.Read(read, Source.IN_CLOUD, ReadRoute.CLOUD_ONLY, 900, emptyList()) },
            newId = { "n" }, resetRun = { resets++; paused = false },
        )
        assertEquals(Copy.blocked(BlockReason.REFUSALS_PAUSED), s.check(crop))
        s.startNewScan()
        assertEquals("the reset waits for the next read", 0, resets)
        assertNull(s.check(crop))
        assertEquals(1, resets)
        assertEquals(1, box.state.items.size)
    }

    /** A read still running when the person starts a new scan session belongs to the old session. */
    @Test fun aReadInFlightDuringANewSessionIsNotCountedInIt() = runTest {
        val box = box()
        val order = mutableListOf<String>()
        val gate = kotlinx.coroutines.CompletableDeferred<Unit>()
        val s = BoxSession(
            box,
            reader = { order += "read starts"; gate.await(); order += "read ends (its refusal counts)"; ReadOutcome.Failed(FailReason.REFUSED, retryable = true) },
            newId = { "n" }, resetRun = { order += "reset" },
        )
        val slow = async { s.check(crop) }
        kotlinx.coroutines.yield()
        s.startNewScan()
        gate.complete(Unit)
        slow.await()
        s.check(crop)
        // The old read's refusal is counted in the old session; the reset comes only right before the next read.
        assertEquals(listOf("read starts", "read ends (its refusal counts)", "reset", "read starts"), order.take(4))
    }

    /**
     * A crop accepted in the old session but still queued on the worker when the new session starts
     * (the person went to the box and back to the camera before it ran) belongs to the old session:
     * it must not use up the new session's reset.
     */
    @Test fun aQueuedCropFromTheOldSessionDoesNotUseUpTheNewSessionsReset() = runTest {
        val box = box()
        val order = mutableListOf<String>()
        val s = BoxSession(
            box,
            reader = { order += "read"; ReadOutcome.Failed(FailReason.REFUSED, retryable = true) },
            newId = { "n" }, resetRun = { order += "reset" },
        )
        val accepted = s.currentScan()
        s.startNewScan()
        s.check(crop, accepted)
        s.check(crop, s.currentScan())
        // The old crop's refusal counts before the reset; the new session's first read gets the reset.
        assertEquals(listOf("read", "reset", "read"), order)
    }

    /** A read of no item (a camera pointed at a room) adds nothing and says what to do, as the web app does. */
    @Test fun aReadOfNoItemAddsNothing() = runTest {
        val box = box()
        val nothing = read.copy(itemName = "unknown", category = app.beforeyoutape.engine.ItemCategoryWire.other, labelText = "",
            volts = 0.0, milliampHours = 0.0, wattHours = 0.0, lithiumGrams = 0.0, batteryWords = false, liquid = false, pressurized = false,
            alcoholOnLabel = false, flammableOnLabel = false, glassContainer = false, powder = false,
            evidence = app.beforeyoutape.engine.EvidenceWire.not_sure)
        val s = session(box, ReadOutcome.Read(nothing, Source.IN_CLOUD, ReadRoute.CLOUD_ONLY, 300, emptyList()))
        assertEquals(Copy.NO_ITEM, s.check(crop))
        assertEquals(0, box.state.items.size)
        val web = java.io.File(System.getProperty("byt.repoRoot")!!, "src/pages/PackPage.tsx").readText()
        assertTrue(web.contains("const NO_ITEM = \"${Copy.NO_ITEM}\";"))
    }

    @Test fun eachReadGetsItsOwnId() = runTest {
        val box = box()
        val s = session(box, ReadOutcome.Read(read, Source.ON_DEVICE, ReadRoute.DEVICE_ONLY, 300, emptyList()))
        s.check(crop)
        s.check(crop)
        assertEquals(listOf("item-1", "item-2"), box.state.items.map { it.input.itemId })
        assertEquals(2, box.state.onDeviceReads)
    }
}
