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
}
