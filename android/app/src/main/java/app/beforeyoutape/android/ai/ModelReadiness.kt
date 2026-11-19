package app.beforeyoutape.android.ai

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow

/** Hands out a number per check; only the most recently started check may update the screen. */
class LatestCheck {
    private var latest = 0L

    @Synchronized fun begin(): Long = ++latest

    @Synchronized fun isLatest(check: Long): Boolean = check == latest
}

object ModelReadiness {
    /**
     * At launch, a model that can be downloaded starts downloading on Wi-Fi (an unmetered network).
     * On mobile data the app asks first, and a phone with no model never downloads.
     */
    fun startsAtLaunch(status: DeviceModelStatus, unmetered: Boolean): Boolean =
        status == DeviceModelStatus.DOWNLOADABLE && unmetered

    /**
     * Runs this app's model download, calling [onFailed] once when it fails. The pinned SDK reports a
     * failed download as a Failed step and then ends the flow with the exception, so the exception is
     * caught here: a failed download must show a message, never crash the app. Cancellation (the
     * screen closing) still propagates and is not a failure.
     */
    suspend fun collectDownload(download: Flow<ModelDownload>, onFailed: () -> Unit) {
        var failed = false
        val fail = { if (!failed) { failed = true; onFailed() } }
        try {
            download.collect { step -> if (step is ModelDownload.Failed) fail() }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            fail()
        }
    }

    /**
     * The model status to show. While this app's download is running, a status snapshot below
     * AVAILABLE still shows DOWNLOADING, so the download offer cannot come back (and start a second
     * download) part way through.
     */
    fun shown(snapshot: DeviceModelStatus, downloadActive: Boolean): DeviceModelStatus =
        if (downloadActive && snapshot != DeviceModelStatus.AVAILABLE) DeviceModelStatus.DOWNLOADING else snapshot
}
