package app.beforeyoutape.android.engine

import app.beforeyoutape.engine.JsRuntime
import app.cash.zipline.QuickJs
import java.util.concurrent.Callable
import java.util.concurrent.ExecutionException
import java.util.concurrent.Executors

/**
 * QuickJS (through Zipline) inside the app. A QuickJS context must stay on the thread that made
 * it, so every call runs on one dedicated thread and is never hopped.
 */
class QuickJsRuntime : JsRuntime {
    private val thread = Executors.newSingleThreadExecutor { r -> Thread(r, "byt-quickjs") }
    private val js: QuickJs = onThread { QuickJs.create() }

    private fun <T> onThread(work: () -> T): T = try {
        thread.submit(Callable { work() }).get()
    } catch (e: ExecutionException) {
        throw e.cause ?: e
    }

    override fun evaluate(script: String, name: String): String? = onThread { js.evaluate(script, name) as String? }

    override fun close() {
        try {
            onThread { js.close() }
        } finally {
            thread.shutdown()
        }
    }
}
