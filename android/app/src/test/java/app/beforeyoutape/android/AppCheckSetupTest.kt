package app.beforeyoutape.android

import org.junit.Assert.assertEquals
import org.junit.Test

class AppCheckSetupTest {
    /** Unit tests run the debug build type, which carries the debug provider; release carries Play Integrity. */
    @Test fun theDebugBuildUsesTheDebugProvider() {
        assertEquals("debug", AppCheckSetup.PROVIDER)
    }
}
