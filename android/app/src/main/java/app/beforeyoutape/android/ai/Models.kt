package app.beforeyoutape.android.ai

import app.beforeyoutape.android.capture.CropImage
import app.beforeyoutape.engine.ItemReadWire

enum class Source { ON_DEVICE, IN_CLOUD }

enum class DeviceModelStatus { AVAILABLE, DOWNLOADABLE, DOWNLOADING, UNAVAILABLE, UNKNOWN }

/** The three SDK modes the app uses. PREFER_IN_CLOUD is never used. */
/** The on-device model's download, as the app reports it. */
sealed interface ModelDownload {
    data class Started(val bytesToDownload: Long) : ModelDownload
    data class Progress(val bytesDownloaded: Long) : ModelDownload
    data object Done : ModelDownload
    data class Failed(val message: String?) : ModelDownload
}

enum class SdkMode { PREFER_ON_DEVICE, ONLY_ON_DEVICE, ONLY_IN_CLOUD }

/** A model's reply: the read (null when the model gave nothing usable), where it ran, and how long it took. */
data class ModelReply(val read: ItemReadWire?, val source: Source, val latencyMs: Long)

/** One label read. The prompt is the shared prompt text; the crop is the only image sent. */
fun interface LabelModel {
    suspend fun read(mode: SdkMode, crop: CropImage, prompt: String): ModelReply
}

/** kill_cloud is on, or Remote Config gave no cloud model: no cloud call may start. */
class CloudPausedException : Exception("cloud reads are paused")

/** How a model call failed, in the app's own terms: what the read rules need to decide on a retry. */
enum class CallFailure {
    /** Network error, 429 or 5xx: retried once. */
    TRANSIENT,
    /** The model or its safety filters refused: never retried; three in a row pause the run. */
    REFUSED,
    /** The on-device model failed or is not there. */
    DEVICE,
    /** Anything else (for example App Check refused): not retried. */
    OTHER,
}

class ModelCallException(val failure: CallFailure, cause: Throwable?) : Exception(cause)
