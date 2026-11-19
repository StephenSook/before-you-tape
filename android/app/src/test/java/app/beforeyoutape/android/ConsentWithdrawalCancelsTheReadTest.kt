package app.beforeyoutape.android

import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Turning off cloud reads must stop a read already under way: the read's job is kept, withdrawal
 * cancels it, and the read checks it is still active before it shows a result.
 */
class ConsentWithdrawalCancelsTheReadTest {
    private val src = File(System.getProperty("byt.repoRoot")!!, "android/app/src/main/java/app/beforeyoutape/android/BoxViewModel.kt").readText()

    private fun body(start: String) = src.substring(src.indexOf(start), src.indexOf("\n    }\n", src.indexOf(start)))

    @Test fun withdrawalCancelsTheReadUnderWay() {
        val off = body("override fun turnOffCloud(")
        assertTrue("withdrawal must cancel the read", off.contains("readJob?.cancel()"))
        assertTrue("withdrawal must save the choice", off.contains("store.setCloudConsent(false)"))
    }

    @Test fun aCancelledReadShowsNothing() {
        val read = src.substring(src.indexOf("readJob = onWorker {"), src.indexOf("afterCheck", src.indexOf("readJob = onWorker {")))
        assertTrue("the read must check it is still active before it shows a result", read.contains("ensureActive()"))
    }
}
