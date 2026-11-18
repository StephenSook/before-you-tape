package app.beforeyoutape.android.ai

import app.beforeyoutape.engine.ItemReadWire
import com.google.firebase.ai.InferenceMode
import com.google.firebase.ai.InferenceSource
import com.google.firebase.ai.OnDeviceModelOption
import com.google.firebase.ai.OnDeviceModelStatus
import com.google.firebase.ai.type.PublicPreviewAPI

/** Pure translations between the SDK's types and the app's. */
@OptIn(PublicPreviewAPI::class)
object AiMapping {
    fun status(s: OnDeviceModelStatus?): DeviceModelStatus = when (s) {
        OnDeviceModelStatus.AVAILABLE -> DeviceModelStatus.AVAILABLE
        OnDeviceModelStatus.DOWNLOADABLE -> DeviceModelStatus.DOWNLOADABLE
        OnDeviceModelStatus.DOWNLOADING -> DeviceModelStatus.DOWNLOADING
        OnDeviceModelStatus.UNAVAILABLE -> DeviceModelStatus.UNAVAILABLE
        else -> DeviceModelStatus.UNKNOWN
    }

    fun mode(m: SdkMode): InferenceMode = when (m) {
        SdkMode.PREFER_ON_DEVICE -> InferenceMode.PREFER_ON_DEVICE
        SdkMode.ONLY_ON_DEVICE -> InferenceMode.ONLY_ON_DEVICE
        SdkMode.ONLY_IN_CLOUD -> InferenceMode.ONLY_IN_CLOUD
    }

    fun source(s: InferenceSource): Source = if (s == InferenceSource.ON_DEVICE) Source.ON_DEVICE else Source.IN_CLOUD

    /** The Remote Config option string; anything unknown is the stable model. */
    fun modelOption(option: String): OnDeviceModelOption = when (option) {
        "preview" -> OnDeviceModelOption.PREVIEW
        "preview_fast" -> OnDeviceModelOption.PREVIEW_FAST
        else -> OnDeviceModelOption.STABLE
    }

    fun read(obj: LabelRead?): ItemReadWire? = obj?.toWire()
}
