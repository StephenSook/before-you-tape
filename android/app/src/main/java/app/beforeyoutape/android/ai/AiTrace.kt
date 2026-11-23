package app.beforeyoutape.android.ai

import com.google.firebase.ai.InferenceSource
import com.google.firebase.ai.type.PublicPreviewAPI
import kotlinx.coroutines.CancellationException

/** One trace, started before an AI Logic call and finished with what the call came to. */
fun interface AiCallTrace {
    fun finish(attributes: Map<String, String>, latencyMs: Long)
}

/** Where traces go: Firebase Performance Monitoring in the app, a list in tests, nowhere in tools. */
fun interface AiTraceSink {
    fun start(): AiCallTrace
}

val NoAiTrace = AiTraceSink { AiCallTrace { _, _ -> } }

/**
 * One Performance Monitoring trace "ai_read" per Firebase AI Logic call, with the same four attributes as
 * the web app's (src/telemetry/aiTrace.ts): the route the SDK reported in inferenceSource, the SDK mode
 * asked, the model that route used, and how the call ended, plus its latency. AI monitoring in the console
 * shows cloud calls only, so this is the only record of on-device calls and their latency. A trace never
 * holds the photo, the prompt, the label text or an answer.
 */
@OptIn(PublicPreviewAPI::class)
object AiTrace {
    const val NAME = "ai_read"
    const val LATENCY = "latency_ms"

    /** The call's two possible models: the cloud model Remote Config names, and the on-device option. */
    data class Models(val cloud: String, val device: String)

    sealed interface Result {
        /** source: what the SDK reported; null when the reply's source could not be read (traced as unreported). */
        data class Ok(val source: InferenceSource?) : Result
        /** The call threw: refused when the app's own read rules call it a refusal (CallFailure.REFUSED). */
        data class Failed(val failure: CallFailure) : Result
        /** The read was cancelled (the sender left or took it back). */
        data object Withdrawn : Result
    }

    /** The on-device model by the Remote Config option the SDK is given; the SDK does not name it otherwise. */
    fun deviceModel(option: String): String = "on-device-" + AiMapping.modelOptionName(option)

    fun attributes(mode: SdkMode, models: Models, r: Result): Map<String, String> {
        val source = when {
            r !is Result.Ok -> "none"
            r.source == InferenceSource.ON_DEVICE -> "on_device"
            r.source == InferenceSource.IN_CLOUD -> "in_cloud"
            else -> "unreported"
        }
        // The route's model: the SDK's report first, then the one place the mode can run, never a guess.
        val model = when {
            source == "on_device" -> models.device
            source == "in_cloud" || mode == SdkMode.ONLY_IN_CLOUD -> models.cloud
            mode == SdkMode.ONLY_ON_DEVICE -> models.device
            else -> ""
        }
        val outcome = when (r) {
            is Result.Ok -> "ok"
            is Result.Withdrawn -> "withdrawn"
            is Result.Failed -> if (r.failure == CallFailure.REFUSED) "refused" else "failed"
        }
        return linkedMapOf("source" to source, "mode" to modeName(mode), "model" to value(model), "outcome" to outcome)
    }

    /**
     * Runs one SDK call inside a trace. The call's own result or error reaches the caller unchanged, and a
     * trace that cannot be started or finished is dropped: telemetry never breaks the read it describes.
     */
    suspend fun <T> traced(
        sink: AiTraceSink,
        mode: SdkMode,
        models: Models,
        sourceOf: (T) -> InferenceSource,
        nanoTime: () -> Long = System::nanoTime,
        call: suspend () -> T,
    ): T {
        val trace = runCatching { sink.start() }.getOrNull()
        val t0 = nanoTime()
        fun finish(r: Result) {
            val ms = (nanoTime() - t0) / 1_000_000
            runCatching { trace?.finish(attributes(mode, models, r), ms) }
        }
        val out = try {
            call()
        } catch (e: CancellationException) {
            finish(Result.Withdrawn)
            throw e
        } catch (e: Exception) {
            finish(Result.Failed(AiMapping.failure(e)))
            throw e
        }
        finish(Result.Ok(runCatching { sourceOf(out) }.getOrNull()))
        return out
    }

    private fun modeName(m: SdkMode) = when (m) {
        SdkMode.PREFER_ON_DEVICE -> "prefer_on_device"
        SdkMode.ONLY_ON_DEVICE -> "only_on_device"
        SdkMode.ONLY_IN_CLOUD -> "only_in_cloud"
    }

    /** Performance Monitoring drops an attribute whose value is empty or longer than 100 characters. */
    private fun value(s: String) = if (s.isEmpty()) "unknown" else s.take(100)
}
