package app.beforeyoutape.engine

/**
 * A JavaScript engine that runs the rules bundle. The app embeds QuickJS; tests use QuickJS on
 * the JVM. [evaluate] returns the script's string result, or null when it gives no string.
 */
interface JsRuntime : AutoCloseable {
    fun evaluate(script: String, name: String): String?
}
