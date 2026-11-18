package app.beforeyoutape.android.ai

import com.google.firebase.ai.InferenceMode
import com.google.firebase.ai.InferenceSource
import com.google.firebase.ai.OnDeviceModelOption
import com.google.firebase.ai.OnDeviceModelStatus
import com.google.firebase.ai.type.PublicPreviewAPI
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Test

@OptIn(PublicPreviewAPI::class)
class AiMappingTest {
    @Test fun everySdkStatusMapsToOurs() {
        assertEquals(DeviceModelStatus.AVAILABLE, AiMapping.status(OnDeviceModelStatus.AVAILABLE))
        assertEquals(DeviceModelStatus.DOWNLOADABLE, AiMapping.status(OnDeviceModelStatus.DOWNLOADABLE))
        assertEquals(DeviceModelStatus.DOWNLOADING, AiMapping.status(OnDeviceModelStatus.DOWNLOADING))
        assertEquals(DeviceModelStatus.UNAVAILABLE, AiMapping.status(OnDeviceModelStatus.UNAVAILABLE))
        assertEquals(DeviceModelStatus.UNKNOWN, AiMapping.status(null))
    }

    @Test fun aNullObjectBecomesANullRead() {
        assertNull(AiMapping.read(null))
    }

    @Test fun everyModelOptionStringMapsToAnSdkOption() {
        assertSame(OnDeviceModelOption.STABLE, AiMapping.modelOption("stable"))
        assertSame(OnDeviceModelOption.PREVIEW, AiMapping.modelOption("preview"))
        assertSame(OnDeviceModelOption.PREVIEW_FAST, AiMapping.modelOption("preview_fast"))
        assertSame(OnDeviceModelOption.STABLE, AiMapping.modelOption("anything else"))
    }

    @Test fun everyModeAndSourceMaps() {
        assertSame(InferenceMode.PREFER_ON_DEVICE, AiMapping.mode(SdkMode.PREFER_ON_DEVICE))
        assertSame(InferenceMode.ONLY_ON_DEVICE, AiMapping.mode(SdkMode.ONLY_ON_DEVICE))
        assertSame(InferenceMode.ONLY_IN_CLOUD, AiMapping.mode(SdkMode.ONLY_IN_CLOUD))
        assertEquals(Source.ON_DEVICE, AiMapping.source(InferenceSource.ON_DEVICE))
        assertEquals(Source.IN_CLOUD, AiMapping.source(InferenceSource.IN_CLOUD))
    }

    /** The SDK's exception constructors are Kotlin-internal but public on the JVM; build them by reflection. */
    private fun sdk(name: String, vararg args: Any?): Throwable {
        val c = Class.forName("com.google.firebase.ai.type.$name")
        val types = when (args.size) {
            2 -> arrayOf(String::class.java, Throwable::class.java)
            else -> arrayOf(String::class.java, Throwable::class.java, List::class.java)
        }
        return c.getConstructor(*types).newInstance(*args) as Throwable
    }

    @Test fun everyFailureKindMaps() {
        assertEquals(CallFailure.TRANSIENT, AiMapping.failure(sdk("ServerException", "503", null)))
        assertEquals(CallFailure.TRANSIENT, AiMapping.failure(sdk("QuotaExceededException", "429", null)))
        assertEquals(CallFailure.TRANSIENT, AiMapping.failure(sdk("RequestTimeoutException", "timeout", null, emptyList<Any>())))
        assertEquals(CallFailure.TRANSIENT, AiMapping.failure(java.net.UnknownHostException("no network")))
        assertEquals(CallFailure.TRANSIENT, AiMapping.failure(java.io.IOException("reset")))
        assertEquals(CallFailure.REFUSED, AiMapping.failure(sdk("ContentBlockedException", "blocked", null)))
        assertEquals(CallFailure.OTHER, AiMapping.failure(sdk("PermissionMissingException", "App Check", null)))
        assertEquals(CallFailure.OTHER, AiMapping.failure(sdk("InvalidAPIKeyException", "key", null)))
        assertEquals(CallFailure.OTHER, AiMapping.failure(IllegalStateException("anything else")))
    }
}
