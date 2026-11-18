package app.beforeyoutape.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class AppIdTest {
    /** The native app and the TWA install side by side, so their ids must differ. */
    @Test fun theAppIdIsNotTheTwaId() {
        assertEquals("app.beforeyoutape.android", BuildConfig.APPLICATION_ID)
        assertNotEquals("app.beforeyoutape.twa", BuildConfig.APPLICATION_ID)
    }
}
