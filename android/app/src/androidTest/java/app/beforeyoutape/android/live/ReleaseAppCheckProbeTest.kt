package app.beforeyoutape.android.live

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.beforeyoutape.android.AppCheckSetup
import app.beforeyoutape.android.R
import app.beforeyoutape.android.ai.AiClient
import app.beforeyoutape.android.ai.CloudState
import app.beforeyoutape.android.ai.ItemReader
import app.beforeyoutape.android.ai.ReadOutcome
import app.beforeyoutape.android.ai.Source
import app.beforeyoutape.android.data.FirebaseSignIn
import app.beforeyoutape.android.engine.EngineAssets
import app.beforeyoutape.engine.ItemCategoryWire
import androidx.test.platform.app.InstrumentationRegistry
import app.beforeyoutape.android.ai.Prompts
import app.beforeyoutape.android.capture.BitmapCrop
import app.beforeyoutape.android.config.RcValues
import com.google.firebase.Firebase
import com.google.firebase.appcheck.appCheck
import com.google.firebase.remoteconfig.remoteConfig
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeout
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Release only (-Pbyt.testBuildType=release): does the release provider pass on this device? Logs
 * BYT-PROBE lines with the outcome and error text, never a token. Then one read through the app's
 * own reader (signed in, cloud route, the web app's parser), which must come back from the cloud as a
 * power bank: App Check enforcement on AI Logic accepts it only with a valid token.
 */
@Live
@RunWith(AndroidJUnit4::class)
class ReleaseAppCheckProbeTest {
    private fun log(s: String) = Log.i("BYT-PROBE", s)

    private fun drawnLabel(): Bitmap = Bitmap.createBitmap(800, 300, Bitmap.Config.ARGB_8888).also { b ->
        val c = Canvas(b)
        c.drawColor(Color.WHITE)
        val p = Paint().apply { color = Color.BLACK; textSize = 52f; isAntiAlias = true }
        c.drawText("POWER BANK", 40f, 110f, p)
        c.drawText("Li-ion 3.7V 5000mAh 18.5Wh", 40f, 200f, p)
    }

    @Test fun theReleaseProviderGetsATokenAndACloudReadIsAccepted(): Unit = runBlocking {
        assumeTrue("release builds only", AppCheckSetup.PROVIDER != "debug")
        val token = runCatching { withTimeout(60_000) { Firebase.appCheck.getLimitedUseAppCheckToken().await() } }
        token.fold(
            onSuccess = { log("appcheck release provider=${AppCheckSetup.PROVIDER} ok length=${it.token.length}") },
            onFailure = { log("appcheck release provider=${AppCheckSetup.PROVIDER} error=${it::class.simpleName}: ${it.message}") },
        )
        // The app's own shared sign-in: cloud requests carry its ID token.
        val signedIn = runCatching { withTimeout(30_000) { FirebaseSignIn.ensureSignedIn() } }
        log("signin ${if (signedIn.isSuccess) "ok" else "error=${signedIn.exceptionOrNull()?.message}"}")
        val remote = Firebase.remoteConfig
        remote.setDefaultsAsync(R.xml.remote_config_defaults).await()
        runCatching { remote.fetchAndActivate().await() }
        val values = RcValues.parse(remote.all.mapValues { it.value.asString() })
        // The production read path: the app's reader with the web app's own parser from the bundled engine.
        val host = EngineAssets.load(InstrumentationRegistry.getInstrumentation().targetContext)
        val client = AiClient { values }
        val reader = ItemReader(
            model = client, parse = { host.parseItemRead(it) }, gate = { client.deviceStatus() },
            cloud = { CloudState(consent = true, online = true, killCloud = values.killCloud) },
            prompt = { Prompts.ITEM_READ_PROMPT }, signIn = { FirebaseSignIn.ensureSignedIn() },
        )
        val outcome = withTimeout(120_000) { reader.read(BitmapCrop(drawnLabel())) }
        host.close()
        val read = outcome as? ReadOutcome.Read
        log("read outcome=${outcome::class.simpleName} source=${read?.source} route=${read?.route} category=${read?.read?.category}")
        check(token.isSuccess) { "no App Check token from the release provider on this device" }
        check(signedIn.isSuccess) { "sign-in failed" }
        check(read != null && read.source == Source.IN_CLOUD && read.read.category == ItemCategoryWire.power_bank) {
            "the cloud read of the drawn power bank label did not succeed: $outcome"
        }
    }
}
