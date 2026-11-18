package app.beforeyoutape.android.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class LocalStoreTest {
    private class MapPrefs : Prefs {
        val values = mutableMapOf<String, String>()
        override fun get(key: String): String? = values[key]
        override fun put(key: String, value: String) { values[key] = value }
    }

    @Test fun consentIsUnansweredUntilChosen() {
        assertNull(LocalStore(MapPrefs()).cloudConsent())
    }

    @Test fun bothChoicesAreKeptOnThisPhone() {
        val prefs = MapPrefs()
        LocalStore(prefs).setCloudConsent(true)
        assertEquals(true, LocalStore(prefs).cloudConsent())
        LocalStore(prefs).setCloudConsent(false)
        assertEquals(false, LocalStore(prefs).cloudConsent())
    }

    @Test fun anUnreadableValueCountsAsUnanswered() {
        val prefs = MapPrefs().apply { values["cloud_consent"] = "maybe" }
        assertNull(LocalStore(prefs).cloudConsent())
    }

    @Test fun theDestinationIsRememberedAndDefaultsToNone() {
        val prefs = MapPrefs()
        assertNull(LocalStore(prefs).destination())
        LocalStore(prefs).setDestination("CA")
        assertEquals("CA", LocalStore(prefs).destination())
    }
}
