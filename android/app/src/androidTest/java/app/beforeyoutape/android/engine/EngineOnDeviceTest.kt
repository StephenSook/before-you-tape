package app.beforeyoutape.android.engine

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import app.beforeyoutape.engine.EngineError
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class EngineOnDeviceTest {
    private val context = InstrumentationRegistry.getInstrumentation().targetContext

    /** The app's own QuickJS loads the bundled rules from its assets, checked against the build manifest. */
    @Test fun theAssetBundleLoadsAndItsHashMatchesTheManifest() {
        EngineAssets.load(context).use { host ->
            val editionId = Json.parseToJsonElement(context.assets.open("engine/edition.json").bufferedReader().readText())
                .jsonObject.getValue("editionId").jsonPrimitive.content
            assertEquals(editionId, host.setEdition(context.assets.open("engine/edition.json").bufferedReader().readText()).editionId)
            assertTrue(host.labelTags("Li-ion 3.7V 5000mAh 18.5Wh POWER BANK").isNotEmpty())
        }
    }

    @Test fun aBundleThatDoesNotMatchItsManifestIsRefusedOnTheDevice() {
        val e = assertThrows(EngineError::class.java) { EngineAssets.load(context, expectedSha256 = "0".repeat(64)) }
        assertEquals("BundleMismatch", e.errorName)
    }
}
