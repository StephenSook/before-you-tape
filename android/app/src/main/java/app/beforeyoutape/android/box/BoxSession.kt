package app.beforeyoutape.android.box

import app.beforeyoutape.android.ai.ReadOutcome
import app.beforeyoutape.android.capture.CropImage
import app.beforeyoutape.android.ui.Copy

/**
 * One "Check now": the crop goes to the reader, and a read is added to the box with the tags the
 * parser gave for its whole label (the box then re-checks itself); the read's clipped text is never
 * tagged. A blocked or failed read adds nothing and gives the one line that says why.
 */
class BoxSession(
    private val box: BoxController,
    private val reader: suspend (CropImage) -> ReadOutcome,
    private val newId: () -> String,
    private val resetRun: () -> Unit,
) {
    /** The current scan session; a new one starts each time the person goes back to the camera. */
    @Volatile private var scan = 0L

    /** The newest session whose reset has run (only the worker reads and writes it). */
    private var resetFor = 0L

    /**
     * A new scan session (the person went back to the camera): three refusals in a row pause photo
     * reads for the session, and the session's first read lifts the pause. A crop belongs to the
     * session that was current when it was accepted, so a read still running or still queued from
     * the old session counts in the old session.
     */
    fun startNewScan() {
        scan++
    }

    /** The scan session a crop belongs to: read it when the crop is accepted. */
    fun currentScan(): Long = scan

    /** null when the item was added, otherwise the line to show. */
    suspend fun check(crop: CropImage, scanOfCrop: Long = currentScan()): String? {
        if (scanOfCrop > resetFor) {
            resetFor = scanOfCrop
            resetRun()
        }
        return outcome(reader(crop))
    }

    private fun outcome(out: ReadOutcome): String? = when (out) {
        // A read of no item (a camera pointed at a room) is dropped, never added, as on the web.
        is ReadOutcome.Read -> if (NoItem.isNoItem(out.read)) Copy.NO_ITEM else {
            box.addRead(out.read, out.labelTags, out.source, out.ms, newId(), out.labelFigures)
            null
        }
        is ReadOutcome.Blocked -> Copy.blocked(out.reason)
        is ReadOutcome.Failed -> Copy.failed(out.reason)
    }
}
