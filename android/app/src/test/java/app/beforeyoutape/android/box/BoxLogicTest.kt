package app.beforeyoutape.android.box

import app.beforeyoutape.android.ai.Source
import app.beforeyoutape.engine.BoxCounts
import app.beforeyoutape.engine.BoxItemInput
import app.beforeyoutape.engine.BoxResult
import app.beforeyoutape.engine.EngineError
import app.beforeyoutape.engine.EvidenceWire
import app.beforeyoutape.engine.ItemCategoryWire
import app.beforeyoutape.engine.ItemReadWire
import app.beforeyoutape.engine.LithiumBox
import app.beforeyoutape.engine.RetailBoxWire
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class BoxLogicTest {
    private val read = ItemReadWire("Lotion", ItemCategoryWire.lotion_cream, "SHEA LOTION 8 FL OZ", 0.0, 0.0, 0.0, 0.0,
        false, true, false, false, false, false, false, RetailBoxWire.cannot_tell, EvidenceWire.label_read)
    private val result = BoxResult(emptyMap(), LithiumBox("none", emptyList(), emptyList(), ""), emptyList(), BoxCounts(0, 0, 0), "byt-x")

    /** A fake engine: records each box it judges; can be told to fail. */
    private class FakeEngine(val answer: BoxResult, var fail: Boolean = false) : BoxEngine {
        val codes = mutableListOf<String>()
        val itemCounts = mutableListOf<Int>()
        override fun evaluate(items: List<BoxItemInput>, code: String, today: String): BoxResult {
            if (fail) throw EngineError("NoEditionError", "no edition")
            codes += code
            itemCounts += items.size
            return answer
        }
    }

    private fun controller(engine: BoxEngine) = BoxController(BoxLogic.empty("CA"), engine, today = { "2026-11-20" })

    @Test fun aReadIsAddedWithWhereItRanAndRechecked() {
        val e = FakeEngine(result)
        val c = controller(e)
        c.addRead(read, listOf("liquid"), Source.ON_DEVICE, 120, "item-1")
        val item = c.state.items.single()
        assertEquals("phone_on_device", item.readSource)
        assertEquals(listOf("liquid"), item.input.labelTags)
        assertEquals(1, c.state.onDeviceReads)
        assertEquals(result, c.state.result)
        assertEquals(listOf("CA"), e.codes)
    }

    @Test fun aCountryChangeRechecksWithNoModelCall() {
        val e = FakeEngine(result)
        val c = controller(e)
        c.addRead(read, emptyList(), Source.IN_CLOUD, 900, "item-1")
        c.setDestination("PH")
        assertEquals(listOf("CA", "PH"), e.codes)
        assertEquals(1, c.state.rulesOnlyRechecks)
        assertEquals(1, c.state.cloudReads)
    }

    @Test fun aLateReadUsesTheCurrentDestination() {
        val e = FakeEngine(result)
        val c = controller(e)
        c.setDestination("GB")
        c.addRead(read, emptyList(), Source.IN_CLOUD, 900, "item-1")
        assertEquals("GB", e.codes.last())
    }

    @Test fun answeringAQuestionRechecksWithTheAnswer() {
        val e = FakeEngine(result)
        val c = controller(e)
        c.addRead(read, emptyList(), Source.IN_CLOUD, 900, "item-1")
        c.answer("item-1", "label_alcohol", "no")
        assertEquals(mapOf("label_alcohol" to "no"), c.state.items.single().input.answers)
        assertEquals(2, e.codes.size)
    }

    @Test fun labelTextIsKeptOutOfTheSyncedItem() {
        val c = controller(FakeEngine(result))
        c.addRead(read, listOf("liquid"), Source.IN_CLOUD, 900, "item-1")
        val synced = BoxLogic.forSync(c.state.items.single().input)
        assertEquals("", synced.read.labelText)
        assertEquals(listOf("liquid"), synced.labelTags)
        assertEquals("SHEA LOTION 8 FL OZ", c.state.items.single().input.read.labelText)
    }

    @Test fun withNoEngineNoVerdictIsShown() {
        val e = FakeEngine(result, fail = true)
        val c = controller(e)
        c.addRead(read, emptyList(), Source.IN_CLOUD, 900, "item-1")
        assertNull(c.state.result)
        assertEquals("NoEditionError", c.state.engineError)
    }
}
