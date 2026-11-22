package app.beforeyoutape.android.ui

import app.beforeyoutape.android.ai.Source
import app.beforeyoutape.android.box.BoxLogic
import app.beforeyoutape.engine.EvidenceWire
import app.beforeyoutape.engine.ItemCategoryWire
import app.beforeyoutape.engine.ItemReadWire
import app.beforeyoutape.engine.RetailBoxWire
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** The one line the box shows in place of verdicts. "Nothing in the box yet." only when the box is known to be empty. */
class PackLineTest {
    private val empty = BoxLogic.empty("CA")
    private val read = ItemReadWire("Phone", ItemCategoryWire.phone, "3.85V 4000mAh 15.4Wh", 3.85, 4000.0, 15.4, 0.0,
        true, false, false, false, false, false, false, RetailBoxWire.sealed, EvidenceWire.label_read)
    private val one = BoxLogic.addRead(empty, read, emptyList(), Source.ON_DEVICE, 300, "p1")

    @Test fun anEmptyBoxWithNoSaveLeftUnreadIsEmpty() {
        assertEquals(Copy.NO_ITEMS, PackLine.of(empty, savedBoxUnreadable = false))
    }

    @Test fun anEmptyBoxBesideASaveThePhoneCouldNotReadIsNeverCalledEmpty() {
        assertEquals(Copy.SAVED_BOX_UNREADABLE, PackLine.of(empty, savedBoxUnreadable = true))
    }

    @Test fun rulesThatDidNotLoadAreSaidFirst() {
        val failed = BoxLogic.withEngineError(one, "EngineNotLoaded")
        assertEquals(Copy.RULES_NOT_LOADED, PackLine.of(failed, savedBoxUnreadable = false))
        assertEquals(Copy.RULES_NOT_LOADED, PackLine.of(BoxLogic.withEngineError(empty, "EngineNotLoaded"), savedBoxUnreadable = true))
    }

    @Test fun aBoxWithItemsShowsItsVerdictsNotALine() {
        assertNull(PackLine.of(one, savedBoxUnreadable = false))
    }
}
