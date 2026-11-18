package app.beforeyoutape.android.ai

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ReadRoutesTest {
    @Test fun theFourRowsOfTheDesignTable() {
        assertEquals(ReadRoute.HYBRID, ReadRoutes.choose(DeviceModelStatus.AVAILABLE, cloudAllowed = true))
        assertEquals(ReadRoute.DEVICE_ONLY, ReadRoutes.choose(DeviceModelStatus.AVAILABLE, cloudAllowed = false))
        for (other in DeviceModelStatus.entries - DeviceModelStatus.AVAILABLE) {
            assertEquals(ReadRoute.CLOUD_ONLY, ReadRoutes.choose(other, cloudAllowed = true))
            assertEquals(ReadRoute.BLOCKED, ReadRoutes.choose(other, cloudAllowed = false))
        }
    }

    @Test fun unansweredConsentCountsAsNotGiven() {
        assertFalse(ReadRoutes.cloudAllowed(consent = null, online = true, killCloud = false))
        assertFalse(ReadRoutes.cloudAllowed(consent = false, online = true, killCloud = false))
        assertTrue(ReadRoutes.cloudAllowed(consent = true, online = true, killCloud = false))
    }

    @Test fun killCloudStopsTheCloud() {
        assertFalse(ReadRoutes.cloudAllowed(consent = true, online = true, killCloud = true))
        assertFalse(ReadRoutes.cloudAllowed(consent = true, online = false, killCloud = false))
    }
}
