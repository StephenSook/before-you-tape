package app.beforeyoutape.android.box

import app.beforeyoutape.android.ai.ReadOutcome
import app.beforeyoutape.android.capture.CropImage
import app.beforeyoutape.android.ui.Copy

/**
 * One "Check now": the crop goes to the reader, and a read is added to the box with the engine's
 * tags for its label text (the box then re-checks itself). A blocked or failed read adds nothing
 * and gives the one line that says why.
 */
class BoxSession(
    private val box: BoxController,
    private val reader: suspend (CropImage) -> ReadOutcome,
    private val tags: (String) -> List<String>,
    private val newId: () -> String,
    private val resetRun: () -> Unit,
) {
    /**
     * A new scan session (the person went back to the camera): three refusals in a row pause photo
     * reads for the session, and this lifts the pause.
     */
    fun startNewScan() = resetRun()

    /** null when the item was added, otherwise the line to show. */
    suspend fun check(crop: CropImage): String? = when (val out = reader(crop)) {
        is ReadOutcome.Read -> {
            box.addRead(out.read, tags(out.read.labelText), out.source, out.ms, newId())
            null
        }
        is ReadOutcome.Blocked -> Copy.blocked(out.reason)
        is ReadOutcome.Failed -> Copy.failed(out.reason)
    }
}
