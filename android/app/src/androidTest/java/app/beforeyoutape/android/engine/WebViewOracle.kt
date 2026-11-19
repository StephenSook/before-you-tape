package app.beforeyoutape.android.engine

import android.content.Context
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** One way to call the rules bundle's JSON bridge: BYT.<function>(<JSON string literal>) and its reply text. */
fun interface BridgeCall {
    fun call(function: String, argument: String): String
}

/**
 * The same rules bundle and edition in an android.webkit.WebView (V8), test code only: the oracle the
 * app's QuickJS runtime is compared against. Arguments go in as JSON string literals, never as raw text.
 */
class WebViewOracle(context: Context, bundle: String, edition: String) : BridgeCall, AutoCloseable {
    private lateinit var web: WebView
    private val instrumentation = InstrumentationRegistry.getInstrumentation()

    val webViewVersion: String = android.webkit.WebView.getCurrentWebViewPackage()?.versionName ?: "unknown"

    init {
        val loaded = CountDownLatch(1)
        instrumentation.runOnMainSync {
            web = WebView(context)
            web.settings.javaScriptEnabled = true
            web.webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView, url: String?) = loaded.countDown()
            }
            web.loadDataWithBaseURL(null, "<html><body></body></html>", "text/html", "utf-8", null)
        }
        check(loaded.await(30, TimeUnit.SECONDS)) { "the blank page did not load" }
        evaluate("$bundle\n;'loaded'")
        val reply = evaluate("BYT.setEdition(${literal(edition)})")
        check(reply.contains("\"ok\":true")) { "setEdition failed in the WebView: ${reply.take(200)}" }
    }

    override fun call(function: String, argument: String): String = evaluate("BYT.$function(${literal(argument)})")

    /** The script's last value; WebView hands it back JSON-encoded, so a string reply is decoded once. */
    private fun evaluate(script: String): String {
        val done = CountDownLatch(1)
        var result: String? = null
        instrumentation.runOnMainSync { web.evaluateJavascript(script) { result = it; done.countDown() } }
        check(done.await(60, TimeUnit.SECONDS)) { "the WebView did not answer" }
        val raw = result ?: "null"
        return if (raw.startsWith("\"")) Json.decodeFromString(String.serializer(), raw) else raw
    }

    override fun close() {
        instrumentation.runOnMainSync { web.destroy() }
    }

    companion object {
        fun literal(s: String) = Json.encodeToString(String.serializer(), s)
    }
}

/** The app's own runtime (QuickJS) with the same bundle and edition, called the same way. */
class QuickJsBridge(bundle: String, edition: String) : BridgeCall, AutoCloseable {
    private val runtime = QuickJsRuntime()

    init {
        runtime.evaluate(bundle, "byt-engine.js")
        val reply = runtime.evaluate("BYT.setEdition(${WebViewOracle.literal(edition)})", "setEdition")
        check(reply?.contains("\"ok\":true") == true) { "setEdition failed in QuickJS" }
    }

    override fun call(function: String, argument: String): String =
        runtime.evaluate("BYT.$function(${WebViewOracle.literal(argument)})", function) ?: "null"

    override fun close() = runtime.close()
}
