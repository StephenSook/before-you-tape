package app.beforeyoutape.android.ai

import com.google.firebase.Firebase
import com.google.firebase.perf.performance

/**
 * The app's trace sink: one Firebase Performance Monitoring custom trace per AI Logic call (ai/AiTrace.kt),
 * started before the call and stopped after it. Debug builds turn Performance Monitoring off in their manifest.
 */
class FirebaseAiTraceSink : AiTraceSink {
    override fun start(): AiCallTrace {
        val trace = Firebase.performance.newTrace(AiTrace.NAME)
        trace.start()
        return AiCallTrace { attributes, latencyMs ->
            attributes.forEach { (k, v) -> trace.putAttribute(k, v) }
            trace.putMetric(AiTrace.LATENCY, latencyMs)
            trace.stop()
        }
    }
}
