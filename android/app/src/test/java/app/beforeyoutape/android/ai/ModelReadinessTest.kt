package app.beforeyoutape.android.ai

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
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

    /** The pinned SDK reports a failed download as a Failed step and then ends the flow with the exception. */
    @Test fun aDownloadThatFailsAndThenThrowsShowsOneFailureAndDoesNotCrash() = runTest {
        var failures = 0
        ModelReadiness.collectDownload(flow { emit(ModelDownload.Failed("no space")); throw IllegalStateException("download failed") }) { failures++ }
        assertEquals(1, failures)
    }

    @Test fun aDownloadThatOnlyThrowsStillShowsTheFailure() = runTest {
        var failures = 0
        ModelReadiness.collectDownload(flow<ModelDownload> { throw IllegalStateException("download failed") }) { failures++ }
        assertEquals(1, failures)
    }

    @Test fun cancellingTheDownloadIsNotAFailure() = runTest {
        var failures = 0
        assertThrows(CancellationException::class.java) {
            kotlinx.coroutines.runBlocking { ModelReadiness.collectDownload(flow<ModelDownload> { throw CancellationException("screen closed") }) { failures++ } }
        }
        assertEquals(0, failures)
    }

    @Test fun whileADownloadRunsTheScreenSaysSoUntilTheModelIsReady() {
        assertEquals(DeviceModelStatus.DOWNLOADING, ModelReadiness.shown(DeviceModelStatus.DOWNLOADABLE, downloadActive = true))
        assertEquals(DeviceModelStatus.DOWNLOADING, ModelReadiness.shown(DeviceModelStatus.UNKNOWN, downloadActive = true))
        assertEquals(DeviceModelStatus.AVAILABLE, ModelReadiness.shown(DeviceModelStatus.AVAILABLE, downloadActive = true))
        assertEquals(DeviceModelStatus.DOWNLOADABLE, ModelReadiness.shown(DeviceModelStatus.DOWNLOADABLE, downloadActive = false))
    }
}
