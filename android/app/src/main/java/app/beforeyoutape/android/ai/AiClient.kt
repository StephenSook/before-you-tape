package app.beforeyoutape.android.ai

import app.beforeyoutape.android.capture.BitmapCrop
import app.beforeyoutape.android.capture.CropImage
import app.beforeyoutape.android.config.RcValues
import com.google.firebase.Firebase
import com.google.firebase.ai.FirebaseAI
import com.google.firebase.ai.InferenceMode
import com.google.firebase.ai.OnDeviceConfig
import com.google.firebase.ai.ai
import com.google.firebase.ai.type.GenerativeBackend
import com.google.firebase.ai.type.PublicPreviewAPI
import com.google.firebase.ai.type.content
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map

/**
 * Every Firebase AI Logic call in the app goes through this file, on the Gemini Developer API
 * backend, with App Check (limited-use tokens behind Remote Config). The model name comes from
 * Remote Config. A cloud-capable read refuses to start while kill_cloud is on or no cloud model
 * is set; the route guard in front of it decides whether the cloud may be used at all.
 */
@OptIn(PublicPreviewAPI::class)
class AiClient(private val rc: () -> RcValues) : LabelModel {

    private fun ai(v: RcValues): FirebaseAI = Firebase.ai(
        backend = GenerativeBackend.googleAI(),
        useLimitedUseAppCheckTokens = v.useLimitedUseTokens,
    )

    private fun model(v: RcValues, mode: InferenceMode) = ai(v).generativeModel(
        modelName = v.cloudModelItem.ifEmpty { NO_CLOUD_MODEL },
        systemInstruction = content { text(Prompts.ITEM_READ_SYSTEM) },
        onDeviceConfig = OnDeviceConfig(mode = mode, modelOption = AiMapping.modelOption(v.onDeviceModelOption)),
    )

    override suspend fun read(mode: SdkMode, crop: CropImage, prompt: String): ModelReply {
        val bitmap = (crop as? BitmapCrop)?.bitmap ?: throw IllegalArgumentException("a read needs a bitmap crop")
        val v = rc()
        if (mode != SdkMode.ONLY_ON_DEVICE && (v.killCloud || v.cloudModelItem.isEmpty())) throw CloudPausedException()
        val t0 = System.nanoTime()
        val r = try {
            model(v, AiMapping.mode(mode)).generateObject(
                LabelRead.firebaseAISchema(),
                content {
                    image(bitmap)
                    text(prompt)
                },
            )
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (e: Exception) {
            // The reader decides on retries from the app's own failure kinds, not from SDK classes.
            throw ModelCallException(AiMapping.failure(e), e)
        }
        val obj = runCatching { r.getObject() }.getOrNull()
        return ModelReply(AiMapping.read(obj), AiMapping.source(r.response.inferenceSource), (System.nanoTime() - t0) / 1_000_000)
    }

    /** Downloads the on-device model (when its status is DOWNLOADABLE), reporting each step. */
    fun downloadModel(): Flow<ModelDownload> =
        model(rc(), InferenceMode.PREFER_ON_DEVICE).onDeviceExtension?.download()?.map(AiMapping::download)
            ?: flowOf(ModelDownload.Failed("this phone has no on-device model"))

    /** checkStatus() for the route guard and "About this phone". */
    suspend fun deviceStatus(): DeviceModelStatus = try {
        AiMapping.status(model(rc(), InferenceMode.PREFER_ON_DEVICE).onDeviceExtension?.checkStatus())
    } catch (e: kotlinx.coroutines.CancellationException) {
        throw e
    } catch (e: Exception) {
        DeviceModelStatus.UNKNOWN
    }

    private companion object {
        /** Used only when no cloud model is set, so the SDK can build an on-device-only model. */
        const val NO_CLOUD_MODEL = "none"
    }
}
