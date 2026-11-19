package app.beforeyoutape.android.engine

import android.os.Build
import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/** Every shared vector, in the app's own runtime on this device: the bundled, manifest-checked engine. */
@RunWith(AndroidJUnit4::class)
class DeviceVectorsTest {
    private val host = EngineAssets.load(InstrumentationRegistry.getInstrumentation().targetContext)

    @Test fun everySharedVectorPassesInTheAppRuntime() {
        val box = DeviceVectors.box.flatMap { DeviceVectors.checkBox(host, it) }
        val guards = DeviceVectors.guards.flatMap { DeviceVectors.checkBox(host, it) }
        val destinations = DeviceVectors.destinations.mapNotNull { DeviceVectors.checkDestination(host, it) }
        assertEquals(emptyList<String>(), box + guards + destinations)
        val counts = listOf(DeviceVectors.box.size, DeviceVectors.guards.size, DeviceVectors.destinations.size)
        assertTrue("every file has vectors: $counts", counts.all { it > 0 })
        Log.i("BYT-PARITY", "device=${Build.MODEL} sdk=${Build.VERSION.SDK_INT} box=${counts[0]} guards=${counts[1]} destinations=${counts[2]} all passed")
        host.close()
    }

    /** A wrong expectation planted in one vector is reported, so the run above cannot pass by checking nothing. */
    @Test fun aPlantedWrongExpectationIsReported() {
        val v = DeviceVectors.box.first()
        val expect = v.getValue("expect").jsonObject
        val (id, level) = expect.entries.first()
        val wrong = if ((level as JsonPrimitive).content == "ok") "take_out" else "ok"
        val planted = JsonObject(v + ("expect" to JsonObject(expect + (id to JsonPrimitive(wrong)))))
        assertEquals(1, DeviceVectors.checkBox(host, planted).size)
        host.close()
    }
}
