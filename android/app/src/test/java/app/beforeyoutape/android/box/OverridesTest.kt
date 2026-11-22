package app.beforeyoutape.android.box

import app.beforeyoutape.android.ai.Source
import app.beforeyoutape.engine.BoxCounts
import app.beforeyoutape.engine.BoxItemInput
import app.beforeyoutape.engine.BoxResult
import app.beforeyoutape.engine.EvidenceWire
import app.beforeyoutape.engine.ItemCategoryWire
import app.beforeyoutape.engine.ItemReadWire
import app.beforeyoutape.engine.LithiumBox
import app.beforeyoutape.engine.RetailBoxWire
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class OverridesTest {
    private val bank = ItemReadWire("Power bank", ItemCategoryWire.power_bank, "Li-ion 5000mAh", 3.7, 5000.0, 0.0, 0.0,
        true, false, false, false, false, false, false, RetailBoxWire.cannot_tell, EvidenceWire.label_read)
    private val result = BoxResult(emptyMap(), LithiumBox("none", emptyList(), emptyList(), ""), emptyList(), BoxCounts(0, 0, 0), "byt-x")

    private class Recorder(val result: BoxResult) : BoxEngine {
        val seen = mutableListOf<List<BoxItemInput>>()
        override fun evaluate(items: List<BoxItemInput>, code: String, today: String): BoxResult { seen += items; return result }
    }

    private fun withBank(engine: Recorder) = BoxController(BoxLogic.empty("CA"), engine, today = { "2026-11-20" }).apply {
        addRead(bank, listOf("lithium_ion"), Source.IN_CLOUD, 900, "b")
    }

    @Test fun aTypedItemIsAddedAsTheSendersAndRechecked() {
        val e = Recorder(result)
        val c = BoxController(BoxLogic.empty("CA"), e, today = { "2026-11-20" })
        c.addManual(bank.copy(evidence = EvidenceWire.item_seen), listOf("lithium_ion"), "t")
        val item = c.state.items.single()
        assertEquals("manual", item.readSource)
        assertEquals("sender", item.input.identityConfirmedBy)
        assertEquals(listOf("lithium_ion"), item.input.labelTags)
        // The sender typed its numbers, and the engine is told so.
        assertEquals("typed", item.input.numbersFrom)
        assertEquals("typed", e.seen.single().single().numbersFrom)
        assertEquals(1, e.seen.size)
    }

    /** A read item says nothing about where its numbers came from: left out, the engine counts them as read. */
    @Test fun aReadItemLeavesNumbersFromOut() {
        assertEquals(null, withBank(Recorder(result)).state.items.single().input.numbersFrom)
    }

    @Test fun aFixedNumberReplacesTheReadOneAndRechecks() {
        val e = Recorder(result)
        val c = withBank(e)
        c.override("b", mapOf("wattHours" to JsonPrimitive(18.5)), labelTags = null)
        val input = c.state.items.single().input
        assertEquals(JsonPrimitive(18.5), input.overrides["wattHours"])
        assertEquals(0.0, input.read.wattHours, 0.0)
        assertEquals(listOf("lithium_ion"), input.labelTags)
        assertEquals(JsonPrimitive(18.5), e.seen.last().single().overrides["wattHours"])
    }

    @Test fun aCorrectedLabelReplacesTheOldLabelTags() {
        val c = withBank(Recorder(result))
        c.override("b", mapOf("labelText" to JsonPrimitive("SHEA LOTION")), labelTags = listOf("liquid"))
        assertEquals(listOf("liquid"), c.state.items.single().input.labelTags)
    }

    /** Typed label words bring their figures, merged with the item's; a fix that types no label keeps the figures. */
    @Test fun aTypedLabelSetsTheFiguresAndOtherFixesKeepThem() {
        val e = Recorder(result)
        val c = withBank(e)
        val figures = app.beforeyoutape.engine.LabelFigures(wh = listOf(18.5), grams = emptyList())
        c.override("b", mapOf("labelText" to JsonPrimitive("Li-ion 18.5Wh")), labelTags = listOf("lithium_ion"), labelFigures = figures)
        assertEquals(figures, c.state.items.single().input.labelFigures)
        assertEquals(figures, e.seen.last().single().labelFigures)
        c.override("b", mapOf("volts" to JsonPrimitive(3.7)), labelTags = null)
        assertEquals(figures, c.state.items.single().input.labelFigures)
    }

    /** The texts a typed label's figures come from: with none kept yet, the read's own label (an item read before
     *  figures were kept) comes too, so its figures are not lost. */
    @Test fun aTypedLabelsFiguresAlsoCoverTheReadLabelWhenNoneAreKept() {
        val input = withBank(Recorder(result)).state.items.single().input
        assertEquals(listOf("Li-ion 5000mAh", "Li-ion 18.5Wh"), BoxLogic.figureTexts(input, "Li-ion 18.5Wh"))
        val kept = input.copy(labelFigures = app.beforeyoutape.engine.LabelFigures(wh = listOf(18.5), grams = emptyList()))
        assertEquals(listOf("Li-ion 18.5Wh"), BoxLogic.figureTexts(kept, "Li-ion 18.5Wh"))
        assertEquals(listOf("Li-ion 18.5Wh"), BoxLogic.figureTexts(input.copy(read = input.read.copy(labelText = "")), "Li-ion 18.5Wh"))
    }

    @Test fun aQuantityIsKeptBetweenOneAndNinetyNineAsOnTheWeb() {
        val c = withBank(Recorder(result))
        c.setQuantity("b", 0.0)
        assertEquals(1.0, c.state.items.single().input.quantity, 0.0)
        c.setQuantity("b", 2.6)
        assertEquals(3.0, c.state.items.single().input.quantity, 0.0)
        c.setQuantity("b", 500.0)
        assertEquals(99.0, c.state.items.single().input.quantity, 0.0)
        c.setQuantity("b", Double.NaN)
        assertEquals(1.0, c.state.items.single().input.quantity, 0.0)
    }

    /** Taps send steps, applied to the current quantity in order, so two fast "+" taps from 1 give 3. */
    @Test fun quantityStepsAddUpAndStayBetweenOneAndNinetyNine() {
        val c = withBank(Recorder(result))
        c.stepQuantity("b", 1)
        c.stepQuantity("b", 1)
        assertEquals(3.0, c.state.items.single().input.quantity, 0.0)
        c.stepQuantity("b", -5)
        assertEquals(1.0, c.state.items.single().input.quantity, 0.0)
        c.setQuantity("b", 99.0)
        c.stepQuantity("b", 1)
        assertEquals(99.0, c.state.items.single().input.quantity, 0.0)
    }

    @Test fun aRemovedItemLeavesTheBoxAndTheBoxRechecks() {
        val e = Recorder(result)
        val c = withBank(e)
        c.addRead(bank, emptyList(), Source.ON_DEVICE, 300, "c")
        c.remove("b")
        assertEquals(listOf("c"), c.state.items.map { it.input.itemId })
        assertEquals(listOf("c"), e.seen.last().map { it.itemId })
    }

    @Test fun aFixStartsFromTheReadWithTheSendersFixesApplied() {
        val c = withBank(Recorder(result))
        c.override("b", mapOf("wattHours" to JsonPrimitive(18.5), "category" to JsonPrimitive("phone")), labelTags = null)
        val r = BoxLogic.effectiveRead(c.state.items.single().input)
        assertEquals(18.5, r.wattHours, 0.0)
        assertEquals(ItemCategoryWire.phone, r.category)
        assertEquals(3.7, r.volts, 0.0)
    }

    @Test fun anOverrideTheReadCannotTakeLeavesTheReadAsItIs() {
        val c = withBank(Recorder(result))
        c.override("b", mapOf("volts" to JsonPrimitive("about four")), labelTags = null)
        assertEquals(3.7, BoxLogic.effectiveRead(c.state.items.single().input).volts, 0.0)
    }

    @Test fun aTypedLabelStaysOffTheSyncedItemToo() {
        val c = withBank(Recorder(result))
        c.override("b", mapOf("labelText" to JsonPrimitive("SHEA LOTION"), "wattHours" to JsonPrimitive(18.5)), labelTags = listOf("liquid"))
        val synced = BoxLogic.forSync(c.state.items.single().input)
        assertEquals("", synced.read.labelText)
        assertTrue("labelText" !in synced.overrides)
        assertEquals(JsonPrimitive(18.5), synced.overrides["wattHours"])
        assertEquals(listOf("liquid"), synced.labelTags)
    }
}
