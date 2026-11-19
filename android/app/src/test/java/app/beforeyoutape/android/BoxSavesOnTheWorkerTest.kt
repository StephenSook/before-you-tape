package app.beforeyoutape.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The saved box must never go back in time. Box changes run on one worker thread; a save from any
 * other thread could write an older box over a newer one. So the view model saves in exactly one
 * place, the worker helper, right after each change.
 */
class BoxSavesOnTheWorkerTest {
    private val src = File(System.getProperty("byt.repoRoot")!!, "android/app/src/main/java/app/beforeyoutape/android/BoxViewModel.kt").readText()

    @Test fun theBoxIsSavedOnlyInTheWorkerHelper() {
        assertEquals(1, Regex("""persistence\.save\(""").findAll(src).count())
        val helper = src.substring(src.indexOf("private fun onWorker("), src.indexOf("\n    }\n", src.indexOf("private fun onWorker(")))
        assertTrue("the save must be inside onWorker, on the worker", helper.contains("persistence.save("))
        val publish = src.substring(src.indexOf("private fun publish("), src.indexOf("\n    }\n", src.indexOf("private fun publish(")))
        assertTrue("publish runs on any thread and must not save", !publish.contains("persistence.save("))
    }
}
