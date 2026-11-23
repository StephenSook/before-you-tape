package app.beforeyoutape.android.ai

import java.io.File
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Only release builds send Performance Monitoring data. Debug builds (emulators, CI and the live tests) send none,
 * so test runs never mix into the numbers of real reads.
 */
class PerfBuildsTest {
    private val app: File by lazy {
        var root = File("").absoluteFile
        while (!File(root, "android/app/src/main").isDirectory) root = root.parentFile
        File(root, "android/app/src")
    }

    @Test fun aDebugBuildTurnsPerformanceMonitoringOff() {
        val manifest = File(app, "debug/AndroidManifest.xml").readText()
        assertTrue(Regex("""android:name="firebase_performance_collection_deactivated"\s+android:value="true"""").containsMatchIn(manifest))
    }

    @Test fun aReleaseBuildKeepsItOn() {
        assertFalse(File(app, "main/AndroidManifest.xml").readText().contains("firebase_performance_collection"))
        assertFalse(File(app, "release").walk().any { it.isFile && it.readText().contains("firebase_performance_collection") })
    }

    @Test fun theSinkSendsTheTraceNameAndLatencyMetricAiTraceNames() {
        val sink = File(app, "main/java/app/beforeyoutape/android/ai/FirebaseAiTrace.kt").readText()
        assertTrue(sink.contains("newTrace(AiTrace.NAME)"))
        assertTrue(sink.contains("putMetric(AiTrace.LATENCY, latencyMs)"))
    }

    /** AiClient builds a real Firebase model, so like PromptsTest this reads its source. */
    @Test fun everySdkCallTheAppMakesIsTraced() {
        val client = File(app, "main/java/app/beforeyoutape/android/ai/AiClient.kt").readText()
        val traced = client.indexOf("AiTrace.traced(traces, mode, traceModels(v)")
        assertTrue("AiClient.read runs its SDK call inside AiTrace.traced", traced >= 0)
        assertTrue("the generateObject call is the traced block", client.indexOf(".generateObject(", traced) > traced)
        assertTrue(client.indexOf(".generateObject(") > traced)
        val vm = File(app, "main/java/app/beforeyoutape/android/BoxViewModel.kt").readText()
        assertTrue("the app's client sends to Performance Monitoring", vm.contains("AiClient(FirebaseAiTraceSink())"))
    }
}
