package app.beforeyoutape.engine

import app.cash.zipline.QuickJs

/** QuickJS on the JVM through Zipline: the same engine family the app embeds, runnable in unit tests and CI. */
class QuickJsTestRuntime : JsRuntime {
    private val js = QuickJs.create()

    override fun evaluate(script: String, name: String): String? = js.evaluate(script, name) as String?

    override fun close() = js.close()
}
