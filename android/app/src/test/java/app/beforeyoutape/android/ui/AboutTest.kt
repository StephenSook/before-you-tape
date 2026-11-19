package app.beforeyoutape.android.ui

import app.beforeyoutape.android.ai.DeviceModelStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class AboutTest {
    private val info = AboutInfo(
        deviceModel = DeviceModelStatus.UNAVAILABLE, cloudModel = "gemini-3.5-flash-lite", appCheckProvider = "play_integrity",
        editionId = "byt-e1710fc2f032", bundleCommit = "0123456789abcdef0123", bundleSha256 = "ab".repeat(32), version = "0.1.0",
    )

    @Test fun everyStatusHasItsSentence() {
        assertEquals(
            "This phone has no on-device model. To read a label here, the photo goes to the cloud after you allow it. You can also type the numbers.",
            Copy.modelSentence(DeviceModelStatus.UNAVAILABLE),
        )
        assertEquals("Labels are read on this phone first.", Copy.modelSentence(DeviceModelStatus.AVAILABLE))
        assertEquals("An on-device model can be downloaded to this phone.", Copy.modelSentence(DeviceModelStatus.DOWNLOADABLE))
        assertEquals("The on-device model is downloading.", Copy.modelSentence(DeviceModelStatus.DOWNLOADING))
        assertEquals(
            "This phone could not report its on-device model. Reads use the cloud after you allow it.",
            Copy.modelSentence(DeviceModelStatus.UNKNOWN),
        )
    }

    @Test fun everyRowIsShown() {
        assertEquals(
            listOf(
                Copy.modelSentence(DeviceModelStatus.UNAVAILABLE),
                "Cloud model: gemini-3.5-flash-lite",
                "App Check: play_integrity",
                "Rules edition: byt-e1710fc2f032",
                "Rules bundle: 0123456 (abababababab)",
                "Version 0.1.0",
                "License: Apache-2.0",
            ),
            About.rows(info),
        )
    }

    /** The SDK reports no model name, so About says "ready" and never names one. */
    @Test fun aboutNeverNamesAModelTheSdkDidNotReport() {
        assertEquals(
            listOf(Copy.modelSentence(DeviceModelStatus.AVAILABLE), "On-device model: ready"),
            About.rows(info.copy(deviceModel = DeviceModelStatus.AVAILABLE)).take(2),
        )
        for (s in DeviceModelStatus.entries) {
            val text = About.rows(info.copy(deviceModel = s)).joinToString("\n")
            assertFalse(s.name, text.contains("Nano"))
        }
    }

    @Test fun theRulesLinkIsTheWebAppsRulesPage() {
        assertEquals("https://before-you-tape-2026.web.app/rules", About.RULES_URL)
    }
}
