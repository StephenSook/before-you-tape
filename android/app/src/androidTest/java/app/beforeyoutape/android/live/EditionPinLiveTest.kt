package app.beforeyoutape.android.live

import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import app.beforeyoutape.android.engine.EngineAssets
import app.beforeyoutape.android.engine.PublishedEditions
import app.beforeyoutape.engine.EditionCheck
import app.beforeyoutape.engine.EditionChoice
import app.beforeyoutape.engine.EditionPin
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Against the deployed project: the bundled edition verifies on the phone's own JavaScript runtime,
 * and a pin naming an edition that is not published reads nothing through the deployed rules and
 * keeps the built-in edition with the web's words.
 */
@Live
@RunWith(AndroidJUnit4::class)
class EditionPinLiveTest {
    private val ctx = InstrumentationRegistry.getInstrumentation().targetContext

    @Test fun aPinToAnUnpublishedEditionKeepsTheBuiltInOne(): Unit = runBlocking {
        val bundled = EngineAssets.load(ctx).use { requireNotNull(EditionCheck.verify(it, EngineAssets.edition(ctx))) }
        assertEquals(EngineAssets.editionId(ctx), bundled.editionId)
        assertTrue(Regex("[0-9a-f]{64}").matches(bundled.sha256))
        Log.i("BYT-PROBE", "bundled edition verified on the phone: revision=${bundled.revision}")

        val missing = "byt-not-published-pin-check"
        assertNull(withTimeout(30_000) { PublishedEditions.fetch(missing) })
        Log.i("BYT-PROBE", "unpublished edition: the deployed rules allowed the read and nothing was there")

        val choice = withTimeout(30_000) {
            EditionPin.choose(bundled, bundled, missing, "a".repeat(64), PublishedEditions::fetch) { json ->
                EngineAssets.load(ctx).use { EditionCheck.verify(it, json) }
            }
        }
        assertEquals(EditionChoice(bundled, EditionPin.NOT_LOADED), choice)
        Log.i("BYT-PROBE", "pin to an unpublished edition: kept the built-in edition")
    }
}
