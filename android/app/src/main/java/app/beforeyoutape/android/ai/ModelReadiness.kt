package app.beforeyoutape.android.ai

/** Hands out a number per check; only the most recently started check may update the screen. */
class LatestCheck {
    private var latest = 0L

    @Synchronized fun begin(): Long = ++latest

    @Synchronized fun isLatest(check: Long): Boolean = check == latest
}

object ModelReadiness {
    /**
     * The model status to show. While this app's download is running, a status snapshot below
     * AVAILABLE still shows DOWNLOADING, so the download offer cannot come back (and start a second
     * download) part way through.
     */
    fun shown(snapshot: DeviceModelStatus, downloadActive: Boolean): DeviceModelStatus =
        if (downloadActive && snapshot != DeviceModelStatus.AVAILABLE) DeviceModelStatus.DOWNLOADING else snapshot
}
