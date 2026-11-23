package app.beforeyoutape.android.ai

import com.google.firebase.ai.InferenceSource
import com.google.firebase.ai.type.PublicPreviewAPI
import java.io.IOException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

@OptIn(PublicPreviewAPI::class)
class AiTraceTest {
    private val models = AiTrace.Models(cloud = "gemini-3.5-flash-lite", device = "on-device-stable")

    /** A sink that keeps what each trace was finished with. */
    private class Recording : AiTraceSink {
        val finished = mutableListOf<Pair<Map<String, String>, Long>>()
        var started = 0
        override fun start(): AiCallTrace {
            started++
            return AiCallTrace { attributes, latencyMs -> finished += attributes to latencyMs }
        }
    }

    @Test fun namesTheRouteTheSdkReportedAndTheModelThatRouteUsed() {
        assertEquals(
            mapOf("source" to "on_device", "mode" to "prefer_on_device", "model" to "on-device-stable", "outcome" to "ok"),
            AiTrace.attributes(SdkMode.PREFER_ON_DEVICE, models, AiTrace.Result.Ok(InferenceSource.ON_DEVICE)),
        )
        assertEquals(
            mapOf("source" to "in_cloud", "mode" to "prefer_on_device", "model" to "gemini-3.5-flash-lite", "outcome" to "ok"),
            AiTrace.attributes(SdkMode.PREFER_ON_DEVICE, models, AiTrace.Result.Ok(InferenceSource.IN_CLOUD)),
        )
    }

    @Test fun aCallThatThrewNamesOnlyAModelItsModeCanUse() {
        val failed = AiTrace.Result.Failed(CallFailure.TRANSIENT)
        assertEquals(
            mapOf("source" to "none", "mode" to "only_in_cloud", "model" to "gemini-3.5-flash-lite", "outcome" to "failed"),
            AiTrace.attributes(SdkMode.ONLY_IN_CLOUD, models, failed),
        )
        assertEquals("on-device-stable", AiTrace.attributes(SdkMode.ONLY_ON_DEVICE, models, failed)["model"])
        assertEquals("unknown", AiTrace.attributes(SdkMode.PREFER_ON_DEVICE, models, failed)["model"])
    }

    @Test fun outcomesFollowTheAppsOwnFailureKinds() {
        val outcome = { r: AiTrace.Result -> AiTrace.attributes(SdkMode.ONLY_IN_CLOUD, models, r)["outcome"] }
        assertEquals("refused", outcome(AiTrace.Result.Failed(CallFailure.REFUSED)))
        for (f in listOf(CallFailure.TRANSIENT, CallFailure.DEVICE, CallFailure.OTHER)) assertEquals("failed", outcome(AiTrace.Result.Failed(f)))
        assertEquals("withdrawn", outcome(AiTrace.Result.Withdrawn))
    }

    @Test fun givesPerformanceMonitoringOnlyValuesItAccepts() {
        val empty = AiTrace.Models(cloud = "", device = "on-device-stable")
        assertEquals("unknown", AiTrace.attributes(SdkMode.ONLY_IN_CLOUD, empty, AiTrace.Result.Ok(InferenceSource.IN_CLOUD))["model"])
        val long = AiTrace.Models(cloud = "m".repeat(130), device = "on-device-stable")
        assertEquals(100, AiTrace.attributes(SdkMode.ONLY_IN_CLOUD, long, AiTrace.Result.Ok(InferenceSource.IN_CLOUD))["model"]!!.length)
    }

    @Test fun theOnDeviceModelIsTheRemoteConfigOptionTheSdkIsGiven() {
        assertEquals("on-device-stable", AiTrace.deviceModel("stable"))
        assertEquals("on-device-preview", AiTrace.deviceModel("preview"))
        assertEquals("on-device-preview_fast", AiTrace.deviceModel("preview_fast"))
        assertEquals("on-device-stable", AiTrace.deviceModel("anything else"))
    }

    @Test fun tracesOneCallWithItsLatencyAndReturnsItsResult() = runTest {
        val sink = Recording()
        var now = 1_000_000_000L
        val out = AiTrace.traced(sink, SdkMode.ONLY_ON_DEVICE, models, { _: String -> InferenceSource.ON_DEVICE }, { now }) {
            now += 812_400_000L
            "reply"
        }
        assertEquals("reply", out)
        assertEquals(1, sink.started)
        assertEquals(listOf(AiTrace.attributes(SdkMode.ONLY_ON_DEVICE, models, AiTrace.Result.Ok(InferenceSource.ON_DEVICE)) to 812L), sink.finished)
    }

    @Test fun tracesACallThatThrewAndRethrowsTheSameError() = runTest {
        val sink = Recording()
        val boom = IOException("network")
        try {
            AiTrace.traced<String>(sink, SdkMode.ONLY_IN_CLOUD, models, { InferenceSource.IN_CLOUD }) { throw boom }
            fail("the error must reach the caller")
        } catch (e: IOException) {
            assertSame(boom, e)
        }
        assertEquals("failed", sink.finished.single().first["outcome"])
        assertEquals("none", sink.finished.single().first["source"])
    }

    @Test fun aRefusalAndAWithdrawnCallAreNamedAsSuch() = runTest {
        val sink = Recording()
        // The SDK's exception constructors are Kotlin-internal but public on the JVM (as in AiMappingTest).
        val blocked = Class.forName("com.google.firebase.ai.type.ContentBlockedException")
            .getConstructor(String::class.java, Throwable::class.java).newInstance("blocked", null) as Exception
        runCatching { AiTrace.traced<String>(sink, SdkMode.ONLY_IN_CLOUD, models, { InferenceSource.IN_CLOUD }) { throw blocked } }
        runCatching { AiTrace.traced<String>(sink, SdkMode.PREFER_ON_DEVICE, models, { InferenceSource.ON_DEVICE }) { throw CancellationException("left") } }
            .onSuccess { fail("a cancelled call must stay cancelled") }
            .onFailure { assertTrue(it is CancellationException) }
        assertEquals(listOf("refused", "withdrawn"), sink.finished.map { it.first["outcome"] })
    }

    @Test fun aTelemetryFailureNeverReachesTheRead() = runTest {
        val broken = object : AiTraceSink {
            override fun start(): AiCallTrace = throw IllegalStateException("performance monitoring is off")
        }
        assertEquals("reply", AiTrace.traced(broken, SdkMode.ONLY_IN_CLOUD, models, { _: String -> InferenceSource.IN_CLOUD }) { "reply" })
        val failsOnFinish = object : AiTraceSink {
            override fun start() = AiCallTrace { _, _ -> throw IllegalStateException("stop failed") }
        }
        assertEquals("reply", AiTrace.traced(failsOnFinish, SdkMode.ONLY_IN_CLOUD, models, { _: String -> InferenceSource.IN_CLOUD }) { "reply" })
    }
}
