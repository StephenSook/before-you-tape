package app.beforeyoutape.android.live

import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import app.beforeyoutape.android.config.FirebaseRcSource
import app.beforeyoutape.android.config.RcStore
import com.google.firebase.Firebase
import com.google.firebase.remoteconfig.remoteConfig
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

/** Against the deployed project: once Remote Config's server values are active, the cloud opens (kill_cloud is false there). */
@Live
@RunWith(AndroidJUnit4::class)
class RcFetchLiveTest {
    @Test fun theCloudOpensOnceTheServerValuesAreActive(): Unit = runBlocking {
        InstrumentationRegistry.getInstrumentation().targetContext
        val source = FirebaseRcSource(Firebase.remoteConfig)
        val store = RcStore(source)
        InstrumentationRegistry.getInstrumentation().runOnMainSync { store.start() }
        val opened = withTimeout(60_000) { store.values.first { !it.killCloud } }
        assertEquals(false, opened.killCloud)
        Log.i("BYT-PROBE", "remote config fetched=${source.fetchedActive()} killCloud=${opened.killCloud}")
    }
}
