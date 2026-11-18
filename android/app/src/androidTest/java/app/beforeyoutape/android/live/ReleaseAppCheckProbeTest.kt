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
import app.beforeyoutape.android.ai.Prompts
import app.beforeyoutape.android.ai.SdkMode
import app.beforeyoutape.android.capture.BitmapCrop
import app.beforeyoutape.android.config.RcValues
import com.google.firebase.Firebase
import com.google.firebase.appcheck.appCheck
import com.google.firebase.auth.auth
import com.google.firebase.remoteconfig.remoteConfig
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeout
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Release only (-Pbyt.testBuildType=release): does the release provider pass on this device? Logs
 * BYT-PROBE lines with the outcome and error text, never a token. Then one cloud read, which App
 * Check enforcement on AI Logic accepts only with a valid token.
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
        val signedIn = runCatching { withTimeout(30_000) { Firebase.auth.currentUser ?: Firebase.auth.signInAnonymously().await().user } }
        log("signin ${if (signedIn.isSuccess) "ok" else "error=${signedIn.exceptionOrNull()?.message}"}")
        val remote = Firebase.remoteConfig
        remote.setDefaultsAsync(R.xml.remote_config_defaults).await()
        runCatching { remote.fetchAndActivate().await() }
        val values = RcValues.parse(remote.all.mapValues { it.value.asString() })
        val reply = runCatching {
            withTimeout(90_000) { AiClient { values }.read(SdkMode.ONLY_IN_CLOUD, BitmapCrop(drawnLabel()), Prompts.ITEM_READ_PROMPT) }
        }
        reply.fold(
            onSuccess = { log("cloud read ok source=${it.source} latencyMs=${it.latencyMs} category=${it.read?.category}") },
            onFailure = { log("cloud read error=${it::class.simpleName}: ${(it.cause?.message ?: it.message)?.take(300)}") },
        )
        check(token.isSuccess && reply.isSuccess) { "the release provider did not pass on this device" }
    }
}
