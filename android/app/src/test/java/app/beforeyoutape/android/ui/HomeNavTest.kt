package app.beforeyoutape.android.ui

import app.beforeyoutape.android.ai.DeviceModelStatus
import app.beforeyoutape.android.box.BoxLogic
import org.junit.Assert.assertEquals
import org.junit.Test

class HomeNavTest {
    private val ui = HomeUi(
        loading = false, destinations = emptyList(), box = BoxLogic.empty("CA"), consent = true, deviceModel = DeviceModelStatus.UNAVAILABLE,
        busy = true, message = null, view = HomeView.CAMERA, fixRead = null,
    )

    @Test fun aReadThatLandsWhileOnTheCameraShowsTheBox() {
        val after = HomeNav.afterCheck(ui, message = null)
        assertEquals(HomeView.BOX, after.view)
        assertEquals(false, after.busy)
    }

    /** A slow read must not close a form the person opened meanwhile (and so lose what they typed). */
    @Test fun aReadThatLandsWhileTypingLeavesTheFormOpen() {
        val after = HomeNav.afterCheck(ui.copy(view = HomeView.TYPE), message = null)
        assertEquals(HomeView.TYPE, after.view)
        assertEquals(false, after.busy)
    }

    @Test fun aReadThatFailsStaysWhereThePersonIsAndSaysWhy() {
        val after = HomeNav.afterCheck(ui, message = "We could not read that label.")
        assertEquals(HomeView.CAMERA, after.view)
        assertEquals("We could not read that label.", after.message)
    }
}
