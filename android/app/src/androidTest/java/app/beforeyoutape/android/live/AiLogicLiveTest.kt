package app.beforeyoutape.android.live

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.beforeyoutape.android.R
import app.beforeyoutape.android.ai.AiClient
import app.beforeyoutape.android.ai.Prompts
import app.beforeyoutape.android.ai.SdkMode
import app.beforeyoutape.android.ai.Source
import app.beforeyoutape.android.capture.BitmapCrop
import app.beforeyoutape.android.config.RcValues
import com.google.firebase.Firebase
import com.google.firebase.remoteconfig.remoteConfig
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.tasks.await
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test
import org.junit.runner.RunWith

@Live
@RunWith(AndroidJUnit4::class)
class AiLogicLiveTest {
    private fun drawnLabel(): Bitmap {
        val b = Bitmap.createBitmap(800, 300, Bitmap.Config.ARGB_8888)
        val c = Canvas(b)
        c.drawColor(Color.WHITE)
        val p = Paint().apply { color = Color.BLACK; textSize = 52f; isAntiAlias = true }
        c.drawText("POWER BANK", 40f, 110f, p)
        c.drawText("Li-ion 3.7V 5000mAh 18.5Wh", 40f, 200f, p)
        return b
    }

    /** One cloud read of a drawn battery label through the app's own client and the web's prompt and system lines, with the in-app Remote Config defaults. */
    @Test fun aCloudReadOfADrawnBatteryLabelAnswers(): Unit = runBlocking {
        val remote = Firebase.remoteConfig
        remote.setDefaultsAsync(R.xml.remote_config_defaults).await()
        runCatching { remote.fetchAndActivate().await() }
        val values = RcValues.parse(remote.all.mapValues { it.value.asString() })
        val reply = AiClient { values }.read(
            SdkMode.ONLY_IN_CLOUD,
            BitmapCrop(drawnLabel()),
            Prompts.ITEM_READ_PROMPT,
        )
        Log.i("BYT-PROBE", "cloud read source=${reply.source} latencyMs=${reply.latencyMs} category=${reply.read?.category} batteryWords=${reply.read?.batteryWords} wh=${reply.read?.wattHours} evidence=${reply.read?.evidence}")
        assertEquals(Source.IN_CLOUD, reply.source)
        assertNotNull("the reply had no read", reply.read)
    }
}
