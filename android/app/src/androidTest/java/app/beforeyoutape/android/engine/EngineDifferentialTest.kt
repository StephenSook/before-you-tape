package app.beforeyoutape.android.engine

import android.os.Build
import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import app.beforeyoutape.engine.BoxItemInput
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import org.junit.AfterClass
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.security.MessageDigest

/**
 * QuickJS (the app's runtime) against WebView V8 (an independent engine), on the same bundle and
 * edition: every vector's raw reply text and every corpus label's tags must be byte for byte equal.
 */
@RunWith(AndroidJUnit4::class)
class EngineDifferentialTest {
    companion object {
        private val ctx = InstrumentationRegistry.getInstrumentation().targetContext
        private fun appAsset(name: String) = ctx.assets.open(name).bufferedReader().use { it.readText() }
        private val bundle = appAsset("engine/byt-engine.js")
        private val edition = appAsset("engine/edition.json")
        private val quick = QuickJsBridge(bundle, edition)
        private val oracle = WebViewOracle(ctx, bundle, edition)
        private val json = Json { encodeDefaults = true }

        @JvmStatic @AfterClass fun close() { quick.close(); oracle.close() }

        /** Every input as (bridge function, argument): box and guard vectors, destination vectors, corpus labels. */
        fun inputs(): List<Pair<String, String>> {
            val boxes = (DeviceVectors.box + DeviceVectors.guards).map { v ->
                val items: List<BoxItemInput> = v.getValue("items").jsonArray.map { DeviceVectors.item(it.jsonObject) }
                "evaluateBoxJson" to buildJsonObject {
                    put("items", json.encodeToJsonElement(ListSerializer(BoxItemInput.serializer()), items))
                    put("code", v.getValue("code").jsonPrimitive.content)
                    put("today", v.getValue("today").jsonPrimitive.content)
                }.toString()
            }
            val defaults = Json.parseToJsonElement(DeviceVectors.asset("vectors/defaults.json")).jsonObject
            val destinations = DeviceVectors.destinations.map { v ->
                "destinationHitsJson" to buildJsonObject {
                    put("facts", JsonObject(defaults.getValue("baseFacts").jsonObject + ("tags" to v.getValue("tags"))))
                    put("answers", JsonObject(emptyMap()))
                    put("code", v.getValue("code").jsonPrimitive.content)
                }.toString()
            }
            val labels = Json.parseToJsonElement(DeviceVectors.asset("label-corpus.json")).jsonObject.getValue("cases").jsonArray
                .map { "labelTagsJson" to it.jsonPrimitive.content }
            return boxes + destinations + labels
        }

        /** Each input whose two replies differ, with both replies. */
        fun mismatches(inputs: List<Pair<String, String>>, a: BridgeCall, b: BridgeCall): List<String> = inputs.mapNotNull { (fn, arg) ->
            val x = a.call(fn, arg)
            val y = b.call(fn, arg)
            if (x == y) null else "$fn(${arg.take(120)}): quickjs=${x.take(300)} webview=${y.take(300)}"
        }
    }

    @Test fun quickJsAndWebViewV8GiveEqualOutputForEveryInput() {
        val all = inputs()
        val labels = all.count { it.first == "labelTagsJson" }
        assertTrue("at least 300 inputs: ${all.size}", all.size >= 300)
        assertTrue("at least 300 corpus labels counted with the vectors: $labels", labels >= 300)
        val diff = mismatches(all, quick, oracle)
        assertEquals(emptyList<String>(), diff)
        val sha = MessageDigest.getInstance("SHA-256").digest(bundle.toByteArray()).joinToString("") { "%02x".format(it) }
        Log.i("BYT-PARITY", "device=${Build.MODEL} sdk=${Build.VERSION.SDK_INT} webview=${oracle.webViewVersion} bundle=${sha.take(12)} inputs=${all.size} labels=$labels equal")
    }

    /** Feeding the oracle a different label once is reported, so the comparison above cannot pass by comparing nothing. */
    @Test fun aPlantedDifferenceIsReported() {
        val input = listOf("labelTagsJson" to "CONTAINS ALCOHOL")
        val planted = BridgeCall { fn, _ -> oracle.call(fn, "SHEA BUTTER LOTION 8 FL OZ") }
        assertEquals(1, mismatches(input, quick, planted).size)
        assertEquals(0, mismatches(input, quick, oracle).size)
    }
}
