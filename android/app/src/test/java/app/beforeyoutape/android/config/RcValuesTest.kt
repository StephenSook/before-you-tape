package app.beforeyoutape.android.config

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RcValuesTest {
    private val base = RcDefaultsTest.xmlDefaults()

    @Test fun anUnknownModelOptionFallsBackToStable() {
        assertEquals("stable", RcValues.parse(base + ("ondevice_model_option_android" to "turbo")).onDeviceModelOption)
        assertEquals("preview_fast", RcValues.parse(base + ("ondevice_model_option_android" to "preview_fast")).onDeviceModelOption)
    }

    @Test fun killCloudDefaultsToFalseAndReadsTrue() {
        assertFalse(RcValues.parse(base).killCloud)
        assertTrue(RcValues.parse(base + ("kill_cloud" to "true")).killCloud)
        assertFalse(RcValues.parse(base + ("kill_cloud" to "maybe")).killCloud)
    }

    @Test fun aBadMinimumVersionReadsAsZero() {
        assertEquals("0.0.0", RcValues.parse(base + ("minimum_version_android" to "x.y")).minimumVersionAndroid)
        assertEquals("0.2.0", RcValues.parse(base + ("minimum_version_android" to " 0.2.0 ")).minimumVersionAndroid)
    }

    @Test fun anOlderAppNeedsAnUpdateAndAnEqualOrNewerOneDoesNot() {
        val v = RcValues.parse(base + ("minimum_version_android" to "0.10.0"))
        assertTrue(v.needsUpdate("0.9.5"))
        assertFalse(v.needsUpdate("0.10.0"))
        assertFalse(v.needsUpdate("1.0.0"))
        assertFalse(RcValues.parse(base).needsUpdate("0.1.0"))
    }

    @Test fun theModelNameComesOnlyFromRemoteConfigOrItsDefaults() {
        assertEquals(base.getValue("cloud_model_item"), RcValues.parse(base).cloudModelItem)
        assertEquals("", RcValues.parse(base - "cloud_model_item").cloudModelItem)
    }

    /** As on the web: a pin needs a safe id and a 64-hex SHA-256, or it is empty and the built-in edition is used. */
    @Test fun anEditionPinNeedsASafeIdAndAFullHash() {
        val sha = "AB".repeat(32)
        val ok = RcValues.parse(base + ("rules_edition_id" to " byt-abc123 ") + ("rules_edition_sha256" to " $sha "))
        assertEquals("byt-abc123", ok.rulesEditionId)
        assertEquals(sha.lowercase(), ok.rulesEditionSha256)
        for ((id, h) in listOf("Bad ID!" to sha, "byt-abc" to "zz", "" to sha, "byt-abc" to "")) {
            val v = RcValues.parse(base + ("rules_edition_id" to id) + ("rules_edition_sha256" to h))
            assertEquals("", v.rulesEditionId)
            assertEquals("", v.rulesEditionSha256)
        }
    }
}
