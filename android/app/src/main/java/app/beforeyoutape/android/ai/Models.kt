package app.beforeyoutape.android.ai

import app.beforeyoutape.android.capture.CropImage
import app.beforeyoutape.engine.ItemReadWire

enum class Source { ON_DEVICE, IN_CLOUD }

enum class DeviceModelStatus { AVAILABLE, DOWNLOADABLE, DOWNLOADING, UNAVAILABLE, UNKNOWN }

/** The three SDK modes the app uses. PREFER_IN_CLOUD is never used. */
enum class SdkMode { PREFER_ON_DEVICE, ONLY_ON_DEVICE, ONLY_IN_CLOUD }

/** A model's reply: the read (null when the model gave nothing usable), where it ran, and how long it took. */
data class ModelReply(val read: ItemReadWire?, val source: Source, val latencyMs: Long)

/** One label read. The prompt is the shared prompt text; the crop is the only image sent. */
fun interface LabelModel {
    suspend fun read(mode: SdkMode, crop: CropImage, prompt: String): ModelReply
}

/** kill_cloud is on, or Remote Config gave no cloud model: no cloud call may start. */
class CloudPausedException : Exception("cloud reads are paused")
