package app.beforeyoutape.android.ai

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ModelReadinessTest {
    /** Background and resume during a download: the resume check started first must not win when it finishes last. */
    @Test fun anOlderCheckThatFinishesLastIsIgnored() {
        val checks = LatestCheck()
        val resume = checks.begin()
        val afterDownload = checks.begin()
        assertTrue(checks.isLatest(afterDownload))
        assertFalse(checks.isLatest(resume))
    }

    @Test fun whileADownloadRunsTheScreenSaysSoUntilTheModelIsReady() {
        assertEquals(DeviceModelStatus.DOWNLOADING, ModelReadiness.shown(DeviceModelStatus.DOWNLOADABLE, downloadActive = true))
        assertEquals(DeviceModelStatus.DOWNLOADING, ModelReadiness.shown(DeviceModelStatus.UNKNOWN, downloadActive = true))
        assertEquals(DeviceModelStatus.AVAILABLE, ModelReadiness.shown(DeviceModelStatus.AVAILABLE, downloadActive = true))
        assertEquals(DeviceModelStatus.DOWNLOADABLE, ModelReadiness.shown(DeviceModelStatus.DOWNLOADABLE, downloadActive = false))
    }
}
